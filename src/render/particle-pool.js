// ============================================================================
// render/particle-pool.js — 객체 풀링 파티클 시스템 (60fps 유지용)
//
// 다중 이펙트가 동시에 터져도 프레임을 떨어뜨리지 않도록:
//   1) 파티클 객체를 미리 할당해 재사용한다(런타임 GC 압력 0).
//   2) 입자는 shadowBlur(느림) 대신 색마다 한 번 구운 글로우 스프라이트를
//      drawImage + 가산 합성('lighter')으로 그린다 → 네온 발광이 겹치며 밝아진다.
//
// 색·크기는 호출자(effects-layer)가 토큰에서 읽어 넘긴다. 이 모듈은 시뮬레이션과
// 드로잉만 한다. 물리 상수(중력·마찰)는 감각 튜닝값이라 디자인 토큰이 아니다.
// ============================================================================

// --- 시뮬레이션 튜닝 상수 (디자인 토큰 아님 — 물리 느낌값) ---
const GRAVITY = 0.0014; // px/ms² (백킹 px) — 약한 중력으로 위로 솟구쳤다 떨어짐
const DRAG = 0.0016; // 속도 감쇠(1/ms)
const DEFAULT_POOL = 600; // 풀 크기(성능/메모리 설정값)

/** 색 문자열마다 글로우 스프라이트(offscreen canvas)를 한 번 구워 캐시한다. */
class GlowSpriteCache {
  constructor() {
    this.map = new Map();
  }
  /** 반경 r(px)의 부드러운 발광 원판 스프라이트를 얻는다. */
  get(color, r) {
    // 반경을 8px 버킷으로 양자화해 스프라이트 수를 제한(품질 손실 미미).
    const bucket = Math.max(4, Math.ceil(r / 8) * 8);
    const key = color + '|' + bucket;
    let sprite = this.map.get(key);
    if (sprite) return sprite;
    const size = bucket * 2;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(bucket, bucket, 0, bucket, bucket, bucket);
    // 코어는 흰빛에 가깝게, 바깥은 자기 색으로 번지다 투명.
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(bucket, bucket, bucket, 0, Math.PI * 2);
    c.fill();
    sprite = { cv, bucket };
    this.map.set(key, sprite);
    return sprite;
  }
  clear() {
    this.map.clear();
  }
}

export class ParticlePool {
  /** @param {number} [capacity] 사전 할당 입자 수 */
  constructor(capacity = DEFAULT_POOL) {
    this.capacity = capacity;
    this.pool = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.pool[i] = {
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 4,
        color: '#fff',
        gravityScale: 1,
      };
    }
    this.liveCount = 0;
    this.sprites = new GlowSpriteCache();
  }

  /** 현재 살아있는 입자가 있는가(레이어가 드로잉 생략 판단에 쓴다). */
  get hasLive() {
    return this.liveCount > 0;
  }

  /**
   * 입자 1개 방출. 풀이 가득 차면 조용히 버린다(프레임 보호 우선).
   * @param {object} p
   * @param {number} p.x @param {number} p.y       시작 좌표(백킹 px)
   * @param {number} p.vx @param {number} p.vy     초기 속도(px/ms)
   * @param {number} p.life                          수명(ms)
   * @param {number} p.size                          입자 반경(백킹 px)
   * @param {string} p.color                         색(토큰에서 온 값)
   * @param {number} [p.gravityScale=1]              중력 배율(0이면 무중력)
   */
  spawn(p) {
    for (let i = 0; i < this.capacity; i++) {
      const part = this.pool[i];
      if (part.active) continue;
      part.active = true;
      part.x = p.x;
      part.y = p.y;
      part.vx = p.vx;
      part.vy = p.vy;
      part.life = p.life;
      part.maxLife = p.life;
      part.size = p.size;
      part.color = p.color;
      part.gravityScale = p.gravityScale == null ? 1 : p.gravityScale;
      this.liveCount++;
      return;
    }
    // 풀 소진: 드랍(과부하 시 프레임을 지키는 게 우선).
  }

  /** dt(ms)만큼 시뮬레이션을 전진시킨다. */
  update(dt) {
    if (this.liveCount === 0) return;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.liveCount--;
        continue;
      }
      const drag = 1 - Math.min(1, DRAG * dt);
      p.vx *= drag;
      p.vy = p.vy * drag + GRAVITY * p.gravityScale * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /** 살아있는 입자를 가산 합성으로 그린다. ctx 상태는 호출자가 save/restore. */
  draw(ctx) {
    if (this.liveCount === 0) return;
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      const t = p.life / p.maxLife; // 1 → 0
      // 수명 후반에 빠르게 사그라들도록 알파를 제곱 감쇠.
      ctx.globalAlpha = t * t;
      const r = p.size * (0.6 + 0.4 * t); // 사라지며 약간 수축
      const sprite = this.sprites.get(p.color, r);
      const d = r * 2;
      ctx.drawImage(sprite.cv, p.x - r, p.y - r, d, d);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = prevOp;
  }

  /** 모든 입자를 즉시 회수(재시작 등). */
  reset() {
    for (let i = 0; i < this.capacity; i++) this.pool[i].active = false;
    this.liveCount = 0;
  }
}
