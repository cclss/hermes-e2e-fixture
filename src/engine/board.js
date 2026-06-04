// ============================================================================
// board.js — 보드 모델 + 충돌/라인 판정 (순수 로직)
//
// 좌표: x=열(→), y=행(↓). 그리드는 10×40(기본) — 하단 20행이 가시 영역,
// 상단 20행은 스폰/탑아웃 판정용 버퍼(vanish zone).
//
// 셀 값: null = 빈칸, 그 외 = 피스 타입 키('I'..'L') 또는 'G'(가비지, g7에서 사용).
// 렌더 레이어가 이 키를 color/piece-* 토큰에 매핑한다. 보드는 색을 모른다.
// ============================================================================

export const DEFAULT_WIDTH = 10;
export const DEFAULT_VISIBLE_HEIGHT = 20;
export const DEFAULT_BUFFER_ROWS = 20;

export class Board {
  /**
   * @param {object} [opts]
   * @param {number} [opts.width=10]
   * @param {number} [opts.visibleHeight=20]
   * @param {number} [opts.bufferRows=20]
   */
  constructor(opts = {}) {
    this.width = opts.width ?? DEFAULT_WIDTH;
    this.visibleHeight = opts.visibleHeight ?? DEFAULT_VISIBLE_HEIGHT;
    this.bufferRows = opts.bufferRows ?? DEFAULT_BUFFER_ROWS;
    this.height = this.visibleHeight + this.bufferRows;
    this.grid = Board._emptyGrid(this.width, this.height);
  }

  static _emptyGrid(w, h) {
    const g = new Array(h);
    for (let y = 0; y < h; y++) g[y] = new Array(w).fill(null);
    return g;
  }

  /** 그리드를 빈 상태로 되돌린다. */
  reset() {
    this.grid = Board._emptyGrid(this.width, this.height);
  }

  /** (x,y)가 보드 가로 범위 + 바닥 안쪽인지. y<0(천장 위)은 허용(버퍼 위 회전 여유). */
  inBounds(x, y) {
    return x >= 0 && x < this.width && y < this.height;
  }

  /** (x,y) 셀이 채워져 있는지(범위 밖 바닥/벽은 채워진 것으로 취급하지 않음 — collides가 처리). */
  isFilled(x, y) {
    if (y < 0) return false; // 천장 위는 비어있는 것으로 본다
    if (x < 0 || x >= this.width || y >= this.height) return false;
    return this.grid[y][x] !== null;
  }

  /**
   * 절대 셀 목록(피스 위치 적용 후)이 벽/바닥/기존 블록과 충돌하는지.
   * @param {{x:number,y:number}[]} cells  박스 좌상단 기준 오프셋
   * @param {number} px  박스 좌상단 x
   * @param {number} py  박스 좌상단 y
   */
  collides(cells, px, py) {
    for (let i = 0; i < cells.length; i++) {
      const ax = px + cells[i].x;
      const ay = py + cells[i].y;
      if (ax < 0 || ax >= this.width) return true; // 좌우 벽
      if (ay >= this.height) return true; // 바닥
      if (ay >= 0 && this.grid[ay][ax] !== null) return true; // 기존 블록
    }
    return false;
  }

  /** 절대 셀 목록을 타입 키로 보드에 고정한다. */
  lock(cells, px, py, type) {
    for (let i = 0; i < cells.length; i++) {
      const ax = px + cells[i].x;
      const ay = py + cells[i].y;
      if (ay >= 0 && ay < this.height && ax >= 0 && ax < this.width) {
        this.grid[ay][ax] = type;
      }
    }
  }

  /** 가득 찬 행(모든 칸이 채워진 행)의 인덱스 목록을 위→아래 순으로 반환. */
  getFullRows() {
    const rows = [];
    for (let y = 0; y < this.height; y++) {
      let full = true;
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x] === null) {
          full = false;
          break;
        }
      }
      if (full) rows.push(y);
    }
    return rows;
  }

  /**
   * 주어진 행 인덱스들을 제거하고 위 행을 아래로 내린 뒤, 상단에 빈 행을 채운다.
   * @returns {number} 지워진 행 수
   */
  clearRows(rowIndices) {
    if (rowIndices.length === 0) return 0;
    const remove = new Set(rowIndices);
    const kept = [];
    for (let y = 0; y < this.height; y++) {
      if (!remove.has(y)) kept.push(this.grid[y]);
    }
    const cleared = this.height - kept.length;
    const newRows = [];
    for (let i = 0; i < cleared; i++) newRows.push(new Array(this.width).fill(null));
    this.grid = newRows.concat(kept);
    return cleared;
  }

  /** 해당 셀이 가시 영역(버퍼 아래)인지. 탑아웃/락아웃 판정 보조. */
  isVisibleRow(y) {
    return y >= this.bufferRows;
  }

  /** 디버그/스냅샷용: 가시 영역만 잘라낸 2D 배열 복사본. */
  visibleSnapshot() {
    return this.grid.slice(this.bufferRows).map((row) => row.slice());
  }
}
