// ============================================================================
// versus/attack-table.js — 공격(가비지) 라인 산출 + 구멍 컬럼 모델 (순수 로직)
//
// 경계(g7): 코어 스코어/콤보/B2B "사실"은 엔진(g3)이 LINE_CLEAR 페이로드로 노출하고,
// 여기서는 그 사실 → "상대에게 보낼 패널티 라인 수"만 계산한다. DOM/엔진 비의존.
//
// 표는 모던 가이드라인 대전(테트리스 99/뿌요뿌요테트리스류)의 통념을 따르되,
// 박진감을 위해 콤보 누적과 B2B/퍼펙트클리어 보너스를 또렷하게 준다.
// ============================================================================

// 일반(스핀 아님) 라인 클리어 → 전송 라인. [_, single, double, triple, tetris]
export const ATTACK_LINES = Object.freeze([0, 0, 1, 2, 4]);

// T-스핀 정식(full) → 전송 라인. [0줄, 싱글, 더블, 트리플]
export const TSPIN_ATTACK = Object.freeze([0, 2, 4, 6]);

// T-스핀 미니 → 전송 라인. [0줄, 싱글, 더블]
export const TSPIN_MINI_ATTACK = Object.freeze([0, 1, 2]);

// Back-to-Back(테트리스/스핀 연쇄) 보너스 라인.
export const B2B_BONUS = 1;

// 퍼펙트 클리어(올 클리어) 보너스 라인 — 강력한 한 방.
export const PERFECT_CLEAR_BONUS = 10;

// 콤보 누적 보너스. 인덱스 = 엔진 콤보 값(0=첫 클리어, 1=2연속, 2=3연속, …).
// 길이를 넘는 콤보는 마지막 값으로 포화. 누적이 길수록 압박이 커진다(박진감).
//   첫 0 · 2연속 1 · 3연속 1 · 4연속 2 · 5연속 2 · 6연속 3 · … · 10연속+ 5
export const COMBO_BONUS = Object.freeze([0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);

/**
 * LINE_CLEAR 페이로드로부터 상대에게 보낼 패널티 라인 수를 산출한다.
 * @param {object} p
 * @param {number} p.count               지운 라인 수(1..4)
 * @param {'none'|'mini'|'full'} [p.tSpin]
 * @param {boolean} [p.backToBack]        이번 클리어에 B2B 배수가 적용됐는가
 * @param {number} [p.combo]              엔진 콤보 값(-1=없음, 0=2연속 시작…)
 * @param {boolean} [p.perfectClear]
 * @returns {number} 전송 라인(0 이상 정수)
 */
export function computeAttackLines(p = {}) {
  const count = Math.max(0, p.count | 0);
  if (count === 0) return 0;

  let lines;
  if (p.tSpin === 'full') lines = TSPIN_ATTACK[count] ?? 0;
  else if (p.tSpin === 'mini') lines = TSPIN_MINI_ATTACK[count] ?? 0;
  else lines = ATTACK_LINES[count] ?? 0;

  // B2B: 난이도 클리어(테트리스/라인 동반 스핀)가 연쇄될 때만 페이로드가 표시한다.
  if (p.backToBack) lines += B2B_BONUS;

  // 콤보 누적. 엔진 콤보는 첫 클리어 0, 둘째 1… → 표를 콤보 값으로 직접 인덱싱.
  const combo = Math.max(0, p.combo | 0);
  lines += COMBO_BONUS[Math.min(combo, COMBO_BONUS.length - 1)];

  if (p.perfectClear) lines += PERFECT_CLEAR_BONUS;

  return lines;
}

/**
 * 다음 가비지 구멍 컬럼을 고른다. 같은 배치 안에서는 높은 확률로 직전 구멍을
 * 유지해(읽히는 "깨끗한" 가비지) 가끔 어긋나게 한다(messy). 결정적 rng 주입 가능.
 *
 * @param {()=>number} rng        0..1 난수원
 * @param {number|null} prevHole  직전 구멍 컬럼(없으면 null)
 * @param {number} width          보드 폭
 * @param {number} [repeatProb=0.72]  직전 구멍 유지 확률
 * @returns {number} 구멍 컬럼(0..width-1)
 */
export function nextHoleColumn(rng, prevHole, width, repeatProb = 0.72) {
  const w = Math.max(1, width | 0);
  if (prevHole != null && rng() < repeatProb) return ((prevHole % w) + w) % w;
  let h = Math.floor(rng() * w) % w;
  if (prevHole != null && h === prevHole) h = (h + 1) % w; // 유지 분기 밖에선 반드시 어긋나게
  return h;
}
