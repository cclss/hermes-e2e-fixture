// ============================================================================
// ai/heuristics.js — 보드 평가 휴리스틱 (순수 로직, DOM/렌더 비의존)
//
// 봇이 "어디에 놓을지"를 정하기 위한 보드 상태 평가. grain 명세의 5개 특징을
// 추출한다: 집계 높이(aggregateHeight)·구멍(holes)·표면 거칠기(bumpiness)·
// 완성 라인(lines)·우물(wells). 거기에 착지 높이(landingHeight)와 테트리스
// 우물 준비도를 더해 점수화한다.
//
// 입력은 plain 2D 그리드(rows = y, cols = x, 셀 = 타입 키 문자열 | null). 엔진의
// board.grid와 같은 표현이라 별도 변환 없이 평가할 수 있다(g3 재사용). 색/픽셀을
// 일절 다루지 않으므로 node에서 단위 검증 가능하다.
//
// 가중치는 시각 디자인 값이 아니라 봇의 의사결정 품질 튜닝값이다(Spec 미기록,
// coding.md 구현 설정값 분류 — DAS/ARR과 동일 축).
// ============================================================================

/**
 * 기본 평가 가중치. 점수가 높을수록 좋은 배치다.
 * - height/holes/bumpiness/well/landing: 낮을수록 좋음 → 음수 가중치
 * - lines: 많을수록 좋음 → 양수 가중치
 * (잘 알려진 테트리스 휴리스틱 계열을 기준으로 우물·착지·테트리스 보너스를 추가)
 */
export const DEFAULT_WEIGHTS = Object.freeze({
  height: -0.51, // 집계 높이(모든 열 높이의 합)
  lines: 0.76, // 이번 배치로 지워지는 라인 수
  holes: -0.36, // 막힌 빈칸(위에 블록이 있는 빈칸)
  bumpiness: -0.18, // 인접 열 높이차의 합(표면 거칠기)
  well: -0.18, // 우물 깊이의 합(공격성으로 가장 깊은 우물 1개는 면제)
  landing: -0.12, // 피스가 착지한 높이(높게 쌓을수록 위험)
  tetrisReady: 0.9, // 깊이≥4 우물 유지 보너스(공격성 비례)
});

/**
 * 열별 높이. height[c] = (바닥에서 가장 높은 채워진 셀까지의 칸 수).
 * 빈 열은 0.
 * @param {(string|null)[][]} grid
 * @param {number} W 열 수
 * @param {number} H 행 수(버퍼 포함 전체)
 * @returns {number[]}
 */
export function columnHeights(grid, W, H) {
  const heights = new Array(W).fill(0);
  for (let c = 0; c < W; c++) {
    for (let y = 0; y < H; y++) {
      if (grid[y][c] != null) {
        heights[c] = H - y;
        break;
      }
    }
  }
  return heights;
}

/**
 * 막힌 구멍 수. 각 열에서 가장 높은 블록보다 아래에 있는 빈칸의 총합.
 * @param {(string|null)[][]} grid
 * @param {number[]} heights columnHeights 결과
 */
export function countHoles(grid, heights, W, H) {
  let holes = 0;
  for (let c = 0; c < W; c++) {
    if (heights[c] === 0) continue;
    const top = H - heights[c]; // 첫 채워진 행 인덱스
    for (let y = top + 1; y < H; y++) {
      if (grid[y][c] == null) holes++;
    }
  }
  return holes;
}

/** 표면 거칠기: 인접 열 높이차 절댓값의 합. */
export function bumpiness(heights) {
  let b = 0;
  for (let i = 0; i < heights.length - 1; i++) {
    b += Math.abs(heights[i] - heights[i + 1]);
  }
  return b;
}

/**
 * 열별 우물 깊이. 좌우 이웃(벽은 천장 높이 H로 취급)보다 낮은 만큼.
 * 가장자리 열이 비면 벽 덕에 깊은 우물로 잡혀 테트리스 셋업을 유도한다.
 */
export function wellDepths(heights, W, H) {
  const depths = new Array(W).fill(0);
  for (let c = 0; c < W; c++) {
    const left = c > 0 ? heights[c - 1] : H;
    const right = c < W - 1 ? heights[c + 1] : H;
    const d = Math.min(left, right) - heights[c];
    depths[c] = d > 0 ? d : 0;
  }
  return depths;
}

/**
 * 그리드 상태를 점수화한다.
 * @param {(string|null)[][]} grid  락+라인클리어가 끝난 가상 보드
 * @param {number} W
 * @param {number} H
 * @param {object} [ctx]
 * @param {number} [ctx.lines=0]          이번 배치로 지워진 라인 수
 * @param {number} [ctx.landingHeight=0]  피스가 착지한 바닥 기준 높이
 * @param {object} [ctx.weights]          가중치(기본 DEFAULT_WEIGHTS)
 * @param {number} [ctx.aggression=0]     0..1, 클수록 테트리스 우물을 노린다
 * @param {number} [ctx.safeHeight=12]    스택이 이 높이를 넘으면 공격성을 끄고
 *                                        생존(다운스택)을 우선한다 — 자살적 스택 방지
 * @returns {{score:number,aggregateHeight:number,holes:number,bumpiness:number,wellSum:number,deepWell:number,maxHeight:number,lines:number,heights:number[]}}
 */
export function evaluateGrid(grid, W, H, ctx = {}) {
  const {
    lines = 0,
    landingHeight = 0,
    weights = DEFAULT_WEIGHTS,
    aggression = 0,
    safeHeight = 12,
  } = ctx;

  const heights = columnHeights(grid, W, H);
  let aggregateHeight = 0;
  let maxHeight = 0;
  for (let i = 0; i < W; i++) {
    aggregateHeight += heights[i];
    if (heights[i] > maxHeight) maxHeight = heights[i];
  }
  const holes = countHoles(grid, heights, W, H);
  const bump = bumpiness(heights);
  const wells = wellDepths(heights, W, H);
  let wellSum = 0;
  let deepWell = 0;
  for (const d of wells) {
    wellSum += d;
    if (d > deepWell) deepWell = d;
  }

  // 안전 게이팅: 스택이 위험 높이를 넘으면 공격성을 끄고 무조건 정리한다.
  // (테트리스 우물을 노리느라 탑아웃하는 자살적 플레이를 막는다)
  const a = maxHeight > safeHeight ? 0 : aggression;

  // 라인 보상: 클리어는 언제나 보상한다(거부 금지). 테트리스(4줄)만 추가 가산.
  let lineScore;
  if (lines <= 0) lineScore = 0;
  else if (lines >= 4) lineScore = weights.lines * (4 + a * 3);
  else lineScore = weights.lines * lines;

  // 공격형은 안전할 때만 가장 깊은 우물 1개를 패널티에서 면제(테트리스용 우물 유지).
  const effectiveWellSum = wellSum - deepWell * a;

  let score =
    weights.height * aggregateHeight +
    lineScore +
    weights.holes * holes +
    weights.bumpiness * bump +
    weights.well * effectiveWellSum +
    weights.landing * landingHeight;

  // 안전하고 깊이 4 이상 우물을 갖춘 상태(테트리스 준비)면 공격성 비례 보너스.
  if (a > 0 && deepWell >= 4) score += weights.tetrisReady * a;

  return {
    score,
    aggregateHeight,
    holes,
    bumpiness: bump,
    wellSum,
    deepWell,
    maxHeight,
    lines,
    heights,
  };
}
