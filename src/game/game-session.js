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

export class GameSession {
  /**
   * @param {object} cfg
   * @param {HTMLCanvasElement} cfg.canvas
   * @param {HTMLElement} cfg.overlay
   * @param {HTMLElement} cfg.holdSlot
   * @param {HTMLElement[]} cfg.nextSlots
   * @param {HTMLElement} [cfg.comboValue]
   * @param {HTMLElement} [cfg.comboFill]
   * @param {HTMLCanvasElement} [cfg.fxCanvas]   이펙트(FX) 캔버스 오버레이
   * @param {HTMLElement} [cfg.surface]          셰이크/글로우/위험 펄스 타겟(Surface)
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
        onPause: () => this.togglePause(),
        onRestart: () => this.requestRestart(),
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
    }
  }

  /** 오버레이 상태: 'none' | 'paused' | 'gameover'. */
  _setOverlay(state) {
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
