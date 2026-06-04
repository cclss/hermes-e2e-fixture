// ============================================================================
// render/board-renderer.js — 캔버스 보드 렌더러 (playfield 표현)
//
// 엔진 스냅샷(읽기 전용 뷰)만 입력으로 받아 그린다. 게임 규칙은 절대 여기서
// 재구현하지 않는다(경계: 엔진은 g3 API로만). 그리는 것:
//   - 보드 표면 + 격자(grid) + 빈 셀
//   - 고정 블록(locked mino)
//   - 고스트 피스(착지 미리보기: 외곽선만)
//   - 활성 피스(active mino: 더 강한 네온 글로우)
//
// 좌표 매핑: 스냅샷의 board는 가시 20행, active.cells/ghostY는 전체 그리드
// 절대 좌표(상단 버퍼 포함). 가시행 = 절대행 - bufferRows.
//
// 셀 내부 인셋 비율·격자선 두께·dpr 스케일은 렌더 구현 설정값이다(디자인
// 토큰 아님). 색/모서리/글로우는 Palette(=tokens.css)에서만 온다.
// ============================================================================

// --- 렌더 구현 설정값 (시각 테마가 아니라 렌더 기하 — Spec 미기록) ---
const CELL_INSET_RATIO = 0.07; // 셀 한 변 대비 내부 인셋 → 블록 분리감
const GRID_LINE_RATIO = 0.04; // 셀 한 변 대비 격자선 두께(최소 1px)
const GHOST_LINE_RATIO = 0.09; // 고스트 외곽선 두께 비율

export class BoardRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   * @param {number} opts.cols          가시 열 수(보통 10)
   * @param {number} opts.rows          가시 행 수(보통 20)
   * @param {number} opts.bufferRows    상단 버퍼 행 수(절대→가시 변환용)
   * @param {import('./palette.js').Palette} opts.palette
   */
  constructor(canvas, { cols, rows, bufferRows, palette }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cols = cols;
    this.rows = rows;
    this.bufferRows = bufferRows;
    this.palette = palette;

    this.cell = 0; // 셀 한 변(px, 백킹스토어 기준)
    this.dpr = 1;
    this.resize();
  }

  /** 캔버스 백킹스토어를 표시 크기 × dpr로 맞춰 선명하게 유지한다. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const cssW = rect.width || this.canvas.clientWidth || 300;
    const cssH = rect.height || this.canvas.clientHeight || 600;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    // 셀 한 변: 가로/세로 중 작은 쪽 기준(보드 비율은 CSS aspect-ratio가 보장).
    this.cell = Math.min(w / this.cols, h / this.rows);
    this.offsetX = (w - this.cell * this.cols) / 2;
    this.offsetY = (h - this.cell * this.rows) / 2;
  }

  /** 한 셀의 캔버스 픽셀 좌표(좌상단). */
  _cellXY(col, rowVisible) {
    return {
      x: this.offsetX + col * this.cell,
      y: this.offsetY + rowVisible * this.cell,
    };
  }

  /** 둥근 사각형 path 구성(라운드 반경은 셀 크기로 클램프). */
  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    const rad = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  /** 채워진 블록(고정/활성) 한 칸을 그린다. */
  _drawMino(col, rowVisible, value, { active }) {
    const ctx = this.ctx;
    const { x, y } = this._cellXY(col, rowVisible);
    const inset = this.cell * CELL_INSET_RATIO;
    const size = this.cell - inset * 2;
    const fill = this.palette.fillFor(value);
    const radius = this.palette.minoRadius * this.dpr;

    ctx.save();
    // 네온 블룸: 블록 자기 색으로 번지게 한다(글로우 강도는 토큰).
    ctx.shadowColor = fill;
    ctx.shadowBlur = (active ? this.palette.glowBlurActive : this.palette.glowBlurLocked) * this.dpr;
    ctx.fillStyle = fill;
    this._roundRect(x + inset, y + inset, size, size, radius);
    ctx.fill();
    ctx.restore();
  }

  /** 고스트(착지 미리보기) 한 칸: 외곽선만. */
  _drawGhost(col, rowVisible) {
    const ctx = this.ctx;
    const { x, y } = this._cellXY(col, rowVisible);
    const inset = this.cell * CELL_INSET_RATIO;
    const size = this.cell - inset * 2;
    const radius = this.palette.minoRadius * this.dpr;
    ctx.save();
    ctx.fillStyle = this.palette.ghostFill;
    ctx.strokeStyle = this.palette.ghostBorder;
    ctx.lineWidth = Math.max(1, this.cell * GHOST_LINE_RATIO);
    this._roundRect(x + inset, y + inset, size, size, radius);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** 배경 + 빈 셀 + 격자선. */
  _drawGrid() {
    const ctx = this.ctx;
    const w = this.cell * this.cols;
    const h = this.cell * this.rows;
    // 보드 바탕
    ctx.fillStyle = this.palette.bgBoard;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // 빈 셀 톤
    ctx.fillStyle = this.palette.bgCellEmpty;
    ctx.fillRect(this.offsetX, this.offsetY, w, h);
    // 격자선
    ctx.strokeStyle = this.palette.gridLine;
    ctx.lineWidth = Math.max(1, this.cell * GRID_LINE_RATIO);
    ctx.beginPath();
    for (let c = 0; c <= this.cols; c++) {
      const x = this.offsetX + c * this.cell;
      ctx.moveTo(x, this.offsetY);
      ctx.lineTo(x, this.offsetY + h);
    }
    for (let r = 0; r <= this.rows; r++) {
      const y = this.offsetY + r * this.cell;
      ctx.moveTo(this.offsetX, y);
      ctx.lineTo(this.offsetX + w, y);
    }
    ctx.stroke();
  }

  /**
   * 스냅샷 1프레임을 그린다.
   * @param {object} snap  engine.snapshot()
   */
  render(snap) {
    this._drawGrid();
    if (!snap) return;

    // 1) 고정 블록
    const board = snap.board;
    for (let r = 0; r < this.rows; r++) {
      const row = board[r];
      if (!row) continue;
      for (let c = 0; c < this.cols; c++) {
        const v = row[c];
        if (v) this._drawMino(c, r, v, { active: false });
      }
    }

    // 2) 고스트 (활성 피스 박스를 ghostY로 평행 이동)
    if (snap.active && snap.ghostY != null) {
      const dy = snap.ghostY - snap.active.y;
      for (const cell of snap.active.cells) {
        const gv = cell.y + dy - this.bufferRows;
        if (gv >= 0 && gv < this.rows) this._drawGhost(cell.x, gv);
      }
    }

    // 3) 활성 피스 (고스트 위에 강한 글로우로)
    if (snap.active) {
      for (const cell of snap.active.cells) {
        const rv = cell.y - this.bufferRows;
        if (rv >= 0 && rv < this.rows) {
          this._drawMino(cell.x, rv, snap.active.type, { active: true });
        }
      }
    }
  }
}
