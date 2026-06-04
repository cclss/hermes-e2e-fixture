// ============================================================================
// ai/index.js — 휴리스틱 봇 공개 API (배럴)
//
// 게임 세션은 이 모듈만 임포트하면 된다. AI는 별도 g3 엔진 인스턴스를 구동하며
// DOM/렌더/오디오/플레이어 입력에 비의존한다(헤드리스 — node 검증 가능).
//
// 예)
//   import { AIController } from './ai/index.js';
//   const bot = new AIController({ getEngine: () => aiEngine, difficulty: 'hard' });
//   // 메인 루프에서: bot.update(dt); aiEngine.update(dt);
// ============================================================================

export { AIController } from './ai-controller.js';
export { DIFFICULTIES, DIFFICULTY_ORDER, resolveDifficulty } from './difficulty.js';
export { planMove, scorePlacements, enumeratePlacements } from './placement-search.js';
export {
  evaluateGrid,
  columnHeights,
  countHoles,
  bumpiness,
  wellDepths,
  DEFAULT_WEIGHTS,
} from './heuristics.js';
