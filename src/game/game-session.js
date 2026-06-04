// ============================================================================
// game/game-session.js — 한 플레이어 보드의 게임 세션 (루프 + 배선)
//
// 엔진(g3 API) + 보드 렌더러 + 홀드/넥스트 미니 렌더 + 키보드 컨트롤러 +
// HUD/오버레이를 묶어 requestAnimationFrame 루프로 구동한다. 게임 규칙은
// 엔진에만 있고, 여기서는 update(dt) 호출과 스냅샷 렌더만 한다.
// ============================================================================

import { TetrisEngine } from '../engine/index.js';
import { Palette } from '../render/palette.js';
import { BoardRenderer } from '../render/board-renderer.js';
import { PreviewRenderer } from '../render/preview-renderer.js';
import { KeyboardController } from '../input/keyboard-controller.js';

const MAX_DT = 50; // 탭 비활성 후 점프 방지(ms 상한)
const COMBO_FILL_MAX = 10; // 콤보 미터가 가득 차는 기준 콤보 수

export class GameSession {
  /**
   * @param {object} cfg
   * @param {HTMLCanvasElement} cfg.canvas
   * @param {HTMLElement} cfg.overlay
   * @param {HTMLElement} cfg.holdSlot
   * @param {HTMLElement[]} cfg.nextSlots
   * @param {HTMLElement} [cfg.comboValue]
   * @param {HTMLElement} [cfg.comboFill]
   * @param {number} [cfg.seed]
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

    this.holdPreview = new PreviewRenderer(cfg.holdSlot, this.palette);
    this.nextPreviews = (cfg.nextSlots || []).map((el) => new PreviewRenderer(el, this.palette));

    this.controller = new KeyboardController({
      engine: () => this.engine,
      onPause: () => this.togglePause(),
      onRestart: () => this.requestRestart(),
      isActive: () => this.engine.started && !this.engine.paused && !this.engine.gameOver,
      target: window,
    });

    this.lastTs = 0;
    this.running = false;
    this._frame = this._frame.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  start() {
    this.engine.start();
    this.controller.attach();
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
    this.controller.reset();
    this._setOverlay('none');
    this._renderHud();
  }

  togglePause() {
    if (this.engine.gameOver || !this.engine.started) return;
    this.engine.setPaused(!this.engine.paused);
    this.controller.reset();
    this._setOverlay(this.engine.paused ? 'paused' : 'none');
  }

  _onResize() {
    this.renderer.resize();
  }

  _frame(ts) {
    if (!this.running) return;
    const dt = this.lastTs ? Math.min(MAX_DT, ts - this.lastTs) : 0;
    this.lastTs = ts;

    if (!this.engine.paused && !this.engine.gameOver) {
      this.controller.update(dt);
      this.engine.update(dt);
    }

    const snap = this.engine.snapshot();
    this.renderer.render(snap);
    this._renderHud(snap);

    if (snap.gameOver) this._setOverlay('gameover');

    requestAnimationFrame(this._frame);
  }

  _renderHud(snap = this.engine.snapshot()) {
    // 홀드 / 넥스트 미니 렌더
    this.holdPreview.render(snap.hold || null);
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
  }
}
