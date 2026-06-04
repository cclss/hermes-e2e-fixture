// ============================================================================
// input/keyboard-controller.js — 키보드 입력 + DAS/ARR 튜닝
//
// 엔진 커맨드(g3 API)만 호출한다. 게임 규칙은 재구현하지 않는다.
//
// DAS(Delayed Auto Shift): 좌/우 키를 누른 뒤 자동 반복이 시작되기까지의 지연.
// ARR(Auto Repeat Rate): 자동 반복 1스텝 간격(0이면 한 프레임에 벽까지 충전).
// 두 값과 소프트드롭 간격은 "입력 반응 타이밍"이라 시각 디자인 토큰이 아니다
// (감각값 — 코드 상수로 둔다).
//
// 반복은 update(dt)에서 프레임 동기로 처리 → 일시정지/게임오버에 자연히 멈춘다.
// ============================================================================

// --- 게임 필(feel) 튜닝 상수 (디자인 토큰 아님) ---
const DAS_MS = 120; // 자동 횡이동 시작 지연
const ARR_MS = 22; // 자동 횡이동 반복 간격
const SOFT_DROP_MS = 28; // 소프트드롭 반복 간격

// 키 → 액션 매핑. 한 액션에 복수 키 허용.
const KEYMAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'soft',
  KeyS: 'soft',
  Space: 'hard',
  ArrowUp: 'rotateCW',
  KeyX: 'rotateCW',
  KeyZ: 'rotateCCW',
  ControlLeft: 'rotateCCW',
  ControlRight: 'rotateCCW',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
  KeyP: 'pause',
  Escape: 'pause',
  Enter: 'restart',
  KeyR: 'restart',
};

// 페이지 스크롤을 막아야 하는 키들.
const PREVENT_DEFAULT = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
]);

export class KeyboardController {
  /**
   * @param {object} hooks
   * @param {() => object} hooks.engine      현재 엔진 인스턴스 반환(재시작 시 교체 가능)
   * @param {() => void} hooks.onPause       일시정지 토글
   * @param {() => void} hooks.onRestart     재시작
   * @param {() => boolean} hooks.isActive   입력을 받아도 되는 상태인가(미정지·진행중)
   * @param {EventTarget} [target=window]
   */
  constructor({ engine, onPause, onRestart, isActive, target = window }) {
    this.getEngine = engine;
    this.onPause = onPause;
    this.onRestart = onRestart;
    this.isActive = isActive;
    this.target = target;

    // 방향키 자동 반복 타이머. dir: 마지막으로 눌린 방향(-1/0/1).
    this.dir = 0;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.charged = false; // DAS 충전 완료(자동 반복 진입)

    this.softTimer = 0;
    this.softHeld = false;

    // 현재 눌려있는 물리 키(중복 keydown 무시 + 양방향 처리).
    this.held = new Set();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
  }

  attach() {
    this.target.addEventListener('keydown', this._onKeyDown);
    this.target.addEventListener('keyup', this._onKeyUp);
    return this;
  }

  detach() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
  }

  _shift(dir) {
    const eng = this.getEngine();
    if (!eng) return;
    if (dir < 0) eng.moveLeft();
    else eng.moveRight();
  }

  _onKeyDown(e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();

    // 전역 액션(상태 무관)
    if (action === 'pause') {
      if (!e.repeat) this.onPause();
      return;
    }
    if (action === 'restart') {
      if (!e.repeat) this.onRestart();
      return;
    }

    // 브라우저 키 리피트는 무시(자체 DAS/ARR 사용)
    if (e.repeat || this.held.has(e.code)) return;
    this.held.add(e.code);

    if (!this.isActive()) return;
    const eng = this.getEngine();
    if (!eng) return;

    switch (action) {
      case 'left':
        this.dir = -1;
        this.charged = false;
        this.dasTimer = 0;
        this.arrTimer = 0;
        this._shift(-1); // 즉시 1스텝 (스냅감)
        break;
      case 'right':
        this.dir = 1;
        this.charged = false;
        this.dasTimer = 0;
        this.arrTimer = 0;
        this._shift(1);
        break;
      case 'soft':
        this.softHeld = true;
        this.softTimer = 0;
        eng.softDrop(); // 즉시 1칸
        break;
      case 'hard':
        eng.hardDrop();
        break;
      case 'rotateCW':
        eng.rotateCW();
        break;
      case 'rotateCCW':
        eng.rotateCCW();
        break;
      case 'hold':
        eng.hold();
        break;
      default:
        break;
    }
  }

  _onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    this.held.delete(e.code);

    if (action === 'left' || action === 'right') {
      // 떼면 다른 방향키가 아직 눌려있는지 확인해 그 방향으로 전환.
      const leftHeld = this.held.has('ArrowLeft') || this.held.has('KeyA');
      const rightHeld = this.held.has('ArrowRight') || this.held.has('KeyD');
      if (leftHeld && !rightHeld) this.dir = -1;
      else if (rightHeld && !leftHeld) this.dir = 1;
      else this.dir = 0;
      this.charged = false;
      this.dasTimer = 0;
      this.arrTimer = 0;
    } else if (action === 'soft') {
      const softStill = this.held.has('ArrowDown') || this.held.has('KeyS');
      this.softHeld = softStill;
    }
  }

  /** 프레임마다 호출. DAS/ARR 충전 + 소프트드롭 반복 처리. */
  update(dt) {
    if (!this.isActive()) return;

    // 좌/우 자동 반복
    if (this.dir !== 0) {
      if (!this.charged) {
        this.dasTimer += dt;
        if (this.dasTimer >= DAS_MS) {
          this.charged = true;
          this.arrTimer = 0;
          if (ARR_MS <= 0) {
            // 즉시 벽까지 충전
            let guard = 0;
            const eng = this.getEngine();
            const before = eng && eng.active ? eng.active.x : null;
            while (guard++ < 64) {
              this._shift(this.dir);
              const now = eng && eng.active ? eng.active.x : null;
              if (now === before) break;
            }
          } else {
            this._shift(this.dir);
          }
        }
      } else {
        this.arrTimer += dt;
        while (this.arrTimer >= ARR_MS && ARR_MS > 0) {
          this.arrTimer -= ARR_MS;
          this._shift(this.dir);
        }
      }
    }

    // 소프트드롭 반복
    if (this.softHeld) {
      this.softTimer += dt;
      const eng = this.getEngine();
      while (this.softTimer >= SOFT_DROP_MS) {
        this.softTimer -= SOFT_DROP_MS;
        if (eng) eng.softDrop();
      }
    }
  }

  /** 재시작 등으로 입력 상태를 초기화한다. */
  reset() {
    this.dir = 0;
    this.charged = false;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.softHeld = false;
    this.softTimer = 0;
    this.held.clear();
  }
}
