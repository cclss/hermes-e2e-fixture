// ============================================================================
// main.js — charlie-smoke-web-tetris 부트스트랩
//
// 레이아웃 셸의 DOM 핸들을 모아 플레이어 보드의 게임 세션을 구동한다.
// (게임 규칙은 엔진(g3 API)에만, 픽셀은 렌더 레이어에만.)
//
// 플레이어 보드는 키보드로, AI 보드는 휴리스틱 봇이 각자의 엔진 인스턴스로
// 구동한다(두 세션은 서로 독립 — 봇은 플레이어 입력/엔진에 간섭하지 않는다).
// 가비지 송수신·승패는 후속 grain(g7), 난이도 선택 UI는 g8.
// ============================================================================

import { GameSession } from './game/game-session.js';
import { VersusController } from './versus/index.js';
import { MatchFlow } from './game/match-flow.js';
import { AudioDirector } from './audio/index.js';

/** 레이아웃 셸에서 게임 모듈이 붙을 DOM 핸들을 수집한다. */
function collectMounts() {
  return {
    arena: document.querySelector('.versus-arena'),
    player: {
      frame: document.querySelector('.board-frame--player'),
      surface: document.querySelector('.board-frame--player .board-frame__surface'),
      canvas: document.querySelector('.board-frame--player .board-frame__canvas'),
      fx: document.querySelector('.board-frame--player .board-frame__fx'),
      overlay: document.querySelector('[data-slot="player-overlay"]'),
    },
    ai: {
      frame: document.querySelector('.board-frame--ai'),
      surface: document.querySelector('.board-frame--ai .board-frame__surface'),
      canvas: document.querySelector('.board-frame--ai .board-frame__canvas'),
      fx: document.querySelector('.board-frame--ai .board-frame__fx'),
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
      score: document.querySelector('[data-slot="score"]'),
      level: document.querySelector('[data-slot="level"]'),
      lines: document.querySelector('[data-slot="lines"]'),
    },
    scene: document.querySelector('[data-slot="scene"]'),
    mute: document.querySelector('[data-slot="mute"]'),
  };
}

// 기본(초기 선택) AI 난이도. 시작 화면에서 변경 가능(g8).
const DEFAULT_AI_DIFFICULTY = 'medium';

/** 부트스트랩 진입점. */
function bootstrap() {
  const mounts = collectMounts();

  // 플레이어 보드: 완전 플레이 가능 세션. 일시정지/결과는 전역 씬(g8)이 표시하므로
  // per-board 오버레이는 끄고, 일시정지/재시작 키는 MatchFlow가 위임받는다.
  const session = new GameSession({
    canvas: mounts.player.canvas,
    fxCanvas: mounts.player.fx,
    surface: mounts.player.surface,
    overlay: mounts.player.overlay,
    holdSlot: mounts.hud.hold,
    nextSlots: mounts.hud.next,
    comboValue: mounts.hud.comboValue,
    comboFill: mounts.hud.comboFill,
    scoreValue: mounts.hud.score,
    levelValue: mounts.hud.level,
    linesValue: mounts.hud.lines,
    suppressOverlay: true,
    seed: (Date.now() >>> 0) || 1,
  });

  // AI 보드: 휴리스틱 봇이 별도 엔진 인스턴스를 구동(플레이어와 독립).
  // 렌더/이펙트는 동일한 GameSession을 재사용한다(playfield·board-fx 재사용).
  const aiSession = new GameSession({
    canvas: mounts.ai.canvas,
    fxCanvas: mounts.ai.fx,
    surface: mounts.ai.surface,
    overlay: mounts.ai.overlay,
    ai: DEFAULT_AI_DIFFICULTY,
    suppressOverlay: true,
    // 플레이어와 다른 보드 전개를 위해 시드를 분리한다.
    seed: (((Date.now() >>> 0) ^ 0x9e3779b9) >>> 0) || 7,
  });

  // 대전(g7): 두 세션을 묶어 공격(가비지) 주고받기 + 예고/게이지 + 도발을 구동한다.
  // 게임 규칙은 각 엔진에만 — 컨트롤러는 이벤트 구독 + addGarbage 주입 + 연출만 한다.
  const versus = new VersusController({
    player: session,
    ai: aiSession,
    attackPlayerEl: mounts.hud.attackPlayer,
    attackAiEl: mounts.hud.attackAi,
    seed: (((Date.now() >>> 0) ^ 0x85ebca6b) >>> 0) || 13,
  });

  // 화면·게임 흐름(g8): 시작→카운트다운→플레이→KO→리매치를 오케스트레이션한다.
  // 보드/대전은 재사용만 — 흐름은 freeze/unfreeze + 전역 씬 표시로만 개입한다.
  const flow = new MatchFlow({
    scene: mounts.scene,
    player: session,
    ai: aiSession,
    versus,
    defaultDifficulty: DEFAULT_AI_DIFFICULTY,
  });

  // 사운드(g9): 엔진/대전/흐름 이벤트를 구독해 합성 SFX·BGM·음소거를 구동한다.
  // 게임 규칙은 일절 만지지 않는 이벤트 출력 레이어 — flow.init() 전에 onFlow 등
  // 훅을 설치해 첫 상태 전환부터 반영되게 한다.
  const audio = new AudioDirector({
    player: session,
    ai: aiSession,
    versus,
    flow,
    toggleEl: mounts.mute,
  });

  flow.init();

  // 폰트가 늦게 로드돼도 색은 즉시 잡히지만, 안전하게 한 번 재해석한다.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      session.refreshPalette();
      aiSession.refreshPalette();
      versus.refresh();
    });
  }

  const game = { mounts, player: session, ai: aiSession, versus, flow, audio };
  window.__NEON_BLITZ__ = game;
  return game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}

export { bootstrap, collectMounts };
