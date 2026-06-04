// ============================================================================
// randomizer.js — 7-bag 랜덤마이저 + 시드 PRNG (순수 로직)
//
// 7-bag: 7종 테트로미노가 한 묶음(bag)에 정확히 한 번씩 들어가 셔플된다.
// 한 bag을 모두 소진하면 새 bag을 셔플해 이어붙인다. → 같은 피스가 최대
// 12개 간격 안에 반드시 다시 등장(가이드라인 표준 분포).
//
// 결정성: RNG를 주입(또는 시드)할 수 있어 리플레이/네트코드/테스트가 가능하다.
// 외부 시간/엔트로피에 의존하지 않는다(헤드리스 순수성).
// ============================================================================

import { PIECE_TYPES } from './pieces.js';

/**
 * mulberry32 — 작고 빠른 결정적 32비트 PRNG.
 * 동일 시드 → 동일 시퀀스. [0,1) 실수를 반환한다.
 * @param {number} seed  부호 없는 32비트 정수로 취급
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates 셔플. 주입된 rng()(0..1)를 사용한다. 원본을 변형하지 않는다. */
export function shuffle(items, rng) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/**
 * 7-bag 랜덤마이저.
 * @param {object} [opts]
 * @param {number} [opts.seed]  결정적 시드 (지정 시 mulberry32 사용)
 * @param {() => number} [opts.rng]  사용자 정의 [0,1) RNG (seed보다 우선)
 */
export class BagRandomizer {
  constructor(opts = {}) {
    if (typeof opts.rng === 'function') {
      this._rng = opts.rng;
    } else if (typeof opts.seed === 'number') {
      this._rng = mulberry32(opts.seed);
    } else {
      // 시드/주입이 없으면 비결정적(브라우저 런타임). 헤드리스 테스트는 항상 시드를 준다.
      this._rng = Math.random;
    }
    /** @type {string[]} 아직 뽑지 않은 현재 bag의 나머지 */
    this._queue = [];
  }

  _refill() {
    const bag = shuffle(PIECE_TYPES, this._rng);
    for (const t of bag) this._queue.push(t);
  }

  /** 다음 피스 타입 하나를 꺼낸다. */
  next() {
    if (this._queue.length === 0) this._refill();
    return this._queue.shift();
  }

  /** 다음 n개 타입을 꺼낸다(넥스트 큐 초기 채움용). */
  take(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.next());
    return out;
  }

  /**
   * 큐를 소비하지 않고 앞으로 나올 n개를 미리 본다(디버그/AI 룩어헤드용).
   * 내부 bag 상태를 변형하지 않도록 필요한 만큼만 임시로 채워서 본다.
   */
  peek(n) {
    while (this._queue.length < n) this._refill();
    return this._queue.slice(0, n);
  }
}
