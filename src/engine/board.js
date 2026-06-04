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

  /**
   * 가비지(패널티) 라인을 보드 바닥에 삽입한다(g7 대전). 기존 스택은 그만큼
   * 위로 밀려 올라가고, 상단으로 밀려난 행에 블록이 있으면 매장(buried)으로
   * 표시한다(호출부가 탑아웃 판정에 사용). 각 가비지 행은 한 칸(구멍)만 비고
   * 나머지는 'G'로 채워진다 — 구멍 컬럼은 행마다 지정할 수 있다.
   *
   * @param {number} count                삽입할 가비지 라인 수
   * @param {number|((i:number)=>number)} holeColForRow  행별 구멍 컬럼(숫자 또는 i→col)
   * @returns {boolean} buried  상단으로 밀려난 행에 블록이 있었는가
   */
  addGarbageRows(count, holeColForRow) {
    const n = Math.max(0, count | 0);
    if (n === 0) return false;

    // 위로 밀려나(제거되) 상단 n행에 블록이 있으면 매장으로 본다.
    let buried = false;
    const top = Math.min(n, this.height);
    for (let y = 0; y < top && !buried; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x] !== null) {
          buried = true;
          break;
        }
      }
    }

    const kept = this.grid.slice(n); // 상단 n행 제거 → 나머지가 위로 이동
    const rows = [];
    for (let i = 0; i < n; i++) {
      const raw = typeof holeColForRow === 'function' ? holeColForRow(i) : holeColForRow;
      const hole = (((raw | 0) % this.width) + this.width) % this.width;
      const row = new Array(this.width).fill('G');
      row[hole] = null;
      rows.push(row);
    }
    this.grid = kept.concat(rows);
    return buried;
  }

  /** 스택의 최상단(가장 윗줄) 블록의 절대 행 인덱스. 비어 있으면 height 반환. */
  highestFilledRow() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x] !== null) return y;
      }
    }
    return this.height;
  }

  /** 디버그/스냅샷용: 가시 영역만 잘라낸 2D 배열 복사본. */
  visibleSnapshot() {
    return this.grid.slice(this.bufferRows).map((row) => row.slice());
  }
}
