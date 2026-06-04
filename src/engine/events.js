// ============================================================================
// events.js — 초경량 이벤트 이미터 (순수 로직, DOM 비의존)
//
// 엔진이 게임 이벤트(라인클리어, T스핀, 콤보, 탑아웃 등)를 외부로 방출하는
// 통로. 렌더/이펙트/AI 레이어가 on()으로 구독한다. 엔진 자신은 구독자가
// 무엇을 하는지 모른다(관심사 분리).
// ============================================================================

export class Emitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * 이벤트 구독. 해제 함수를 반환한다.
   * @param {string} type
   * @param {(payload:any)=>void} handler
   * @returns {() => void} unsubscribe
   */
  on(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  /** 1회성 구독. */
  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(type, handler) {
    const set = this._listeners.get(type);
    if (set) set.delete(handler);
  }

  /**
   * 이벤트 방출. 구독자 예외가 다른 구독자나 엔진 루프를 막지 않도록 격리한다.
   * @param {string} type
   * @param {any} [payload]
   */
  emit(type, payload) {
    const set = this._listeners.get(type);
    if (!set || set.size === 0) return;
    // 순회 중 구독 해제에 안전하도록 복사본을 돈다.
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (err) {
        // 구독자 오류는 삼키되 콘솔이 있으면 남긴다(헤드리스 환경 안전).
        if (typeof console !== 'undefined' && console.error) {
          console.error('[engine emitter] listener error for', type, err);
        }
      }
    }
  }

  /** 모든 구독 제거(혹은 특정 타입만). */
  clear(type) {
    if (type) this._listeners.delete(type);
    else this._listeners.clear();
  }
}
