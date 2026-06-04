// ============================================================================
// ai/placement-search.js — 최적 배치 탐색 (순수 로직, g3 엔진/보드 재사용)
//
// 활성 피스가 놓일 수 있는 모든 (회전 상태 × 열) 후보를 열거하고, 각 후보를
// 가상 보드에 락+라인클리어한 결과를 heuristics.evaluateGrid로 점수화해 내림차순
// 정렬한다. 선택지는 "회전 후 수평 이동 후 하드드롭"으로 도달 가능한 배치 —
// 인간이 손으로 두는 방식과 동일하며, ai-controller가 이 plan을 단계 실행한다.
//
// 룩어헤드(어려움): 1차 배치 상위 빔만 다음 피스로 한 수 더 내다본 점수를 더해
// 재정렬한다(가지치기로 메인 루프 부하 억제).
//
// 충돌/회전 형상은 엔진(SHAPES, Board.collides)을 그대로 재사용한다 — 규칙
// 재구현 금지(coding.md 원칙 3).
// ============================================================================

import { SHAPES } from '../engine/pieces.js';
import { Board } from '../engine/board.js';
import { evaluateGrid, DEFAULT_WEIGHTS } from './heuristics.js';

// 형상이 중복되는 회전 상태는 한 번만 본다(대칭 피스의 헛스캔 방지).
const UNIQUE_STATES = Object.freeze({
  O: [0],
  I: [0, 1],
  S: [0, 1],
  Z: [0, 1],
  T: [0, 1, 2, 3],
  J: [0, 1, 2, 3],
  L: [0, 1, 2, 3],
});

function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

/**
 * 한 (type,state,x) 배치를 가상 보드에 떨궈 락+라인클리어한 결과를 만든다.
 * @returns {null | {type:string,state:number,x:number,lines:number,landingHeight:number,grid:(string|null)[][]}}
 *          해당 열에 놓을 수 없으면 null.
 */
function simulatePlacement(board, type, state, x) {
  const cells = SHAPES[type][state].cells;
  // 천장(y=0)에서조차 충돌하면 그 열엔 놓을 수 없다(가로 범위 밖/스택이 천장 침범).
  if (board.collides(cells, x, 0)) return null;

  // 바닥까지 낙하
  let y = 0;
  while (!board.collides(cells, x, y + 1)) y += 1;

  const W = board.width;
  const H = board.height;
  const grid = cloneGrid(board.grid);

  let maxCellY = 0;
  for (const c of cells) {
    const ay = y + c.y;
    const ax = x + c.x;
    if (ay >= 0 && ay < H) grid[ay][ax] = type;
    if (c.y > maxCellY) maxCellY = c.y;
  }

  // 가득 찬 행 수 집계
  let lines = 0;
  for (let r = 0; r < H; r++) {
    let full = true;
    for (let cc = 0; cc < W; cc++) {
      if (grid[r][cc] == null) {
        full = false;
        break;
      }
    }
    if (full) lines += 1;
  }

  // 라인 제거 후 그리드(위쪽 빈 행 보충) — 룩어헤드의 다음 수 평가에 쓰인다.
  let result = grid;
  if (lines > 0) {
    const kept = grid.filter((row) => row.some((v) => v == null));
    while (kept.length < H) kept.unshift(new Array(W).fill(null));
    result = kept;
  }

  // 착지 높이: 피스 최하단 셀이 바닥에서 떨어진 높이(0 = 바닥에 안착).
  const landingHeight = H - 1 - (y + maxCellY);

  return { type, state, x, lines, landingHeight, grid: result };
}

/**
 * 한 피스가 놓일 수 있는 모든 배치를 열거한다.
 * @param {Board} board
 * @param {string} type
 * @returns {Array} simulatePlacement 결과 목록
 */
export function enumeratePlacements(board, type) {
  const out = [];
  const W = board.width;
  const states = UNIQUE_STATES[type] || [0, 1, 2, 3];
  for (const state of states) {
    const cells = SHAPES[type][state].cells;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const c of cells) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
    }
    // 박스 좌상단 x 범위: 모든 셀이 [0, W) 안에 들어오도록
    const lo = -minX;
    const hi = W - 1 - maxX;
    for (let x = lo; x <= hi; x++) {
      const placed = simulatePlacement(board, type, state, x);
      if (placed) out.push(placed);
    }
  }
  return out;
}

/**
 * 배치 후보들을 점수화해 내림차순 정렬한다.
 * @param {Board} board
 * @param {string} type
 * @param {object} cfg  { weights, aggression }
 */
export function scorePlacements(board, type, cfg = {}) {
  const W = board.width;
  const H = board.height;
  const weights = cfg.weights || DEFAULT_WEIGHTS;
  const aggression = cfg.aggression || 0;
  const safeHeight = cfg.safeHeight != null ? cfg.safeHeight : 12;

  const placements = enumeratePlacements(board, type);
  for (const p of placements) {
    const ev = evaluateGrid(p.grid, W, H, {
      lines: p.lines,
      landingHeight: p.landingHeight,
      weights,
      aggression,
      safeHeight,
    });
    p.score = ev.score;
    p.features = ev;
  }
  placements.sort((a, b) => b.score - a.score);
  return placements;
}

/**
 * 현재 활성 피스의 배치 후보를 점수순으로 반환한다. 룩어헤드가 켜져 있으면
 * 상위 빔 후보에 한해 다음 피스(next[0])로 한 수 더 본 점수를 더해 재정렬한다.
 * @param {object} engine  g3 TetrisEngine 인스턴스(별도 구동되는 AI 엔진)
 * @param {object} cfg      { weights, aggression, lookahead, beam }
 * @returns {Array} 점수 내림차순 배치 후보. 비면 빈 배열.
 */
export function planMove(engine, cfg = {}) {
  if (!engine.active) return [];
  const board = engine.board;
  const type = engine.active.type;
  const candidates = scorePlacements(board, type, cfg);
  if (candidates.length === 0) return [];

  const lookahead = cfg.lookahead || 0;
  if (lookahead >= 1 && engine.next && engine.next.length > 0) {
    const nextType = engine.next[0];
    const beam = Math.max(1, cfg.beam || 6);
    // 빔 서치: 1차 점수 상위 beam개만 다음 피스로 한 수 더 본다(가지치기).
    const top = candidates.slice(0, beam);
    for (const c of top) {
      const vb = new Board({
        width: board.width,
        visibleHeight: board.visibleHeight,
        bufferRows: board.bufferRows,
      });
      vb.grid = c.grid; // 1차 배치 결과 그리드를 얹는다
      const sub = scorePlacements(vb, nextType, cfg);
      // 1차 + 2차 최적 = 결합 점수. 다음 피스를 둘 곳이 없으면(데드엔드) 강한 패널티.
      c.score += sub.length ? sub[0].score : -1000;
    }
    // 빔만 결합 점수로 재정렬해 반환한다. 비-빔 후보는 1차 점수가 이미 더 낮았고,
    // 2차 점수 축까지 더하면 비교 기준이 어긋나므로 후보에서 제외한다(빔 서치 표준).
    top.sort((a, b) => b.score - a.score);
    return top;
  }
  return candidates;
}
