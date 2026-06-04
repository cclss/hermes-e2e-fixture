// ============================================================================
// engine/index.js — 코어 테트리스 엔진 공개 API (배럴)
//
// 후속 grain(렌더/입력/AI/가비지)은 이 모듈만 임포트하면 된다.
// 엔진은 헤드리스다: DOM/캔버스/오디오/입력 바인딩을 일절 포함하지 않으며,
// 게임 상태는 update(dt)와 커맨드 메서드로만 바뀌고, 변화는 이벤트로 노출된다.
//
// 예)
//   import { TetrisEngine, EVENTS } from './engine/index.js';
//   const game = new TetrisEngine({ seed: 1234, level: 1 });
//   game.on(EVENTS.LINE_CLEAR, (e) => { /* 이펙트 트리거 */ });
//   game.on(EVENTS.COMBO, (e) => { /* g7: 패널티 라인 산출 */ });
//   game.start();
//   // 메인 루프에서: game.update(deltaMs); render(game.snapshot());
// ============================================================================

export { TetrisEngine, EVENTS, gravityForLevel } from './engine.js';
export { Board } from './board.js';
export { BagRandomizer, mulberry32, shuffle } from './randomizer.js';
export {
  Scoring,
  detectTSpin,
  LINE_SCORES,
  TSPIN_SCORES,
  TSPIN_MINI_SCORES,
  PERFECT_CLEAR_SCORES,
} from './scoring.js';
export { getKicks, KICK_TABLES } from './srs.js';
export { SHAPES, PIECE_TYPES, spawnX, normState } from './pieces.js';
export { Emitter } from './events.js';
