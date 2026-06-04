// ============================================================================
// audio/audio-director.js — 오디오 이벤트 구독 레이어 (g9)
//
// 게임의 어떤 규칙도 바꾸지 않는다. 엔진(g3)/대전(g7)/흐름(g8)이 이미 방출하는
// 이벤트와 late-bind 훅을 "구독"해, 합성 SFX(sfx.js)와 BGM(bgm.js)을 울릴 뿐이다.
//
// 경계(g9):
//  · 게임 로직 비의존 — engine.on(...) 구독, versus.onTaunt / flow.onFlow 훅만 사용.
//  · 플레이어 보드는 풀 손맛 SFX, AI 보드는 핵심 이벤트만(라인클리어/가비지/KO) 절제.
//  · 첫 사용자 제스처에서 AudioContext를 깨우고, 음소거는 즉시 마스터 게인에 반영.
//  · 연타 이벤트(이동/소프트드롭)는 레이트리밋으로 거슬리지 않게 정리.
// ============================================================================

import { EVENTS } from '../engine/index.js';
import { SynthEngine } from './synth.js';
import { Bgm } from './bgm.js';
import { SFX } from './sfx.js';

const MOVE_MIN_GAP = 35; // 이동 틱 최소 간격(ms) — DAS 연타 정리
const SOFT_MIN_GAP = 55; // 소프트드롭 틱 최소 간격(ms)
const STORE_KEY = 'neonblitz.muted';

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
}

function loadMuted() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORE_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function saveMuted(m) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, m ? '1' : '0');
  } catch (_) {
    /* 무시(프라이빗 모드 등) */
  }
}

export class AudioDirector {
  /**
   * @param {object} cfg
   * @param {import('../game/game-session.js').GameSession} cfg.player
   * @param {import('../game/game-session.js').GameSession} cfg.ai
   * @param {import('../versus/index.js').VersusController} [cfg.versus]
   * @param {import('../game/match-flow.js').MatchFlow} [cfg.flow]
   * @param {HTMLElement} [cfg.toggleEl]  음소거 토글 버튼
   * @param {EventTarget} [cfg.keyTarget=window]  단축키(M) 리스너 대상
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.muted = loadMuted();
    this.synth = new SynthEngine({ muted: this.muted, volume: 0.7 });
    this.bgm = new Bgm(this.synth);

    this._lastMoveAt = -Infinity;
    this._lastSoftAt = -Infinity;
    this._suppressLock = false; // 하드드롭이 막 발생 → 뒤따르는 LOCK 클릭 억제
    this._playing = false;
    this._unlocked = false;

    this._bindUnlock(cfg.keyTarget || (typeof window !== 'undefined' ? window : null));
    this._bindToggle(cfg.toggleEl);
    this._bindShortcut(cfg.keyTarget || (typeof window !== 'undefined' ? window : null));

    this._wirePlayer(cfg.player);
    this._wireAi(cfg.ai);
    if (cfg.versus) this._wireVersus(cfg.versus);
    if (cfg.flow) this._wireFlow(cfg.flow);

    this._reflectToggle();
  }

  // ---- 컨텍스트 잠금 해제(첫 제스처) + 토글/단축키 ----

  _bindUnlock(target) {
    if (!target) return;
    const unlock = () => {
      this._unlocked = true;
      this.synth.resume();
      // 플레이 중이었다면 BGM 가동(자동재생 차단으로 미가동 상태였을 수 있음).
      if (this._playing && !this.muted) this.bgm.start();
      target.removeEventListener('pointerdown', unlock);
      target.removeEventListener('keydown', unlock);
    };
    target.addEventListener('pointerdown', unlock);
    target.addEventListener('keydown', unlock);
  }

  _bindToggle(el) {
    if (!el) return;
    this._toggleEl = el;
    el.addEventListener('click', () => {
      this.synth.resume();
      this.toggleMute();
      // 켜는 순간 확인음(켜질 때만).
      if (!this.muted) SFX.ui(this.synth);
    });
  }

  _bindShortcut(target) {
    if (!target) return;
    target.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat) {
        this.synth.resume();
        this.toggleMute();
        if (!this.muted) SFX.ui(this.synth);
      }
    });
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  setMuted(m) {
    this.muted = !!m;
    this.synth.setMuted(this.muted);
    saveMuted(this.muted);
    if (this.muted) this.bgm.stop();
    else if (this._playing && this._unlocked) this.bgm.start();
    this._reflectToggle();
  }

  _reflectToggle() {
    const el = this._toggleEl;
    if (!el) return;
    el.classList.toggle('is-muted', this.muted);
    el.setAttribute('aria-pressed', String(this.muted));
    el.setAttribute('aria-label', this.muted ? '소리 켜기' : '소리 끄기');
    el.title = this.muted ? 'SOUND OFF (M)' : 'SOUND ON (M)';
    const icon = el.querySelector('[data-slot="mute-icon"]');
    if (icon) icon.textContent = this.muted ? '🔇' : '🔊';
  }

  // ---- 플레이어 보드: 풀 손맛 SFX ----

  _wirePlayer(session) {
    if (!session || !session.engine) return;
    const eng = session.engine;

    eng.on(EVENTS.MOVE, (e) => {
      const t = nowMs();
      if (e && e.soft) {
        if (t - this._lastSoftAt < SOFT_MIN_GAP) return;
        this._lastSoftAt = t;
        SFX.soft(this.synth);
      } else {
        if (t - this._lastMoveAt < MOVE_MIN_GAP) return;
        this._lastMoveAt = t;
        SFX.move(this.synth);
      }
    });
    eng.on(EVENTS.ROTATE, () => SFX.rotate(this.synth));
    eng.on(EVENTS.HOLD, () => SFX.hold(this.synth));
    eng.on(EVENTS.HARD_DROP, () => {
      this._suppressLock = true;
      SFX.hardDrop(this.synth);
    });
    eng.on(EVENTS.LOCK, () => {
      // 하드드롭 직후의 LOCK은 임팩트가 이미 울렸으므로 클릭을 생략.
      if (this._suppressLock) {
        this._suppressLock = false;
        return;
      }
      SFX.lock(this.synth);
    });
    eng.on(EVENTS.LINE_CLEAR, (e) => SFX.lineClear(this.synth, e && e.count));
    eng.on(EVENTS.COMBO, (e) => SFX.combo(this.synth, e ? e.combo + 1 : 1));
    eng.on(EVENTS.LEVEL_UP, () => SFX.levelUp(this.synth));
    eng.on(EVENTS.GARBAGE, (e) => {
      if (!e || e.count <= 0) return;
      SFX.garbage(this.synth, e.count);
    });
  }

  // ---- AI 보드: 핵심 이벤트만(상대 존재감) ----

  _wireAi(session) {
    if (!session || !session.engine) return;
    const eng = session.engine;
    // AI가 라인을 지움(상대가 살아있다는 신호) — 작게.
    eng.on(EVENTS.LINE_CLEAR, (e) => {
      const n = e && e.count ? e.count : 1;
      if (n >= 2) SFX.lineClear(this.synth, Math.min(2, n)); // 절제: 큰 것만, 약하게
    });
    // AI가 내 공격으로 가비지를 받음 = 통쾌. (수신측 엔진 GARBAGE)
    eng.on(EVENTS.GARBAGE, (e) => {
      if (e && e.count > 0) SFX.lineClear(this.synth, 1); // 가벼운 적중 신호
    });
  }

  // ---- 대전: 도발 SFX(versus의 onTaunt 훅) ----

  _wireVersus(versus) {
    versus.onTaunt = () => SFX.taunt(this.synth);
  }

  // ---- 흐름: 카운트다운/개시/KO + BGM 제어(flow.onFlow 훅) ----

  _wireFlow(flow) {
    flow.onFlow = (type, payload) => {
      if (type === 'state') {
        if (payload === 'playing') {
          this._playing = true;
          if (!this.muted && this._unlocked) this.bgm.start();
        } else if (payload === 'paused' || payload === 'title') {
          this._playing = payload !== 'title' ? this._playing : false;
          this.bgm.stop();
        } else if (payload === 'result') {
          this._playing = false;
          this.bgm.stop();
        } else if (payload === 'countdown') {
          this.bgm.stop();
        }
      } else if (type === 'count') {
        if (payload && payload.isFight) SFX.fight(this.synth);
        else SFX.count(this.synth);
      } else if (type === 'result') {
        SFX.ko(this.synth);
      } else if (type === 'select') {
        SFX.ui(this.synth);
      }
    };
  }

  /** 정리(테스트/해제용). */
  destroy() {
    this.bgm.stop();
  }
}
