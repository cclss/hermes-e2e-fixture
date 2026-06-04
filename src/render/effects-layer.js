// ============================================================================
// render/effects-layer.js — 게임 주스(이펙트) 렌더 레이어 + 재사용 API
//
// 보드 렌더 위에 얹히는 별도 레이어. 게임 로직(엔진)은 전혀 모르고, 게임 세션이
// 엔진 이벤트를 받아 이 레이어의 API를 호출한다. 강도는 effect/*, 시간·이징은
// motion/*, 색·글로우는 color/*·shadow/* 토큰을 소비한다(하드코딩 금지).
//
// 공개 API (g7 대전 공격 연출이 재사용):
//   triggerLineClear(payload) · shake(stage) · burst(col,row,opts) · flash(opts)
//   triggerHardDrop(info) · setDanger(on) · triggerKO() · triggerTSpin(payload)
//
// 성능: 단일 rAF(게임 세션이 update(dt)를 부른다) · 파티클 풀링 · 가산 합성
// 스프라이트 · 활성 이펙트가 없으면 캔버스 클리어/드로잉을 생략한다.
//
// 좌표: FX 캔버스는 보드 Surface를 정확히 덮으므로 보드 렌더러와 같은 셀 기하
// (cell = min(w/cols, h/rows), 중앙 정렬)를 복제한다. 라인 인덱스는 절대 좌표라
// 가시행 = 절대행 - bufferRows로 변환한다(board-renderer와 동일 규칙).
// ============================================================================

import { ParticlePool } from './particle-pool.js';
import { MotionTokens } from './motion.js';

function readToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function readNum(name) {
  return parseFloat(readToken(name)) || 0;
}

const HALF_PI = Math.PI / 2;

export class EffectsLayer {
  /**
   * @param {object} cfg
   * @param {HTMLCanvasElement} cfg.canvas       FX 캔버스(Surface를 덮는 오버레이)
   * @param {HTMLElement} cfg.shakeTarget        셰이크 트랜스폼을 받을 요소(Surface)
   * @param {number} cfg.cols                    가시 열 수(10)
   * @param {number} cfg.rows                    가시 행 수(20)
   * @param {number} cfg.bufferRows              상단 버퍼 행 수
   * @param {import('./palette.js').Palette} cfg.palette
   */
  constructor(cfg) {
    this.canvas = cfg.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.shakeTarget = cfg.shakeTarget || null;
    this.cols = cfg.cols;
    this.rows = cfg.rows;
    this.bufferRows = cfg.bufferRows;
    this.palette = cfg.palette;
    this.motion = new MotionTokens();
    this.particles = new ParticlePool();

    // 활성 이펙트 상태(작은 배열로 유지).
    this.flashes = []; // {color, alpha, life, maxLife}
    this.dissolves = []; // {rv, color, life, maxLife}
    this.trails = []; // {streaks:[{x,y0,y1}], color, life, maxLife}
    this.rings = []; // {x, y, color, life, maxLife, maxR}
    this.shakeState = null; // {amp, life, maxLife}

    this.cell = 0;
    this.dpr = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this._dirty = false; // 마지막 프레임에 무언가 그렸는가(클리어 생략 판단)
    this._danger = false;
    this._surgeTimer = null;

    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._refreshTokens();
    this.resize();
  }

  /** 토큰 값(effect/color) 재해석. 폰트/테마 로드 후 호출. */
  _refreshTokens() {
    this.motion.refresh();
    this.shakeAmp = [
      0,
      readNum('--shake-amp-1'),
      readNum('--shake-amp-2'),
      readNum('--shake-amp-3'),
      readNum('--shake-amp-4'),
    ];
    this.flashOpacity = {
      low: readNum('--flash-opacity-low'),
      mid: readNum('--flash-opacity-mid'),
      high: readNum('--flash-opacity-high'),
      ko: readNum('--flash-opacity-ko'),
    };
    this.particleSize = {
      sm: readNum('--particle-size-sm'),
      md: readNum('--particle-size-md'),
      lg: readNum('--particle-size-lg'),
    };
    this.burstCount = [
      0,
      readNum('--burst-count-1'),
      readNum('--burst-count-2'),
      readNum('--burst-count-3'),
      readNum('--burst-count-4'),
    ];
    this.trailOpacity = readNum('--trail-opacity');
    this.colors = {
      comboFlash: readToken('--combo-flash'),
      comboFlashHot: readToken('--combo-flash-hot'),
      koFlash: readToken('--ko-flash'),
      danger: readToken('--danger'),
      spark: readToken('--particle-spark'),
      gold: readToken('--particle-gold'),
      neon: readToken('--particle-neon'),
      magenta: readToken('--particle-magenta'),
    };
  }

  /** 폰트/테마 로드 후 토큰 재해석. */
  refresh() {
    this._refreshTokens();
  }

  /** FX 캔버스 백킹스토어를 표시 크기 × dpr로 맞춘다(보드 렌더러와 동일 기하). */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const cssW = rect.width || this.canvas.clientWidth || 300;
    const cssH = rect.height || this.canvas.clientHeight || 600;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.cell = Math.min(w / this.cols, h / this.rows);
    this.offsetX = (w - this.cell * this.cols) / 2;
    this.offsetY = (h - this.cell * this.rows) / 2;
  }

  // ---- 좌표 헬퍼 ----
  _cellCenter(col, rowVisible) {
    return {
      x: this.offsetX + (col + 0.5) * this.cell,
      y: this.offsetY + (rowVisible + 0.5) * this.cell,
    };
  }

  // ====================================================================
  // 공개 API
  // ====================================================================

  /**
   * 라인 클리어 종합 연출: 강도 단계에 따라 디졸브 + 파티클 폭발 + 플래시 +
   * 스크린셰이크 + 글로우 서지를 한 번에 일으킨다.
   * @param {object} p  엔진 LINE_CLEAR 페이로드
   *   {rows:number[], count, tSpin:'none'|'mini'|'full', backToBack, combo, perfectClear}
   */
  triggerLineClear(p) {
    const count = p.count || 0;
    if (count <= 0) return;
    const stage = this._lineClearStage(p);
    const hot = stage >= 3 || p.tSpin === 'full' || p.backToBack || p.perfectClear;
    const fillColor = hot ? this.colors.comboFlashHot : this.colors.comboFlash;

    // 1) 지워지는 각 행: 디졸브 바 + 행을 따라 파티클 폭발
    const total = this.burstCount[stage] || this.burstCount[1];
    const perRow = Math.max(2, Math.round(total / count));
    for (const absRow of p.rows) {
      const rv = absRow - this.bufferRows;
      if (rv < 0 || rv >= this.rows) continue;
      this._addDissolve(rv, fillColor, stage);
      this._burstAlongRow(rv, perRow, stage, hot);
    }

    // 2) 전면 플래시(강도별 불투명도)
    this.flash({ color: fillColor, opacity: this._flashOpacityFor(stage), durKey: 'slow' });

    // 3) 스크린셰이크
    this.shake(stage);

    // 4) 큰 클리어/특수: 네온 프레임 글로우 서지
    if (stage >= 3 || p.tSpin === 'full' || p.perfectClear) this._surge();
  }

  /**
   * T스핀(라인 0줄 포함) 보상 연출. 라인이 같이 지워지면 triggerLineClear가
   * 처리하므로, 여기서는 "회전만 성공한 스핀"의 깜빡임을 담당한다.
   * @param {object} p  엔진 TSPIN 페이로드 {variant, lines, ...}
   */
  triggerTSpin(p) {
    if (p && p.lines > 0) return; // 라인 동반 시 라인클리어 연출이 맡음
    this.flash({ color: this.colors.magenta, opacity: this.flashOpacity.mid, durKey: 'base' });
    this.shake(p && p.variant === 'full' ? 2 : 1);
    this._surge();
  }

  /**
   * 스크린셰이크. 강도 단계 1~4의 진폭(effect)과 지속(motion)을 쓴다.
   * 이미 흔들리는 중이면 더 센 쪽으로 갱신한다.
   * @param {number} stage 1~4
   */
  shake(stage) {
    if (this.reducedMotion) return; // 모션 최소화 선호 시 흔들지 않음
    const s = Math.max(1, Math.min(4, stage | 0));
    const amp = this.shakeAmp[s];
    const dur = [0, this.motion.dur.fast, this.motion.dur.fast, this.motion.dur.base, this.motion.dur.slow][s];
    if (this.shakeState && this.shakeState.amp >= amp) {
      this.shakeState.life = Math.max(this.shakeState.life, dur);
      this.shakeState.maxLife = Math.max(this.shakeState.maxLife, dur);
      return;
    }
    this.shakeState = { amp, life: dur, maxLife: dur };
  }

  /**
   * 전면 색 플래시. 캔버스 전체를 색으로 덮었다 사라진다.
   * @param {object} o {color, opacity, durKey?:'fast'|'base'|'slow'|'dramatic', duration?}
   */
  flash(o) {
    const dur = o.duration != null ? o.duration : this.motion.dur[o.durKey || 'base'];
    if (this.flashes.length >= 5) this.flashes.shift();
    this.flashes.push({ color: o.color, alpha: o.opacity, life: dur, maxLife: dur });
  }

  /**
   * 셀 좌표 기준 파티클 폭발.
   * @param {number} col   가시 열
   * @param {number} rowVisible 가시 행
   * @param {object} [opts] {count, color, sizeKey:'sm'|'md'|'lg', speed, spread}
   */
  burst(col, rowVisible, opts = {}) {
    const { x, y } = this._cellCenter(col, rowVisible);
    this._burstAt(x, y, opts);
  }

  /**
   * 하드드롭 연출: 낙하 경로 잔상(afterimage) + 착지 충격 링 + 먼지 파티클.
   * @param {object} info {cells:[{x,y}](절대좌표, fromY 기준), type, fromY, toY}
   */
  triggerHardDrop(info) {
    if (!info || !info.cells || info.cells.length === 0) return;
    const color = this.palette.fillFor(info.type);
    const dy = (info.toY - info.fromY) | 0;
    // 착지 충격은 "착지한 위치"(출발 셀을 dy만큼 내린 곳)에 그린다.
    const landingCells = dy > 0 ? info.cells.map((c) => ({ x: c.x, y: c.y + dy })) : info.cells;
    if (dy <= 0) {
      // 낙하 거리 0(이미 바닥): 착지 충격만.
      this._landingImpact(landingCells, color);
      return;
    }
    // 잔상: 피스가 점유한 각 열에 대해 출발~착지 구간의 세로 스트릭.
    const cols = new Map(); // col → {minRV, maxRV}
    for (const c of info.cells) {
      const startRV = c.y - this.bufferRows;
      const endRV = c.y + dy - this.bufferRows;
      const cur = cols.get(c.x);
      if (!cur) cols.set(c.x, { y0: startRV, y1: endRV });
      else {
        cur.y0 = Math.min(cur.y0, startRV);
        cur.y1 = Math.max(cur.y1, endRV);
      }
    }
    const streaks = [];
    for (const [col, span] of cols) {
      const top = this._cellCenter(col, span.y0);
      const bot = this._cellCenter(col, span.y1);
      streaks.push({ x: top.x, y0: top.y - this.cell * 0.5, y1: bot.y + this.cell * 0.5 });
    }
    const dur = this.motion.dur.base;
    if (this.reducedMotion) {
      // 잔상 생략, 착지 충격만.
      this._landingImpact(landingCells, color);
      return;
    }
    this.trails.push({ streaks, color, life: dur, maxLife: dur });
    this._landingImpact(landingCells, color);
  }

  /**
   * 위험(상단 근접) 경고 펄스 토글. 프레임 글로우 펄스는 CSS 클래스로 구동한다.
   * @param {boolean} on
   */
  setDanger(on) {
    const next = !!on;
    if (next === this._danger) return;
    this._danger = next;
    if (this.shakeTarget) this.shakeTarget.classList.toggle('is-danger', next);
  }

  /** KO 연출: 강한 플래시 + 최대 셰이크 + 대형 파티클 + 글로우 서지. */
  triggerKO() {
    this.flash({ color: this.colors.koFlash, opacity: this.flashOpacity.ko, durKey: 'dramatic' });
    this.shake(4);
    this._surge();
    // 보드 중앙에서 사방으로 대형 폭발.
    const cx = this.cols / 2 - 0.5;
    const cy = this.rows / 2 - 0.5;
    this._burstAt(
      this.offsetX + (cx + 0.5) * this.cell,
      this.offsetY + (cy + 0.5) * this.cell,
      { count: this.burstCount[4], color: this.colors.koFlash, sizeKey: 'lg', speed: 0.9, spread: Math.PI * 2 },
    );
    this.setDanger(false);
  }

  // ====================================================================
  // 내부 구현
  // ====================================================================

  /** 라인클리어 강도 단계(1~4) 산출. 트리거 규칙의 코드측 정의. */
  _lineClearStage(p) {
    let stage = Math.max(1, Math.min(4, p.count)); // single→1 … tetris→4
    if (p.tSpin === 'full') stage += 1; // T스핀: 한 단계 격상
    if (p.backToBack) stage += 1; // 백투백 보너스
    if (p.perfectClear) stage = 4; // 퍼펙트 클리어: 최고 단계
    if (p.combo >= 4) stage += 1; // 고콤보 가산
    return Math.max(1, Math.min(4, stage));
  }

  _flashOpacityFor(stage) {
    return [0, this.flashOpacity.low, this.flashOpacity.mid, this.flashOpacity.high, this.flashOpacity.ko][stage];
  }

  /** 디졸브 바: 지워진 행이 밝게 부풀었다 사라진다. */
  _addDissolve(rv, color, stage) {
    if (this.dissolves.length >= this.rows) this.dissolves.shift();
    const dur = stage >= 3 ? this.motion.dur.slow : this.motion.dur.base;
    this.dissolves.push({ rv, color, life: dur, maxLife: dur });
  }

  /** 한 행을 따라 파티클을 분사한다(라인클리어용). */
  _burstAlongRow(rv, count, stage, hot) {
    const y = this.offsetY + (rv + 0.5) * this.cell;
    const sizeKey = stage >= 3 ? 'lg' : stage === 2 ? 'md' : 'sm';
    const size = this.particleSize[sizeKey] * this.dpr;
    const span = this.cols * this.cell;
    const n = this.reducedMotion ? Math.min(4, count) : count;
    const speed = (stage >= 3 ? 0.55 : 0.4);
    for (let i = 0; i < n; i++) {
      const x = this.offsetX + (i + 0.5) * (span / n);
      const ang = -HALF_PI + (Math.cos(i * 12.9898) * 0.9); // 위쪽 부채꼴(결정적 분산)
      const v = speed * (0.5 + 0.5 * Math.abs(Math.sin(i * 7.1)));
      this.particles.spawn({
        x,
        y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        life: this.motion.dur.dramatic * (0.7 + 0.3 * (i % 3) / 2),
        size,
        color: this._pickParticleColor(i, hot),
        gravityScale: 1,
      });
    }
  }

  /** 임의 픽셀 좌표 폭발(공용). */
  _burstAt(x, y, opts = {}) {
    const count = this.reducedMotion
      ? Math.min(6, opts.count || this.burstCount[2])
      : (opts.count || this.burstCount[2]);
    const size = (opts.size != null ? opts.size : this.particleSize[opts.sizeKey || 'md']) * this.dpr;
    const speed = opts.speed != null ? opts.speed : 0.5;
    const spread = opts.spread != null ? opts.spread : Math.PI * 2;
    const base = opts.color || this.colors.spark;
    for (let i = 0; i < count; i++) {
      const ang = -HALF_PI + (i / count) * spread - spread / 2 + Math.cos(i * 3.7) * 0.3;
      const v = speed * (0.4 + 0.6 * Math.abs(Math.sin(i * 5.3)));
      this.particles.spawn({
        x,
        y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        life: this.motion.dur.dramatic * (0.6 + 0.4 * ((i % 4) / 3)),
        size,
        color: typeof base === 'function' ? base(i) : (i % 5 === 0 ? this.colors.spark : base),
        gravityScale: 1,
      });
    }
  }

  /** 콤보/일반 파티클 색 선택(결정적). */
  _pickParticleColor(i, hot) {
    if (i % 4 === 0) return this.colors.spark;
    if (hot) return i % 2 === 0 ? this.colors.magenta : this.colors.gold;
    return i % 3 === 0 ? this.colors.gold : this.colors.neon;
  }

  /** 착지 충격: 피스 바닥 행에 충격 링 + 먼지 파티클. */
  _landingImpact(cells, color) {
    // 피스의 바닥 가시행과 가로 중심.
    let maxY = -Infinity;
    let sumX = 0;
    for (const c of cells) {
      if (c.y > maxY) maxY = c.y;
      sumX += c.x;
    }
    const rv = maxY - this.bufferRows;
    if (rv < 0 || rv >= this.rows) return;
    const cx = sumX / cells.length;
    const center = this._cellCenter(cx, rv);
    const dur = this.motion.dur.fast;
    this.rings.push({
      x: center.x,
      y: center.y + this.cell * 0.5,
      color,
      life: dur,
      maxLife: dur,
      maxR: this.cell * 2.2,
    });
    if (!this.reducedMotion) {
      this._burstAt(center.x, center.y + this.cell * 0.5, {
        count: this.burstCount[1],
        color,
        sizeKey: 'sm',
        speed: 0.35,
        spread: Math.PI, // 위 반구
      });
    }
    this.shake(1);
  }

  /** 네온 프레임 글로우 서지(CSS 클래스). 잠시 켰다 끈다. */
  _surge() {
    if (!this.shakeTarget) return;
    this.shakeTarget.classList.add('fx-surge');
    if (this._surgeTimer) clearTimeout(this._surgeTimer);
    this._surgeTimer = setTimeout(() => {
      this.shakeTarget.classList.remove('fx-surge');
      this._surgeTimer = null;
    }, this.motion.dur.slow);
  }

  // ---- 프레임 ----

  /**
   * 매 프레임 호출(게임 세션의 rAF). 모든 이펙트를 dt만큼 전진시키고 그린다.
   * @param {number} dt ms
   */
  update(dt) {
    const d = Math.min(50, dt || 0);
    this.particles.update(d);

    // 수명 감소
    this._decay(this.flashes, d);
    this._decay(this.dissolves, d);
    this._decay(this.trails, d);
    this._decay(this.rings, d);

    // 셰이크 트랜스폼 적용
    this._applyShake(d);

    const hasWork =
      this.particles.hasLive ||
      this.flashes.length ||
      this.dissolves.length ||
      this.trails.length ||
      this.rings.length;

    if (hasWork) {
      this._render();
      this._dirty = true;
    } else if (this._dirty) {
      // 마지막 잔여물 정리(빈 프레임 1회 클리어 후 드로잉 생략).
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this._dirty = false;
    }
  }

  _decay(arr, dt) {
    for (let i = arr.length - 1; i >= 0; i--) {
      arr[i].life -= dt;
      if (arr[i].life <= 0) arr.splice(i, 1);
    }
  }

  _applyShake(dt) {
    if (!this.shakeTarget) return;
    if (!this.shakeState) return;
    this.shakeState.life -= dt;
    if (this.shakeState.life <= 0) {
      this.shakeState = null;
      this.shakeTarget.style.transform = '';
      return;
    }
    const t = this.shakeState.life / this.shakeState.maxLife; // 1→0
    const fall = this.motion.ease.inFast(t); // 빠르게 잦아듦
    const a = this.shakeState.amp * fall; // css px(트랜스폼은 dpr 무관)
    // 결정적 의사난수(시간 의존 X — 매 프레임 부호 교대로 진동감).
    const ph = this.shakeState.life;
    const dx = Math.sin(ph * 0.9) * a;
    const dy = Math.cos(ph * 1.3) * a;
    this.shakeTarget.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
  }

  _render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();

    // 1) 디졸브 바(지워진 행) — 가산 합성으로 밝게 부풀어 사라짐
    if (this.dissolves.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const dz of this.dissolves) {
        const t = dz.life / dz.maxLife; // 1→0
        const eased = this.motion.ease.outExpo(1 - t); // 0→1 진행
        const grow = this.cell * 0.6 * eased;
        const y = this.offsetY + dz.rv * this.cell - grow * 0.5;
        ctx.globalAlpha = t;
        ctx.fillStyle = dz.color;
        ctx.fillRect(this.offsetX, y, this.cols * this.cell, this.cell + grow);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // 2) 하드드롭 잔상 스트릭 — 세로 그라데이션이 잔상 불투명도에서 사라짐
    if (this.trails.length) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const tr of this.trails) {
        const t = tr.life / tr.maxLife; // 1→0
        ctx.globalAlpha = this.trailOpacity * t;
        ctx.strokeStyle = tr.color;
        ctx.lineWidth = this.cell * 0.5;
        ctx.beginPath();
        for (const s of tr.streaks) {
          ctx.moveTo(s.x, s.y0);
          ctx.lineTo(s.x, s.y1);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // 3) 착지 충격 링 — 팽창하며 사라지는 원
    if (this.rings.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const rg of this.rings) {
        const t = rg.life / rg.maxLife; // 1→0
        const eased = this.motion.ease.outExpo(1 - t);
        const r = rg.maxR * eased;
        ctx.globalAlpha = t;
        ctx.strokeStyle = rg.color;
        ctx.lineWidth = Math.max(1, this.cell * 0.12);
        ctx.beginPath();
        ctx.arc(rg.x, rg.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // 4) 파티클(가산 합성 스프라이트)
    this.particles.draw(ctx);

    // 5) 전면 플래시 — 가장 위에서 화면을 덮음
    if (this.flashes.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const f of this.flashes) {
        const t = f.life / f.maxLife; // 1→0
        ctx.globalAlpha = f.alpha * t;
        ctx.fillStyle = f.color;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  /** 재시작 등: 모든 이펙트와 트랜스폼/클래스를 초기화. */
  reset() {
    this.particles.reset();
    this.flashes.length = 0;
    this.dissolves.length = 0;
    this.trails.length = 0;
    this.rings.length = 0;
    this.shakeState = null;
    if (this.shakeTarget) {
      this.shakeTarget.style.transform = '';
      this.shakeTarget.classList.remove('is-danger', 'fx-surge');
    }
    if (this._surgeTimer) {
      clearTimeout(this._surgeTimer);
      this._surgeTimer = null;
    }
    this._danger = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._dirty = false;
  }
}
