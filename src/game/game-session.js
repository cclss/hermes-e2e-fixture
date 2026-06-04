// ============================================================================
// game/game-session.js — 한 플레이어 보드의 게임 세션 (루프 + 배선)
//
// 엔진(g3 API) + 보드 렌더러 + 홀드/넥스트 미니 렌더 + 키보드 컨트롤러 +
// HUD/오버레이를 묶어 requestAnimationFrame 루프로 구동한다. 게임 규칙은
// 엔진에만 있고, 여기서는 update(dt) 호출과 스냅샷 렌더만 한다.
// ============================================================================

import { TetrisEngine, EVENTS } from '../engine/index.js';
import { Palette } from '../render/palette.js';
import { BoardRenderer } from '../render/board-renderer.js';
import { PreviewRenderer } from '../render/preview-renderer.js';
import { EffectsLayer } from '../render/effects-layer.js';
import { KeyboardController } from '../input/keyboard-controller.js';
import { AIController } from '../ai/index.js';

const MAX_DT = 50; // 탭 비활성 후 점프 방지(ms 상한)
const COMBO_FILL_MAX = 10; // 콤보 미터가 가득 차는 기준 콤보 수
const DANGER_ROWS = 4; // 스택이 상단 N행 안에 들면 위험 경고(감각 임계값)

/** 스코어를 천 단위 구분으로 표기(HUD 가독성). 로케일 비의존(헤드리스 안전). */
function formatScore(n) {
  return String(n | 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export class GameSession {
  /**
   * @param {object} cfg
   * @param {HTMLCanvasElement} cfg.canvas
   * @param {HTMLElement} cfg.overlay
   * @param {HTMLElement} cfg.holdSlot
   * @param {HTMLElement[]} cfg.nextSlots
   * @param {HTMLElement} [cfg.comboValue]
   * @param {HTMLElement} [cfg.comboFill]
   * @param {HTMLElement} [cfg.scoreValue]   스코어 HUD 읽기(있을 때만 갱신)
   * @param {HTMLElement} [cfg.levelValue]   레벨 HUD 읽기
   * @param {HTMLElement} [cfg.linesValue]   라인 수 HUD 읽기
   * @param {HTMLCanvasElement} [cfg.fxCanvas]   이펙트(FX) 캔버스 오버레이
   * @param {HTMLElement} [cfg.surface]          셰이크/글로우/위험 펄스 타겟(Surface)
   * @param {boolean} [cfg.suppressOverlay]  per-board 오버레이를 끈다(상위 흐름이
   *        전역 씬으로 일시정지/결과를 표시할 때 — g8 MatchFlow).
   * @param {()=>void} [cfg.onPauseKey]      일시정지 키(P/Esc) 처리 위임(상위 흐름).
   * @param {()=>void} [cfg.onRestartKey]    재시작 키(Enter/R) 처리 위임(상위 흐름).
   * @param {number} [cfg.seed]
   * @param {string|object} [cfg.ai]   설정 시 키보드 대신 휴리스틱 봇이 이 보드를
   *        구동한다(난이도 이름 또는 설정 객체). 플레이어 보드에는 지정하지 않는다.
   * @param {()=>number} [cfg.aiRng]   봇 분산/실수용 난수원(테스트/재현용, 선택).
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.palette = new Palette();
    this.engine = new TetrisEngine({ seed: cfg.seed, level: 1 });

    this.renderer = new BoardRenderer(cfg.canvas, {
      cols: this.engine.board.width,
      rows: this.engine.board.visibleHeight,
      bufferRows: this.engine.board.bufferRows,
      palette: this.palette,
    });

    // 이펙트 레이어(선택): FX 캔버스가 있으면 게임 주스를 구동한다.
    this.effects = cfg.fxCanvas
      ? new EffectsLayer({
          canvas: cfg.fxCanvas,
          shakeTarget: cfg.surface || null,
          cols: this.engine.board.width,
          rows: this.engine.board.visibleHeight,
          bufferRows: this.engine.board.bufferRows,
          palette: this.palette,
        })
      : null;

    this.holdPreview = cfg.holdSlot ? new PreviewRenderer(cfg.holdSlot, this.palette) : null;
    this.nextPreviews = (cfg.nextSlots || []).map((el) => new PreviewRenderer(el, this.palette));

    // 입력 주체: cfg.ai가 있으면 휴리스틱 봇이, 없으면 키보드가 이 보드를 구동한다.
    // 봇은 이 세션의 엔진 인스턴스만 만지며 플레이어 입력에 간섭하지 않는다.
    // 일시정지/재시작 키 처리: 상위 흐름(g8 MatchFlow)이 위임받을 수 있도록 late-bind
    // 가능한 훅으로 둔다(미설정 시 per-board 기본 동작). 생성 후 재할당 가능.
    this.onPauseKey = cfg.onPauseKey || null;
    this.onRestartKey = cfg.onRestartKey || null;

    this.isAI = !!cfg.ai;
    if (this.isAI) {
      this.controller = null;
      this.agent = new AIController({
        getEngine: () => this.engine,
        difficulty: cfg.ai,
        onHardDrop: (info) => this.effects && this.effects.triggerHardDrop(info),
        rng: cfg.aiRng,
      });
    } else {
      this.agent = null;
      this.controller = new KeyboardController({
        engine: () => this.engine,
        onPause: () => (this.onPauseKey ? this.onPauseKey() : this.togglePause()),
        onRestart: () => (this.onRestartKey ? this.onRestartKey() : this.requestRestart()),
        isActive: () => this.engine.started && !this.engine.paused && !this.engine.gameOver,
        onHardDrop: (info) => this.effects && this.effects.triggerHardDrop(info),
        target: window,
      });
    }

    this._wireEffects();

    // 대전(g7) 등 상위 레이어가 매 프레임/재시작에 끼어들 수 있는 훅(선택).
    //   onTick(dt, snap): 프레임 말미(이펙트 전진 후) 호출 — 예고 충전/게이지 렌더 등.
    //   onRestart(): restart() 시 호출 — 수신 큐/예고 초기화 등.
    // 게임 규칙은 엔진에만 있고, 훅은 구독/렌더 보조에만 쓴다.
    this.onTick = cfg.onTick || null;
    this.onRestart = cfg.onRestart || null;

    this.lastTs = 0;
    this.running = false;
    this._frame = this._frame.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  /** 엔진 이벤트 → 이펙트 트리거 배선(게임 로직 비의존, 구독만). */
  _wireEffects() {
    if (!this.effects) return;
    const fx = this.effects;
    // 라인클리어: 디졸브 + 파티클 + 플래시 + 셰이크 + 글로우(강도 단계 자동).
    this.engine.on(EVENTS.LINE_CLEAR, (e) => fx.triggerLineClear(e));
    // T스핀(라인 0줄): 회전 성공 보상 깜빡임.
    this.engine.on(EVENTS.TSPIN, (e) => fx.triggerTSpin(e));
    // 탑아웃: KO 연출.
    this.engine.on(EVENTS.TOPOUT, () => fx.triggerKO());
  }

  start() {
    this.engine.start();
    if (this.controller) this.controller.attach();
    if (this.agent) this.agent.reset();
    window.addEventListener('resize', this._onResize);
    this.running = true;
    this.lastTs = 0;
    this._renderHud(); // 초기 HUD/프리뷰
    requestAnimationFrame(this._frame);
    return this;
  }

  /** 키 입력 기반 재시작: 게임오버 상태에서만 허용(플레이 중 오발 방지). */
  requestRestart() {
    if (this.engine.gameOver) this.restart();
  }

  restart() {
    this.engine.start();
    if (this.controller) this.controller.reset();
    if (this.agent) this.agent.reset();
    if (this.effects) this.effects.reset();
    if (this.onRestart) this.onRestart();
    this._setOverlay('none');
    this._renderHud();
  }

  togglePause() {
    if (this.engine.gameOver || !this.engine.started) return;
    this.engine.setPaused(!this.engine.paused);
    if (this.controller) this.controller.reset();
    this._setOverlay(this.engine.paused ? 'paused' : 'none');
  }

  /**
   * 일시정지 상태를 명시적으로 설정한다(per-board 오버레이 없이). 상위 흐름(g8
   * MatchFlow)이 카운트다운/일시정지/결과 동안 보드를 얼리는(freeze) 용도.
   * 게임 규칙은 엔진에만 — 여기서는 엔진 pause 토글 + 입력 상태 초기화만 한다.
   */
  setPaused(v) {
    if (!this.engine.started) return;
    this.engine.setPaused(!!v);
    if (this.controller) this.controller.reset();
  }

  /** AI 난이도 교체(g8 난이도 선택 UI). AI 보드에서만 유효. 다음 피스부터 반영. */
  setAIDifficulty(d) {
    if (this.agent) this.agent.setDifficulty(d);
  }

  _onResize() {
    this.renderer.resize();
    if (this.effects) this.effects.resize();
  }

  _frame(ts) {
    if (!this.running) return;
    const dt = this.lastTs ? Math.min(MAX_DT, ts - this.lastTs) : 0;
    this.lastTs = ts;

    if (!this.engine.paused && !this.engine.gameOver) {
      // 입력 주체가 먼저 커맨드를 내리고(키보드 또는 봇), 이어 엔진이 중력/락을 진행.
      if (this.controller) this.controller.update(dt);
      if (this.agent) this.agent.update(dt);
      this.engine.update(dt); // 라인클리어/T스핀/탑아웃 이벤트 → 이펙트 트리거
    }

    const snap = this.engine.snapshot();
    this.renderer.render(snap);
    this._renderHud(snap);

    // 이펙트 레이어: 위험 경고 갱신 + 프레임 전진(파티클/플래시/셰이크).
    if (this.effects) {
      this.effects.setDanger(!this.engine.gameOver && this._inDanger(snap));
      this.effects.update(dt);
    }

    // 상위 레이어(g7 대전) 프레임 훅: 예고 충전 진행 + 예고/게이지 렌더.
    if (this.onTick) this.onTick(dt, snap);

    if (snap.gameOver) this._setOverlay('gameover');

    requestAnimationFrame(this._frame);
  }

  /** 스택이 상단 DANGER_ROWS 안에 닿았는가(위험 경고 펄스 트리거). */
  _inDanger(snap) {
    const board = snap.board;
    const limit = Math.min(DANGER_ROWS, board.length);
    for (let r = 0; r < limit; r++) {
      const row = board[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c]) return true;
      }
    }
    return false;
  }

  _renderHud(snap = this.engine.snapshot()) {
    // 홀드 / 넥스트 미니 렌더(전용 슬롯이 없는 보드 — 예: AI — 는 건너뛴다)
    if (this.holdPreview) this.holdPreview.render(snap.hold || null);
    for (let i = 0; i < this.nextPreviews.length; i++) {
      this.nextPreviews[i].render(snap.next[i] || null);
    }
    // 콤보 미터
    const combo = Math.max(0, snap.combo);
    if (this.cfg.comboValue) this.cfg.comboValue.textContent = String(combo);
    if (this.cfg.comboFill) {
      const pct = Math.min(1, combo / COMBO_FILL_MAX) * 100;
      this.cfg.comboFill.style.width = `${pct}%`;
      // 콤보 진행 중에만 미터를 활성(펄스) 상태로 — 마이크로 인터랙션.
      this.cfg.comboFill.parentElement &&
        this.cfg.comboFill.parentElement.classList.toggle('is-active', combo > 0);
    }
    // 스코어 / 레벨 / 라인 읽기(전용 슬롯이 있는 보드에서만 — 보통 플레이어).
    if (this.cfg.scoreValue) this.cfg.scoreValue.textContent = formatScore(snap.score);
    if (this.cfg.levelValue) this.cfg.levelValue.textContent = String(snap.level);
    if (this.cfg.linesValue) this.cfg.linesValue.textContent = String(snap.lines);
  }

  /** 오버레이 상태: 'none' | 'paused' | 'gameover'. */
  _setOverlay(state) {
    // 상위 흐름(g8)이 전역 씬으로 일시정지/결과를 표시하면 per-board 오버레이는 끈다.
    if (this.cfg.suppressOverlay) return;
    const el = this.cfg.overlay;
    if (!el) return;
    if (state === this._overlayState) return; // 같은 상태면 DOM 재구성 생략
    this._overlayState = state;
    if (state === 'none') {
      el.hidden = true;
      el.innerHTML = '';
      el.classList.remove('board-frame__overlay--gameover', 'board-frame__overlay--paused');
      return;
    }
    el.hidden = false;
    el.classList.toggle('board-frame__overlay--gameover', state === 'gameover');
    el.classList.toggle('board-frame__overlay--paused', state === 'paused');
    const title = state === 'gameover' ? 'GAME OVER' : 'PAUSED';
    const hint = state === 'gameover' ? 'PRESS ENTER TO RETRY' : 'PRESS P TO RESUME';
    el.innerHTML =
      `<div class="overlay-message">` +
      `<span class="overlay-message__title">${title}</span>` +
      `<span class="overlay-message__hint">${hint}</span>` +
      `</div>`;
  }

  /** 토큰 재해석(폰트 로드 후 색이 빈 문자열로 잡히는 것 방지용). */
  refreshPalette() {
    this.palette.refresh();
    if (this.effects) this.effects.refresh();
  }
}
