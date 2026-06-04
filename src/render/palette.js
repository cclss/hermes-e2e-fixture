// ============================================================================
// render/palette.js — 디자인 토큰 → 캔버스 색/수치 해석기
//
// 캔버스 2D 컨텍스트는 CSS 변수를 직접 못 읽으므로, :root의 custom property를
// getComputedStyle로 한 번 해석해 캐시한다. 색은 전부 tokens.css의 토큰에서
// 온다(하드코딩 금지). 토큰 키 → 의미 매핑만 여기서 담당한다.
//
// 피스 타입 키(I/O/T/S/Z/J/L)와 가비지 키(G)는 엔진 도메인 식별자이며,
// 렌더 레이어가 color/piece-* · color/garbage-* 토큰으로 연결한다.
// ============================================================================

/** :root에서 토큰 값을 문자열로 읽는다. */
function readToken(name) {
  const root = document.documentElement;
  return getComputedStyle(root).getPropertyValue(name).trim();
}

/** "12px" 같은 길이 토큰을 숫자(px)로 해석한다. */
function readLength(name) {
  return parseFloat(readToken(name)) || 0;
}

// 피스 타입 → color/piece-* 토큰 이름.
const PIECE_TOKEN = Object.freeze({
  I: '--piece-i',
  O: '--piece-o',
  T: '--piece-t',
  S: '--piece-s',
  Z: '--piece-z',
  J: '--piece-j',
  L: '--piece-l',
});

/**
 * 토큰 값을 해석해 보관한다. 폰트 로드/테마 변경 후 refresh()로 다시 읽는다.
 * 렌더러는 이 객체의 색/수치만 사용한다.
 */
export class Palette {
  constructor() {
    this.refresh();
  }

  refresh() {
    // 셀 색 (피스 7종 + 가비지)
    this.piece = {};
    for (const [key, token] of Object.entries(PIECE_TOKEN)) {
      this.piece[key] = readToken(token);
    }
    this.garbageFill = readToken('--garbage-fill');
    this.garbageEdge = readToken('--garbage-edge');

    // 보드 표면 / 그리드 / 빈 셀
    this.bgBoard = readToken('--bg-board');
    this.bgCellEmpty = readToken('--bg-cell-empty');
    this.gridLine = readToken('--grid-line');

    // 고스트 (착지 미리보기)
    this.ghostFill = readToken('--ghost-fill');
    this.ghostBorder = readToken('--ghost-border');

    // 모서리 둥글기 (셀)
    this.minoRadius = readLength('--radius-sm');

    // 캔버스 글로우 블러 반경 (네온 블룸). box-shadow 합성 토큰은 캔버스가
    // 못 쓰므로 전용 블러 반경 토큰을 소비한다.
    this.glowBlurLocked = readLength('--glow-blur-1');
    this.glowBlurActive = readLength('--glow-blur-2');
    return this;
  }

  /** 셀 값(타입 키 또는 'G')에 대한 채움색을 반환한다. */
  fillFor(value) {
    if (value === 'G') return this.garbageFill;
    return this.piece[value] || this.garbageFill;
  }

  /** 'G' 셀의 강조 테두리색(그 외 셀은 자기 색으로 처리). */
  edgeFor(value) {
    if (value === 'G') return this.garbageEdge;
    return this.piece[value] || this.gridLine;
  }
}
