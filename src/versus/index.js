// ============================================================================
// versus/index.js — 대전 메커니즘 공개 API (배럴, g7)
//
// 가비지 공격 산출(순수) + 두 GameSession을 묶는 오케스트레이터.
//   import { VersusController } from './versus/index.js';
//   const vs = new VersusController({ player, ai, attackPlayerEl, attackAiEl });
// ============================================================================

export { VersusController } from './versus-controller.js';
export {
  computeAttackLines,
  nextHoleColumn,
  ATTACK_LINES,
  TSPIN_ATTACK,
  TSPIN_MINI_ATTACK,
  COMBO_BONUS,
  B2B_BONUS,
  PERFECT_CLEAR_BONUS,
} from './attack-table.js';
export { ATTACK_CALLOUTS, PLAYER_TAUNTS, AI_TAUNTS, TAUNT_LINES, pickTaunt } from './taunts.js';
