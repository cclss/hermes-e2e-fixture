// ============================================================================
// pieces.js — 테트로미노 정의 + SRS 회전 상태 (순수 로직)
//
// 좌표 규약 (엔진 전역 공통):
//   - 보드 원점은 좌상단.
//   - x = 열(column), 오른쪽으로 증가.
//   - y = 행(row), 아래로 증가.
//   - 피스 위치 = 피스 바운딩 박스 매트릭스의 좌상단 셀의 보드 좌표.
//
// 회전 상태 인덱스 (Super Rotation System 표준):
//   0 = 스폰(spawn)
//   1 = R  (스폰에서 시계방향 1회)
//   2 = 180
//   3 = L  (스폰에서 반시계방향 1회)
//
// 이 모듈은 DOM/렌더/색상을 일절 다루지 않는다. 피스의 색은 렌더 레이어가
// 타입 키(I/O/T/S/Z/J/L)를 디자인 토큰(color/piece-*)에 매핑해 결정한다.
// ============================================================================

/** 표준 테트로미노 타입 키. 7-bag·홀드·넥스트큐가 이 키를 식별자로 사용한다. */
export const PIECE_TYPES = Object.freeze(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);

// 각 회전 상태를 행 우선(row-major) 매트릭스 문자열로 정의한다.
// '1' = 채워진 셀, 그 외 = 빈 셀. SRS 가이드라인 스폰 방향과 회전 표를 따른다.
const MATRICES = {
  I: [
    ['....', 'IIII', '....', '....'], // 0
    ['..I.', '..I.', '..I.', '..I.'], // R
    ['....', '....', 'IIII', '....'], // 2
    ['.I..', '.I..', '.I..', '.I..'], // L
  ],
  O: [
    ['OO', 'OO'], // 0
    ['OO', 'OO'], // R
    ['OO', 'OO'], // 2
    ['OO', 'OO'], // L
  ],
  T: [
    ['.T.', 'TTT', '...'], // 0
    ['.T.', '.TT', '.T.'], // R
    ['...', 'TTT', '.T.'], // 2
    ['.T.', 'TT.', '.T.'], // L
  ],
  S: [
    ['.SS', 'SS.', '...'], // 0
    ['.S.', '.SS', '..S'], // R
    ['...', '.SS', 'SS.'], // 2
    ['S..', 'SS.', '.S.'], // L
  ],
  Z: [
    ['ZZ.', '.ZZ', '...'], // 0
    ['..Z', '.ZZ', '.Z.'], // R
    ['...', 'ZZ.', '.ZZ'], // 2
    ['.Z.', 'ZZ.', 'Z..'], // L
  ],
  J: [
    ['J..', 'JJJ', '...'], // 0
    ['.JJ', '.J.', '.J.'], // R
    ['...', 'JJJ', '..J'], // 2
    ['.J.', '.J.', 'JJ.'], // L
  ],
  L: [
    ['..L', 'LLL', '...'], // 0
    ['.L.', '.L.', '.LL'], // R
    ['...', 'LLL', 'L..'], // 2
    ['LL.', '.L.', '.L.'], // L
  ],
};

// 매트릭스를 {x,y} 셀 오프셋 리스트로 변환한다.
function matrixToCells(rows) {
  const cells = [];
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '.') cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * SHAPES[type][state] = { box, cells }
 *   box   : 바운딩 박스 한 변 크기 (I=4, O=2, 그 외=3)
 *   cells : 박스 좌상단을 (0,0)으로 한 채워진 셀 오프셋 [{x,y}, ...] (4개)
 * 깊은 동결로 외부 변형을 차단한다(순수성 보장).
 */
export const SHAPES = (() => {
  const out = {};
  for (const type of PIECE_TYPES) {
    const states = MATRICES[type];
    out[type] = states.map((rows) => ({
      box: rows.length,
      cells: Object.freeze(matrixToCells(rows).map((c) => Object.freeze(c))),
    }));
    Object.freeze(out[type]);
  }
  return Object.freeze(out);
})();

/** 스폰 시 보드 좌상단 기준 박스 위치. SRS 가이드라인: 가로 중앙, 상단 버퍼. */
export const SPAWN_OFFSET = Object.freeze({
  // I/O는 짝수 폭, 그 외 홀수 폭. 표준 스폰 열에 맞춘 박스 좌상단 x.
  // (보드 폭은 board.js에서 주입되며 spawnPosition()이 중앙 정렬을 계산한다.)
  topRow: { I: 0, O: 0, default: 0 },
});

/**
 * 주어진 보드 폭에서 피스 스폰 시 박스 좌상단(x,y)을 계산한다.
 * 표준: 피스를 가로 중앙에 두되, I/O는 박스 폭이 짝수라 정확히 중앙,
 * 3-와이드 피스는 좌측으로 한 칸 치우친 표준 스폰 열을 사용한다.
 * y는 호출부(board)가 버퍼 영역 기준으로 더한다.
 */
export function spawnX(type, boardWidth) {
  const box = SHAPES[type][0].box;
  if (type === 'O') {
    // O는 2칸, 표준적으로 중앙 2열을 차지: floor(w/2)-1
    return Math.floor(boardWidth / 2) - 1;
  }
  if (type === 'I') {
    // I 박스(4) 좌상단: 중앙에 IIII가 오도록
    return Math.floor(boardWidth / 2) - 2;
  }
  // 3-wide: 박스 좌상단 = floor(w/2)-2 → 채워진 셀이 중앙 3열
  return Math.floor((boardWidth - box) / 2);
}

/** 회전 상태 인덱스를 0..3로 정규화한다. */
export function normState(state) {
  return ((state % 4) + 4) % 4;
}
