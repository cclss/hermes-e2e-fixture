// ============================================================================
// main.js — charlie-smoke-web-tetris 부트스트랩
//
// 레이아웃 셸의 DOM 핸들을 모아 플레이어 보드의 게임 세션을 구동한다.
// (게임 규칙은 엔진(g3 API)에만, 픽셀은 렌더 레이어에만.)
//
// 이 grain의 범위: 단일 보드 플레이 + 렌더 + 입력 + 루프. AI 보드는 시각
// 정합을 위해 "빈 보드"만 렌더한다(AI 로직/가비지/이펙트는 후속 grain).
// ============================================================================

import { GameSession } from './game/game-session.js';
import { Palette } from './render/palette.js';
import { BoardRenderer } from './render/board-renderer.js';

/** 레이아웃 셸에서 게임 모듈이 붙을 DOM 핸들을 수집한다. */
function collectMounts() {
  return {
    arena: document.querySelector('.versus-arena'),
    player: {
      frame: document.querySelector('.board-frame--player'),
      canvas: document.querySelector('.board-frame--player .board-frame__canvas'),
      overlay: document.querySelector('[data-slot="player-overlay"]'),
    },
    ai: {
      frame: document.querySelector('.board-frame--ai'),
      canvas: document.querySelector('.board-frame--ai .board-frame__canvas'),
      overlay: document.querySelector('[data-slot="ai-overlay"]'),
    },
    hud: {
      hold: document.querySelector('[data-slot="hold"]'),
      next: [
        document.querySelector('[data-slot="next-0"]'),
        document.querySelector('[data-slot="next-1"]'),
        document.querySelector('[data-slot="next-2"]'),
      ],
      comboValue: document.querySelector('[data-slot="combo-value"]'),
      comboFill: document.querySelector('[data-slot="combo-fill"]'),
      attackPlayer: document.querySelector('[data-slot="attack-player"]'),
      attackAi: document.querySelector('[data-slot="attack-ai"]'),
    },
  };
}

/** 빈 가시 보드 스냅샷(AI 유휴 렌더용). */
function emptySnapshot(cols, rows) {
  const board = [];
  for (let r = 0; r < rows; r++) board.push(new Array(cols).fill(null));
  return { board, active: null, ghostY: null };
}

/** AI 보드: 로직 없이 빈 그리드만 렌더(시각 정합용). */
function renderIdleBoard(canvas) {
  if (!canvas) return;
  const COLS = 10;
  const ROWS = 20;
  const palette = new Palette();
  const renderer = new BoardRenderer(canvas, {
    cols: COLS,
    rows: ROWS,
    bufferRows: 20,
    palette,
  });
  const draw = () => {
    renderer.resize();
    renderer.render(emptySnapshot(COLS, ROWS));
  };
  draw();
  window.addEventListener('resize', draw);
}

/** 부트스트랩 진입점. */
function bootstrap() {
  const mounts = collectMounts();

  // 플레이어 보드: 완전 플레이 가능 세션.
  const session = new GameSession({
    canvas: mounts.player.canvas,
    overlay: mounts.player.overlay,
    holdSlot: mounts.hud.hold,
    nextSlots: mounts.hud.next,
    comboValue: mounts.hud.comboValue,
    comboFill: mounts.hud.comboFill,
    seed: (Date.now() >>> 0) || 1,
  });
  session.start();

  // 폰트가 늦게 로드돼도 색은 즉시 잡히지만, 안전하게 한 번 재해석한다.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => session.refreshPalette());
  }

  // AI 보드: 빈 보드만(후속 grain에서 AI/가비지 배선).
  renderIdleBoard(mounts.ai.canvas);

  const game = { mounts, player: session, ai: null };
  window.__NEON_BLITZ__ = game;
  return game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}

export { bootstrap, collectMounts };
