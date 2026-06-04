// ============================================================================
// render/motion.js — 캔버스 JS 애니메이션용 motion 토큰 해석기
//
// CSS 전환은 `transition: ... var(--ease-arcade)`로 cubic-bezier 문자열을 직접
// 소비하지만, 캔버스 2D에서 손으로 보간하는 이펙트(파티클·플래시·디졸브·셰이크)는
// 그 문자열을 쓸 수 없다. 그렇다고 곡선 값을 JS에 하드코딩하면 진실원이 둘로
// 갈라진다(오염). 그래서 tokens.css의 motion 토큰을 "그대로 읽어" 해석한다:
//   - duration 토큰("240ms")  → 숫자(ms)
//   - easing 토큰("cubic-bezier(a,b,c,d)" | "linear") → JS 보간 함수
// 이렇게 motion/base가 단일 진실원(SSOT)으로 유지된다. (캔버스가 box-shadow를
// 못 써서 shadow/base에 glow-blur 토큰을 둔 것과 동일한 구조다.)
// ============================================================================

/** :root에서 토큰 원문 문자열을 읽는다. */
function readRaw(name) {
  const root = document.documentElement;
  return getComputedStyle(root).getPropertyValue(name).trim();
}

/** duration 토큰("240ms" / "0.4s")을 ms 숫자로 해석한다. */
export function readDuration(name) {
  const raw = readRaw(name);
  if (!raw) return 0;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return 0;
  return /ms\b/.test(raw) ? n : /s\b/.test(raw) ? n * 1000 : n;
}

/**
 * cubic-bezier 1차원 좌표 평가 (de Casteljau 전개식).
 * P0=0, P3=1 고정인 CSS 이징의 x 또는 y 성분.
 */
function bezierAxis(t, c1, c2) {
  const u = 1 - t;
  // 3·u²·t·c1 + 3·u·t²·c2 + t³  (P0=0, P3=1)
  return 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t;
}

/**
 * CSS cubic-bezier(x1,y1,x2,y2)를 progress(0..1) → eased(0..1) 함수로 만든다.
 * 입력 progress는 x축이고, x(t)=progress가 되는 매개변수 t를 뉴턴법으로 찾은 뒤
 * y(t)를 돌려준다(표준 브라우저 구현과 동일한 방식).
 */
function makeCubicBezier(x1, y1, x2, y2) {
  // 선형이면 그대로 통과(불필요한 계산 회피).
  if (x1 === y1 && x2 === y2) return (p) => p;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p; // 초기 추정
    for (let i = 0; i < 6; i++) {
      const x = bezierAxis(t, x1, x2) - p;
      if (Math.abs(x) < 1e-4) break;
      // dx/dt
      const u = 1 - t;
      const dx = 3 * u * u * x1 + 6 * u * t * (x2 - x1) + 3 * t * t * (1 - x2);
      if (Math.abs(dx) < 1e-6) break;
      t -= x / dx;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    return bezierAxis(t, y1, y2);
  };
}

/**
 * easing 토큰을 JS 보간 함수(progress → eased)로 해석한다.
 * "linear" 또는 "cubic-bezier(...)"를 인식한다. 알 수 없으면 선형으로 폴백.
 */
export function readEasing(name) {
  const raw = readRaw(name);
  if (!raw || raw === 'linear') return (p) => p;
  const m = raw.match(/cubic-bezier\(\s*([^)]+)\)/);
  if (!m) return (p) => p;
  const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return (p) => p;
  return makeCubicBezier(parts[0], parts[1], parts[2], parts[3]);
}

/**
 * motion 토큰 묶음을 한 번 읽어 캐시한다. 폰트/테마 변경 후 refresh()로 재해석.
 * 이펙트 레이어는 이 객체의 duration(ms)·easing 함수만 사용한다.
 */
export class MotionTokens {
  constructor() {
    this.refresh();
  }

  refresh() {
    this.dur = {
      instant: readDuration('--duration-instant'),
      fast: readDuration('--duration-fast'),
      base: readDuration('--duration-base'),
      slow: readDuration('--duration-slow'),
      dramatic: readDuration('--duration-dramatic'),
    };
    this.ease = {
      standard: readEasing('--ease-standard'),
      outExpo: readEasing('--ease-out-expo'),
      arcade: readEasing('--ease-arcade'),
      inFast: readEasing('--ease-in-fast'),
      linear: readEasing('--ease-linear'),
    };
    return this;
  }
}
