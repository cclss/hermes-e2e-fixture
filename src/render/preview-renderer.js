// ============================================================================
// render/preview-renderer.js — 홀드/넥스트 미니 피스 렌더러
//
// HUD의 .piece-slot 안에 캔버스를 한 번 주입하고, 피스 타입을 받아 스폰
// 상태(state 0)의 셀을 중앙 정렬해 그린다. 색/글로우는 Palette(tokens.css).
// 피스 형상 데이터(SHAPES)는 엔진 공개 API에서 읽는다(규칙 재구현 아님).
// ============================================================================

import { SHAPES } from '../engine/index.js';

const CELL_INSET_RATIO = 0.08;
const PADDING_RATIO = 0.16; // 슬롯 대비 여백(렌더 구현 설정값)

/** 스폰 상태 셀의 occupied 바운딩 박스(min/max col·row). */
function boundsOf(cells) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  return { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export class PreviewRenderer {
  /**
   * @param {HTMLElement} slotEl  .piece-slot 컨테이너
   * @param {import('./palette.js').Palette} palette
   */
  constructor(slotEl, palette) {
    this.slotEl = slotEl;
    this.palette = palette;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'piece-slot__canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    // 슬롯을 꽉 채우되 레이아웃은 CSS가 결정.
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    slotEl.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.lastType = undefined;
  }

  _resize() {
    const rect = this.slotEl.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const w = Math.round((rect.width || 48) * dpr);
    const h = Math.round((rect.height || 48) * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
  }

  /**
   * 피스 하나를 그린다. type=null이면 빈 슬롯(클리어).
   * @param {string|null} type
   */
  render(type) {
    const prevW = this.canvas.width;
    const prevH = this.canvas.height;
    this._resize();
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    // 타입·크기 모두 그대로면 다시 그릴 필요 없음(매 프레임 redraw 회피).
    const sizeChanged = W !== prevW || H !== prevH;
    if (type === this.lastType && !sizeChanged) return;
    this.lastType = type;
    ctx.clearRect(0, 0, W, H);
    if (!type) return;

    const cells = SHAPES[type][0].cells;
    const b = boundsOf(cells);
    const pad = Math.min(W, H) * PADDING_RATIO;
    const cell = Math.min((W - pad * 2) / b.w, (H - pad * 2) / b.h);
    const drawW = cell * b.w;
    const drawH = cell * b.h;
    const originX = (W - drawW) / 2;
    const originY = (H - drawH) / 2;

    const fill = this.palette.fillFor(type);
    const inset = cell * CELL_INSET_RATIO;
    const radius = this.palette.minoRadius * this.dpr;

    ctx.save();
    ctx.shadowColor = fill;
    ctx.shadowBlur = this.palette.glowBlurLocked * this.dpr;
    ctx.fillStyle = fill;
    for (const c of cells) {
      const x = originX + (c.x - b.minX) * cell + inset;
      const y = originY + (c.y - b.minY) * cell + inset;
      const size = cell - inset * 2;
      const rad = Math.max(0, Math.min(radius, size / 2));
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + size, y, x + size, y + size, rad);
      ctx.arcTo(x + size, y + size, x, y + size, rad);
      ctx.arcTo(x, y + size, x, y, rad);
      ctx.arcTo(x, y, x + size, y, rad);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
