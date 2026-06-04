// ============================================================================
// versus/versus-controller.js — 대전 메커니즘 오케스트레이션 (g7)
//
// 두 GameSession(플레이어 ↔ AI)을 묶어 "공격(가비지) 주고받기"를 구동한다.
//
// 경계:
//  · 코어 스코어/콤보/B2B/T스핀 판정은 엔진(g3)에만. 여기서는 엔진 이벤트를
//    "구독"해 공격 라인을 산출(attack-table)하고, engine.addGarbage(g7 주입 API)로
//    상대 보드에 주입한다.
//  · 모든 연출은 g5 EffectsLayer 공개 API(flash/shake/burst/setDanger) + 토큰
//    소비 DOM(콜아웃/예고/게이지)으로만 — 색/시간 하드코딩 금지.
//  · 도발(티배깅) 입력은 g4 키보드 레이어 "위에서" 별도 리스너로 감지(엔진/컨트롤러
//    미수정).
//
// 공정성/가독성(예고→삽입):
//  · 클리어로 발생한 공격은 먼저 내 수신 큐를 상쇄(counter)하고 잔여만 상대에게
//    전송한다.
//  · 전송된 가비지는 TELEGRAPH_MS 동안 "충전"되며 예고 바/게이지로 보인다. 충전이
//    끝난(armed) 라인만, 그것도 라인을 못 지운 배치(드롭) 시점에 보드로 들어간다 →
//    받는 쪽에 반격(상쇄)할 창이 항상 열려 있다.
// ============================================================================

import { EVENTS } from '../engine/index.js';
import { mulberry32 } from '../engine/randomizer.js';
import { computeAttackLines, nextHoleColumn } from './attack-table.js';
import { TAUNT_LINES, ATTACK_CALLOUTS, pickTaunt } from './taunts.js';

// --- 대전 필(feel) 튜닝 상수 (디자인 토큰 아님 — 감각값) ---
const TELEGRAPH_MS = 900; // 가비지 충전(예고) 시간: 반격 창
const MAX_APPLY_PER_LOCK = 8; // 한 드롭에 들어갈 수 있는 최대 가비지(인스타킬 방지)
const NEAR_KO_ROWS = 5; // 스택 최상단이 상단 N행 안이면 'KO 직전'으로 본다
const TELEGRAPH_SEGS = 16; // 예고 바에 표시할 최대 세그먼트 수

// 티배깅(도발) 감지: 짧은 창 안에 빠른 다운 탭 N회 → 도발.
const TAUNT_WINDOW_MS = 1200;
const TAUNT_TAPS = 4;
const TAUNT_COOLDOWN_MS = 2600; // 도발 남발 방지(과하지 않게)
const TAUNT_EXTRA_LINES = 1; // 도발 성공 시 추가 압박(소량)
const COMBO_CALLOUT_MIN = 3; // 콤보 값이 이 이상이면 화면 콜아웃

const now =
  typeof performance !== 'undefined' && performance.now
    ? () => performance.now()
    : () => 0;

function readToken(name) {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export class VersusController {
  /**
   * @param {object} cfg
   * @param {import('../game/game-session.js').GameSession} cfg.player
   * @param {import('../game/game-session.js').GameSession} cfg.ai
   * @param {HTMLElement} [cfg.attackPlayerEl]  공격 게이지(플레이어 측)
   * @param {HTMLElement} [cfg.attackAiEl]      공격 게이지(AI 측)
   * @param {number} [cfg.seed]                 가비지 구멍 RNG 시드(결정적)
   * @param {()=>number} [cfg.rng]              RNG 직접 주입(seed보다 우선, 테스트용)
   * @param {EventTarget} [cfg.tauntTarget=window]  플레이어 도발 키 리스너 부착 대상
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.rng = cfg.rng || (cfg.seed != null ? mulberry32(cfg.seed >>> 0) : Math.random);

    this.colors = this._readColors();

    this.player = this._makeCombatant('player', cfg.player, cfg.attackPlayerEl);
    this.ai = this._makeCombatant('ai', cfg.ai, cfg.attackAiEl);
    this.player.opponent = this.ai;
    this.ai.opponent = this.player;

    this._wire(this.player);
    this._wire(this.ai);

    // 도발(티배깅) 입력: g4 입력 레이어 위에서 별도 감지. 사람 플레이어 측만.
    this._tapTimes = [];
    this._tauntTarget = cfg.tauntTarget || (typeof window !== 'undefined' ? window : null);
    this._onTauntKey = this._onTauntKey.bind(this);
    if (this._tauntTarget) this._tauntTarget.addEventListener('keydown', this._onTauntKey);
  }

  _readColors() {
    return {
      danger: readToken('--danger') || '#ff1e3c',
      garbageEdge: readToken('--garbage-edge') || '#ff2965',
      comboHot: readToken('--combo-flash-hot') || '#ff2bd6',
      gold: readToken('--particle-gold') || '#ffd84d',
      neon: readToken('--particle-neon') || '#00f0ff',
      spark: readToken('--particle-spark') || '#ffffff',
    };
  }

  /** 폰트/테마 로드 후 색 토큰 재해석(세션과 동일 계약). */
  refresh() {
    this.colors = this._readColors();
  }

  // ---- 전투원(combatant) ----

  _makeCombatant(name, session, gaugeEl) {
    const c = {
      name,
      session,
      engine: session.engine,
      effects: session.effects,
      surface: session.cfg.surface || null,
      gaugeEl: gaugeEl || null,
      gaugeFill: null,
      telegraphEl: null,
      calloutLayer: null,
      incoming: [], // [{lines, charge}]  charge>0=충전중(예고), <=0=armed
      prevHole: null,
      nearKO: false,
      lastTauntAt: -Infinity,
      isAI: !!session.isAI,
      opponent: null,
    };
    this._mountDom(c);
    // 세션 프레임 훅: 충전 진행 + 예고/게이지 렌더 + KO 근접 갱신.
    session.onTick = (dt, snap) => this._tick(c, dt, snap);
    // 세션 재시작 훅: 이 보드의 수신 큐/예고 초기화.
    session.onRestart = () => this._resetCombatant(c);
    return c;
  }

  /** 예고 바 + 콜아웃 레이어 + 게이지 채움 요소를 DOM에 주입(토큰 소비 CSS). */
  _mountDom(c) {
    if (typeof document === 'undefined') return;
    if (c.surface) {
      // 예고(텔레그래프) 바 — 보드 안쪽 가장자리에 솟아오르는 위협 세그먼트.
      const tele = document.createElement('div');
      tele.className = `garbage-telegraph garbage-telegraph--${c.name}`;
      tele.setAttribute('aria-hidden', 'true');
      c.surface.appendChild(tele);
      c.telegraphEl = tele;

      // 화면 도발/공격 콜아웃 레이어(플로팅 텍스트).
      const layer = document.createElement('div');
      layer.className = 'battle-callout-layer';
      layer.setAttribute('aria-hidden', 'true');
      c.surface.appendChild(layer);
      c.calloutLayer = layer;
    }
    if (c.gaugeEl) {
      const fill = document.createElement('i');
      fill.className = 'attack-gauge__fill';
      c.gaugeEl.appendChild(fill);
      c.gaugeFill = fill;
    }
  }

  _resetCombatant(c) {
    c.incoming.length = 0;
    c.prevHole = null;
    c.nearKO = false;
    this._renderTelegraph(c);
    this._renderGauge(c);
  }

  // ---- 엔진 이벤트 배선 ----

  _wire(c) {
    const eng = c.engine;
    // 라인 클리어 → 공격 산출 → 내 수신 상쇄 → 잔여를 상대에게 예고 전송.
    eng.on(EVENTS.LINE_CLEAR, (p) => this._onLineClear(c, p));
    // 드롭(락) → 라인을 못 지웠으면 armed 가비지를 이 보드에 주입.
    eng.on(EVENTS.LOCK, (p) => this._onLock(c, p));
  }

  _onLineClear(attacker, p) {
    const atk = computeAttackLines(p);

    // 1) 내가 받을 예정인 가비지부터 상쇄(counter). 오래된 배치부터.
    let remaining = atk;
    const inc = attacker.incoming;
    while (remaining > 0 && inc.length > 0) {
      const b = inc[0];
      const dec = Math.min(b.lines, remaining);
      b.lines -= dec;
      remaining -= dec;
      if (b.lines <= 0) inc.shift();
    }

    // 2) 잔여 공격을 상대 보드에 예고(텔레그래프) 전송.
    if (remaining > 0) {
      attacker.opponent.incoming.push({ lines: remaining, charge: TELEGRAPH_MS });
    }

    // 3) 연출: 공격자 화면 콜아웃 + 콤보/특수 강조.
    this._attackCallout(attacker, p, atk);

    // 4) AI 도발: 사람이 KO 직전인데 AI가 공격을 꽂으면 가끔 도발(과하지 않게).
    if (attacker.isAI && atk > 0 && attacker.opponent.nearKO) {
      this._maybeAiTaunt(attacker);
    }

    this._renderGauge(attacker);
    this._renderGauge(attacker.opponent);
  }

  _onLock(c, p) {
    if (p.linesCleared > 0) return; // 라인을 지운 락은 상쇄로 처리됨(주입 안 함)
    this._applyArmedGarbage(c);
  }

  /** 충전이 끝난(armed) 가비지를 이 보드에 주입한다. 드롭 시점에만 호출. */
  _applyArmedGarbage(c) {
    let budget = MAX_APPLY_PER_LOCK;
    const holes = [];
    while (budget > 0 && c.incoming.length > 0 && c.incoming[0].charge <= 0) {
      const b = c.incoming[0];
      const take = Math.min(b.lines, budget);
      for (let i = 0; i < take; i++) {
        c.prevHole = nextHoleColumn(this.rng, c.prevHole, c.engine.board.width);
        holes.push(c.prevHole);
      }
      b.lines -= take;
      budget -= take;
      if (b.lines <= 0) c.incoming.shift();
    }
    if (holes.length === 0) return;

    const res = c.engine.addGarbage(holes.length, (i) => holes[i]);
    if (res.applied > 0) this._receiveFx(c, res.applied, res.topout);
    this._renderTelegraph(c);
    this._renderGauge(c);
  }

  // ---- 프레임 틱: 충전 진행 + 렌더 + KO 근접 갱신 ----

  _tick(c, dt, snap) {
    // KO 근접: 스택 최상단이 상단 NEAR_KO_ROWS 안에 들었는가.
    const top = c.engine.board.highestFilledRow();
    const visTop = top - c.engine.board.bufferRows; // 가시행 기준(0=맨 위)
    c.nearKO = !c.engine.gameOver && visTop >= 0 && visTop < NEAR_KO_ROWS;

    // 충전 진행(예고 → armed).
    if (!c.engine.paused && !c.engine.gameOver) {
      let changed = false;
      for (const b of c.incoming) {
        if (b.charge > 0) {
          b.charge -= dt;
          changed = true;
        }
      }
      if (changed) this._renderTelegraph(c);
    }

    this._renderTelegraph(c);
    this._renderGauge(c);
  }

  // ---- 도발(티배깅) ----

  _onTauntKey(e) {
    // 다운(소프트드롭) 키의 빠른 탭만 도발 후보로 본다. 자동 리피트는 제외.
    if (e.repeat) return;
    if (e.code !== 'ArrowDown' && e.code !== 'KeyS') return;
    const p = this.player;
    if (!p.engine.started || p.engine.paused || p.engine.gameOver) return;

    const t = now();
    this._tapTimes.push(t);
    // 창 밖 탭 제거.
    while (this._tapTimes.length && t - this._tapTimes[0] > TAUNT_WINDOW_MS) {
      this._tapTimes.shift();
    }
    if (this._tapTimes.length < TAUNT_TAPS) return;

    // 상대(AI)를 KO 직전으로 몰았을 때만 도발이 성립(맥락 있는 재미).
    if (!this.ai.nearKO) return;
    if (t - p.lastTauntAt < TAUNT_COOLDOWN_MS) return;

    p.lastTauntAt = t;
    this._tapTimes.length = 0;
    this._taunt(p /*도발 주체*/, this.ai /*피도발 대상*/);
  }

  /** AI가 사람을 KO 직전으로 몰았을 때 가끔 되받아치는 도발. */
  _maybeAiTaunt(aiC) {
    const t = now();
    if (t - aiC.lastTauntAt < TAUNT_COOLDOWN_MS) return;
    if (this.rng() > 0.5) return; // 너무 잦지 않게
    aiC.lastTauntAt = t;
    this._taunt(aiC, aiC.opponent);
  }

  /**
   * 도발 연출 + 소량 추가 압박. taunter가 victim을 도발한다.
   * victim 보드에 도발 콜아웃 + 위협 플래시/셰이크, 그리고 예고 1줄 추가.
   */
  _taunt(taunter, victim) {
    // 추가 압박: 소량(과하지 않게), 예고로 들어가 반격 창은 유지.
    if (TAUNT_EXTRA_LINES > 0) {
      victim.incoming.push({ lines: TAUNT_LINES, charge: TELEGRAPH_MS });
      this._renderGauge(victim);
    }
    // 도발 카피.
    this._callout(victim, pickTaunt(this.rng, taunter.isAI), 'taunt');
    // 위협 연출(g5 API): 강조 플래시 + 셰이크 + 프레임 글로우 서지.
    if (victim.effects) {
      victim.effects.flash({ color: this.colors.comboHot, opacity: 0.45, durKey: 'slow' });
      victim.effects.shake(2);
      this._surge(victim);
      // 약 올리는 스파크 분사.
      victim.effects.burst(victim.engine.board.width / 2 - 0.5, 1, {
        count: 18,
        color: this.colors.comboHot,
        sizeKey: 'md',
        speed: 0.6,
        spread: Math.PI * 2,
      });
    }
  }

  // ---- 연출 헬퍼 ----

  _attackCallout(attacker, p, atk) {
    let text = null;
    let variant = 'attack';
    if (p.perfectClear) {
      text = ATTACK_CALLOUTS.perfectClear;
      variant = 'combo';
    } else if (p.tSpin === 'full' || p.tSpin === 'mini') {
      text = ATTACK_CALLOUTS.tspin;
    } else if (p.count >= 4) {
      text = ATTACK_CALLOUTS.tetris;
    } else if (p.backToBack) {
      text = ATTACK_CALLOUTS.b2b;
    }
    // 콤보(2연속+) 강조 — 공격 콜아웃보다 우선해 박진감.
    const combo = (p.combo | 0) + 1; // 엔진 0=2연속이므로 +1로 사람 친화 표기
    if (p.combo >= COMBO_CALLOUT_MIN - 1) {
      text = `COMBO ×${combo}`;
      variant = 'combo';
    }
    if (text) this._callout(attacker, text, variant);
  }

  /** 가비지 수신 연출: 위협 플래시 + 셰이크(양 비례) + 바닥 스파크. */
  _receiveFx(c, lines, topout) {
    if (!c.effects) return;
    const stage = Math.max(1, Math.min(4, Math.ceil(lines / 2)));
    c.effects.flash({ color: this.colors.danger, opacity: 0.18 + 0.08 * stage, durKey: 'base' });
    c.effects.shake(stage);
    const rows = c.engine.board.visibleHeight;
    c.effects.burst(c.engine.board.width / 2 - 0.5, rows - 1, {
      count: 10 + lines * 4,
      color: this.colors.garbageEdge,
      sizeKey: 'sm',
      speed: 0.5,
      spread: Math.PI, // 위 반구
    });
    if (!topout) this._callout(c, `+${lines}`, 'receive');
  }

  /** 화면 콜아웃(플로팅 텍스트). 토큰 소비 CSS 애니메이션 후 제거. */
  _callout(c, text, variant) {
    if (!c.calloutLayer) return;
    const el = document.createElement('span');
    el.className = `battle-callout battle-callout--${variant}`;
    el.textContent = text;
    c.calloutLayer.appendChild(el);
    // 레이어가 과밀해지지 않도록 상한.
    while (c.calloutLayer.childElementCount > 4) {
      c.calloutLayer.removeChild(c.calloutLayer.firstChild);
    }
    const remove = () => el.parentNode && el.parentNode.removeChild(el);
    el.addEventListener('animationend', remove, { once: true });
    // 애니메이션 미발화 환경 대비 폴백.
    setTimeout(remove, 1400);
  }

  /** 프레임 글로우 서지(g5와 동일한 CSS 클래스). */
  _surge(c) {
    if (!c.surface) return;
    c.surface.classList.add('fx-surge');
    if (c._surgeTimer) clearTimeout(c._surgeTimer);
    c._surgeTimer = setTimeout(() => {
      c.surface.classList.remove('fx-surge');
      c._surgeTimer = null;
    }, 400);
  }

  // ---- 렌더: 예고 바 + 공격 게이지 ----

  _pendingLines(c) {
    let total = 0;
    let armed = 0;
    for (const b of c.incoming) {
      total += b.lines;
      if (b.charge <= 0) armed += b.lines;
    }
    return { total, armed };
  }

  _renderTelegraph(c) {
    if (!c.telegraphEl) return;
    const { total, armed } = this._pendingLines(c);
    const shown = Math.min(total, TELEGRAPH_SEGS);
    const el = c.telegraphEl;
    // 세그먼트 수를 맞춘다(증감 시에만 DOM 재구성).
    while (el.childElementCount < shown) {
      const seg = document.createElement('i');
      seg.className = 'garbage-telegraph__seg';
      el.appendChild(seg);
    }
    while (el.childElementCount > shown) el.removeChild(el.lastChild);
    // armed/충전중 상태 표시(아래에서 위로 쌓이는 위협).
    const kids = el.children;
    for (let i = 0; i < kids.length; i++) {
      const isArmed = i < armed;
      kids[i].classList.toggle('is-armed', isArmed);
    }
    el.classList.toggle('is-active', total > 0);
    el.classList.toggle('is-armed', armed > 0);
  }

  _renderGauge(c) {
    if (!c.gaugeFill) return;
    const { total, armed } = this._pendingLines(c);
    // 0~10줄을 0~100%로(상한). 받는 보드 측 게이지가 위협으로 차오른다.
    const pct = Math.min(1, total / 10) * 100;
    c.gaugeFill.style.width = `${pct}%`;
    c.gaugeEl.classList.toggle('is-armed', armed > 0);
    c.gaugeEl.classList.toggle('is-active', total > 0);
  }

  /** 정리(테스트/해제용). */
  destroy() {
    if (this._tauntTarget) this._tauntTarget.removeEventListener('keydown', this._onTauntKey);
    this.cfg.player.onTick = null;
    this.cfg.ai.onTick = null;
  }
}
