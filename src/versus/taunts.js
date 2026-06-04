// ============================================================================
// versus/taunts.js — 도발/공격 카피 (톤 결정의 단일 출처)
//
// 톤(결정, recording.md에 기록): 네온 아케이드. 짧은 영문 대문자 캡션, 위트 있게
// 도발적이되 "과하지 않게" — 비속어/모욕 금지, 게임플레이 용어를 살린 가벼운 약올림.
// 카피를 한 곳에 모아 g8(승패 화면)·g9(사운드)에서 재사용/현지화하기 쉽게 한다.
// ============================================================================

// 공격 종류별 콜아웃(짧고 강한 아케이드 캡션).
export const ATTACK_CALLOUTS = Object.freeze({
  tetris: 'TETRIS!',
  tspin: 'T-SPIN!',
  b2b: 'BACK-2-BACK!',
  perfectClear: 'PERFECT!',
});

// 사람 플레이어가 AI를 KO 직전으로 몰고 빠른 다운-탭(티배깅)으로 도발할 때.
export const PLAYER_TAUNTS = Object.freeze([
  'TOO EASY',
  'SIT DOWN',
  'GG?',
  'STAY DOWN',
]);

// AI가 사람을 KO 직전으로 몰았을 때 되받는 도발(기계적 위트).
export const AI_TAUNTS = Object.freeze([
  'NICE TRY',
  'IS THAT ALL?',
  'BEEP BOOP ;)',
  'COMPUTED.',
]);

// 도발 1회당 추가되는 압박 라인(소량 — 과하지 않게).
export const TAUNT_LINES = 1;

/**
 * 도발 카피 한 줄을 고른다. 결정적 rng 주입 가능(테스트).
 * @param {()=>number} rng
 * @param {boolean} fromAI  AI가 도발하는가
 * @returns {string}
 */
export function pickTaunt(rng, fromAI) {
  const pool = fromAI ? AI_TAUNTS : PLAYER_TAUNTS;
  const i = Math.min(pool.length - 1, Math.floor((rng ? rng() : 0) * pool.length));
  return pool[i];
}
