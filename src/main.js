// ============================================================================
// main.js — charlie-smoke-web-tetris 부트스트랩
//
// 이 grain의 책임은 "레이아웃 셸"이다. 여기서는 모듈 로딩과 게임 인스턴스가
// 들어갈 슬롯만 마련한다. 게임 로직 / 렌더링 / 이펙트 / AI는 이후 grain에서
// 채운다. 이 파일은 게임 상태를 만들거나 만지지 않는다.
// ============================================================================

/**
 * 레이아웃 셸에서 게임 모듈이 붙을 DOM 핸들을 수집한다.
 * (실제 게임 인스턴스 생성/연결은 이후 grain에서.)
 */
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

/**
 * 부트스트랩 진입점. 게임 인스턴스 슬롯을 노출만 해 두고,
 * 이후 grain의 모듈이 이 슬롯을 채운다.
 */
function bootstrap() {
  const mounts = collectMounts();

  // 이후 grain에서 채울 게임 인스턴스 슬롯 (현재는 비어 있음).
  const game = {
    mounts,
    player: null, // 플레이어 게임 인스턴스 슬롯
    ai: null, // AI 게임 인스턴스 슬롯
  };

  // 디버깅/후속 grain 연결을 위해 셸 핸들을 전역에 노출한다.
  window.__NEON_BLITZ__ = game;

  return game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}

export { bootstrap, collectMounts };
