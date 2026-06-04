// ============================================================================
// scoring.js — T-스핀 판정 + 표준 스코어링 + Back-to-Back + 콤보 (순수 로직)
//
// 가비지/공격 라인 수치는 여기서 계산하지 않는다(g7 범위). 대신 라인클리어의
// "사실"(라인 수·T스핀 종류·B2B·콤보·퍼펙트클리어)을 구조화해 노출하고,
// g7이 그 사실로부터 패널티 라인을 산출한다. 경계를 깨끗하게 유지한다.
// ============================================================================

// 표준 라인 클리어 점수(레벨 곱하기 전 기본값).
export const LINE_SCORES = Object.freeze([0, 100, 300, 500, 800]); // [0,single,double,triple,tetris]

// T-스핀 정식(full) 점수: [0줄, 싱글, 더블, 트리플].
export const TSPIN_SCORES = Object.freeze([400, 800, 1200, 1600]);

// T-스핀 미니 점수: [0줄, 싱글, 더블].
export const TSPIN_MINI_SCORES = Object.freeze([100, 200, 400]);

// 퍼펙트 클리어(올 클리어) 보너스: [_, 싱글, 더블, 트리플, 테트리스].
export const PERFECT_CLEAR_SCORES = Object.freeze([0, 800, 1200, 1800, 2000]);

const B2B_MULTIPLIER = 1.5;
const COMBO_UNIT = 50;
const LINES_PER_LEVEL = 10;

/**
 * (x,y) 코너가 "점유"로 간주되는가? — 벽(좌/우)과 바닥은 점유로 취급한다.
 * 천장 위(y<0)는 비점유. T-스핀 3-코너 규칙용.
 */
function cornerOccupied(board, x, y) {
  if (x < 0 || x >= board.width) return true; // 좌우 벽
  if (y >= board.height) return true; // 바닥
  if (y < 0) return false; // 천장 위
  return board.grid[y][x] !== null;
}

// 회전 상태별 "정면(front)" 두 코너 인덱스. 코너 배열은 [TL, TR, BL, BR] 순서.
//   0(위 향함): 정면 = TL, TR
//   1(오른쪽): 정면 = TR, BR
//   2(아래):   정면 = BL, BR
//   3(왼쪽):   정면 = TL, BL
const FRONT_CORNERS = Object.freeze({
  0: [0, 1],
  1: [1, 3],
  2: [2, 3],
  3: [0, 2],
});

/**
 * T-스핀 판정(3-코너 규칙 + 미니/정식 구분 + 마지막 킥 승격).
 * T 피스가 아니거나 직전 동작이 회전이 아니면 'none'.
 *
 * @param {import('./board.js').Board} board
 * @param {string} type   피스 타입
 * @param {number} px      박스 좌상단 x (3x3)
 * @param {number} py      박스 좌상단 y
 * @param {number} state   회전 상태 0..3
 * @param {boolean} lastMoveWasRotation  직전 성공 동작이 회전이었는가
 * @param {boolean} usedLastKick          그 회전이 마지막(5번째) 월킥 후보로 성공했는가
 * @returns {'none'|'mini'|'full'}
 */
export function detectTSpin(board, type, px, py, state, lastMoveWasRotation, usedLastKick) {
  if (type !== 'T' || !lastMoveWasRotation) return 'none';

  // 3x3 박스의 네 코너: TL, TR, BL, BR
  const corners = [
    cornerOccupied(board, px + 0, py + 0), // TL
    cornerOccupied(board, px + 2, py + 0), // TR
    cornerOccupied(board, px + 0, py + 2), // BL
    cornerOccupied(board, px + 2, py + 2), // BR
  ];
  const filled = corners.reduce((n, c) => n + (c ? 1 : 0), 0);
  if (filled < 3) return 'none';

  const [f1, f2] = FRONT_CORNERS[state];
  const frontBoth = corners[f1] && corners[f2];

  if (frontBoth) return 'full';
  // 정면 두 코너가 모두 차지 않았어도, 마지막 킥으로 비튼 회전이면 정식으로 승격.
  if (usedLastKick) return 'full';
  return 'mini';
}

/**
 * 점수/레벨/라인/콤보/B2B 상태를 보유하고, 락(lock) 1회의 결과를 산출한다.
 * 엔진이 이 객체를 소유하고 lock 시점에 lockResult()를 호출한다.
 */
export class Scoring {
  constructor(opts = {}) {
    this.level = opts.level ?? 1;
    this.startLevel = this.level;
    this.score = 0;
    this.lines = 0;
    this.combo = -1; // 라인 클리어가 연속될 때 증가. -1 = 콤보 없음
    this.backToBack = false; // 직전 클리어가 difficult였는가
  }

  /** 소프트 드롭: 내려간 칸당 1점. */
  addSoftDrop(cells) {
    const pts = Math.max(0, cells | 0);
    this.score += pts;
    return pts;
  }

  /** 하드 드롭: 떨어진 칸당 2점. */
  addHardDrop(cells) {
    const pts = Math.max(0, cells | 0) * 2;
    this.score += pts;
    return pts;
  }

  /**
   * 한 번의 락 결과를 반영하고 점수 변화를 반환한다.
   * @param {object} info
   * @param {number} info.linesCleared  0..4
   * @param {'none'|'mini'|'full'} info.tSpin
   * @param {boolean} [info.perfectClear]  클리어 후 보드가 완전히 비었는가
   * @returns {{
   *   points:number, basePoints:number, comboBonus:number,
   *   b2bApplied:boolean, combo:number, backToBack:boolean,
   *   leveledUp:boolean, level:number, difficult:boolean
   * }}
   */
  lockResult({ linesCleared, tSpin, perfectClear = false }) {
    const level = this.level;
    const lc = linesCleared | 0;
    const isTSpin = tSpin === 'full' || tSpin === 'mini';

    // difficult clear = 테트리스(4줄) 또는 라인을 지운 모든 T-스핀.
    const difficult = (lc > 0 && isTSpin) || lc === 4;

    // --- 기본 점수 ---
    let base = 0;
    if (isTSpin) {
      base = tSpin === 'full' ? TSPIN_SCORES[lc] ?? 0 : TSPIN_MINI_SCORES[lc] ?? 0;
    } else {
      base = LINE_SCORES[lc] ?? 0;
    }
    base *= level;

    // --- Back-to-Back ---
    // 직전이 difficult였고 이번도 difficult면 라인 점수에 x1.5.
    let b2bApplied = false;
    if (lc > 0) {
      if (difficult && this.backToBack) {
        base = Math.floor(base * B2B_MULTIPLIER);
        b2bApplied = true;
      }
      // B2B 체인은 difficult면 유지/시작, 비-difficult 라인 클리어면 끊긴다.
      this.backToBack = difficult;
    }
    // 라인을 지우지 못한 T-스핀(0줄)은 B2B를 끊지도 잇지도 않는다.

    // --- 콤보 ---
    if (lc > 0) {
      this.combo += 1;
    } else {
      this.combo = -1;
    }
    const comboBonus = this.combo >= 1 ? COMBO_UNIT * this.combo * level : 0;

    // --- 퍼펙트 클리어 보너스 ---
    let pcBonus = 0;
    if (perfectClear && lc > 0) {
      pcBonus = (PERFECT_CLEAR_SCORES[lc] ?? 0) * level;
    }

    const points = base + comboBonus + pcBonus;
    this.score += points;

    // --- 레벨/라인 ---
    const before = this.level;
    this.lines += lc;
    this.level = this.startLevel + Math.floor(this.lines / LINES_PER_LEVEL);
    const leveledUp = this.level > before;

    return {
      points,
      basePoints: base,
      comboBonus,
      perfectClearBonus: pcBonus,
      b2bApplied,
      combo: this.combo,
      backToBack: this.backToBack,
      leveledUp,
      level: this.level,
      difficult,
    };
  }
}
