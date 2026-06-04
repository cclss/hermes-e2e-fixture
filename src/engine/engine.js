// ============================================================================
// engine.js — 코어 테트리스 엔진 (헤드리스, 순수 로직)
//
// 책임: 보드 모델 + 7-bag + SRS 회전/월킥 + 중력/락딜레이 + 라인클리어 +
//       소프트/하드드롭 + 홀드 + 넥스트큐(5) + 표준 스코어링(T스핀/B2B/콤보).
// 게임 이벤트를 Emitter로 외부에 노출한다. 렌더/입력/오디오/AI에 비의존.
//
// 시간 모델: update(dtMs)로 구동되는 틱 기반. 외부 시계에 의존하지 않으므로
// 동일 입력 시퀀스 + 동일 시드 → 동일 결과(리플레이/네트코드/테스트 가능).
//
// 좌표/회전 규약은 pieces.js 참조.
// ============================================================================

import { SHAPES, spawnX, normState } from './pieces.js';
import { getKicks } from './srs.js';
import { BagRandomizer } from './randomizer.js';
import { Board } from './board.js';
import { Scoring, detectTSpin } from './scoring.js';
import { Emitter } from './events.js';

/** 레벨별 중력(한 칸 낙하에 걸리는 ms). 가이드라인 곡선 기반. */
export function gravityForLevel(level) {
  const lv = Math.max(1, level | 0);
  const secPerRow = Math.pow(0.8 - (lv - 1) * 0.007, lv - 1);
  return Math.max(8, secPerRow * 1000); // 고레벨 하한 8ms
}

const DEFAULT_LOCK_DELAY = 500; // ms
const DEFAULT_MAX_LOCK_RESETS = 15;
const DEFAULT_NEXT_SIZE = 5;

/** 게임 이벤트 이름 상수(오타 방지 + 외부 문서화). */
export const EVENTS = Object.freeze({
  SPAWN: 'spawn',
  MOVE: 'move',
  ROTATE: 'rotate',
  HOLD: 'hold',
  LOCK: 'lock',
  LINE_CLEAR: 'lineclear',
  TSPIN: 'tspin',
  COMBO: 'combo',
  LEVEL_UP: 'levelup',
  TOPOUT: 'topout',
});

export class TetrisEngine {
  /**
   * @param {object} [opts]
   * @param {number} [opts.seed]            7-bag 시드(결정적)
   * @param {()=>number} [opts.rng]         사용자 RNG(seed보다 우선)
   * @param {number} [opts.level=1]         시작 레벨
   * @param {number} [opts.lockDelay=500]   락 딜레이(ms)
   * @param {number} [opts.maxLockResets=15] 락 리셋 상한(무한 슬라이드 방지)
   * @param {number} [opts.nextSize=5]      넥스트 큐 표시 개수
   * @param {object} [opts.boardOpts]       Board 생성 옵션
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.emitter = new Emitter();
    this.board = new Board(opts.boardOpts);
    this.randomizer = new BagRandomizer({ seed: opts.seed, rng: opts.rng });
    this.scoring = new Scoring({ level: opts.level ?? 1 });

    this.lockDelay = opts.lockDelay ?? DEFAULT_LOCK_DELAY;
    this.maxLockResets = opts.maxLockResets ?? DEFAULT_MAX_LOCK_RESETS;
    this.nextSize = opts.nextSize ?? DEFAULT_NEXT_SIZE;

    /** @type {{type:string,state:number,x:number,y:number}|null} */
    this.active = null;
    /** @type {string|null} */
    this.hold = null;
    this.holdUsed = false;
    /** @type {string[]} */
    this.next = [];

    // 타이밍/락 상태
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = -Infinity;

    // T-스핀 판정용 직전 동작 추적
    this.lastMoveWasRotation = false;
    this.usedLastKick = false;

    this.started = false;
    this.paused = false;
    this.gameOver = false;
  }

  // ---- 구독 위임 ----
  on(type, handler) {
    return this.emitter.on(type, handler);
  }
  once(type, handler) {
    return this.emitter.once(type, handler);
  }
  off(type, handler) {
    this.emitter.off(type, handler);
  }

  // ---- 라이프사이클 ----

  /** 새 게임 시작(또는 재시작). */
  start() {
    this.board.reset();
    this.scoring = new Scoring({ level: this.opts.level ?? 1 });
    this.randomizer = new BagRandomizer({ seed: this.opts.seed, rng: this.opts.rng });
    this.active = null;
    this.hold = null;
    this.holdUsed = false;
    this.next = this.randomizer.take(this.nextSize);
    this.gravityAcc = 0;
    this.gameOver = false;
    this.paused = false;
    this.started = true;
    this._spawn(this._shiftNext());
    return this;
  }

  setPaused(v) {
    this.paused = !!v;
  }

  /** 현재 활성 피스의 박스 셀(절대 좌표 아님, 박스 좌상단 기준 오프셋). */
  _activeCells() {
    return SHAPES[this.active.type][this.active.state].cells;
  }

  /** 다음 타입을 큐에서 꺼내고 큐를 한 칸 보충한다. */
  _shiftNext() {
    const t = this.next.shift();
    this.next.push(this.randomizer.next());
    return t;
  }

  /** 주어진 타입을 스폰 위치(상태0)에 배치한다. 충돌 시 탑아웃 처리. */
  _spawn(type) {
    const x = spawnX(type, this.board.width);
    const y = this.board.bufferRows; // 가시 영역 최상단 행
    const cells = SHAPES[type][0].cells;
    this.active = { type, state: 0, x, y };

    // 피스별 상태 리셋
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = y;
    this.lastMoveWasRotation = false;
    this.usedLastKick = false;

    if (this.board.collides(cells, x, y)) {
      // 스폰 위치 충돌 = 블록 아웃(탑아웃)
      this._topOut();
      return false;
    }
    this.emitter.emit(EVENTS.SPAWN, { type, x, y, next: this.next.slice() });
    return true;
  }

  _topOut() {
    this.gameOver = true;
    this.emitter.emit(EVENTS.TOPOUT, {
      score: this.scoring.score,
      lines: this.scoring.lines,
      level: this.scoring.level,
    });
  }

  // ---- 충돌/접지 ----

  isGrounded() {
    if (!this.active) return false;
    return this.board.collides(this._activeCells(), this.active.x, this.active.y + 1);
  }

  /** 이동/회전 성공 후 락 타이머/리셋/최저행을 갱신한다(무한 슬라이드 방지). */
  _onPieceMoved() {
    if (this.active.y > this.lowestY) {
      // 새 최저 행 도달 → 락 리셋 카운트 초기화(낙하 진행 보상)
      this.lowestY = this.active.y;
      this.lockResets = 0;
      this.lockTimer = 0;
      return;
    }
    if (this.isGrounded()) {
      if (this.lockResets < this.maxLockResets) {
        this.lockResets += 1;
        this.lockTimer = 0;
      }
      // 상한 초과 시 리셋하지 않음 → 타이머가 차면 락
    } else {
      this.lockTimer = 0;
    }
  }

  // ---- 입력 커맨드 ----

  _tryShift(dx, dy) {
    if (!this.active || this.gameOver) return false;
    const nx = this.active.x + dx;
    const ny = this.active.y + dy;
    if (this.board.collides(this._activeCells(), nx, ny)) return false;
    this.active.x = nx;
    this.active.y = ny;
    return true;
  }

  moveLeft() {
    if (this.paused) return false;
    const ok = this._tryShift(-1, 0);
    if (ok) {
      this.lastMoveWasRotation = false;
      this.usedLastKick = false;
      this._onPieceMoved();
      this.emitter.emit(EVENTS.MOVE, { dir: -1, ...this.snapshotActive() });
    }
    return ok;
  }

  moveRight() {
    if (this.paused) return false;
    const ok = this._tryShift(1, 0);
    if (ok) {
      this.lastMoveWasRotation = false;
      this.usedLastKick = false;
      this._onPieceMoved();
      this.emitter.emit(EVENTS.MOVE, { dir: 1, ...this.snapshotActive() });
    }
    return ok;
  }

  /** 소프트 드롭 1칸. 성공 시 1점. 바닥이면 false. */
  softDrop() {
    if (this.paused || !this.active || this.gameOver) return false;
    const ok = this._tryShift(0, 1);
    if (ok) {
      this.scoring.addSoftDrop(1);
      this.lastMoveWasRotation = false;
      this.usedLastKick = false;
      this.gravityAcc = 0;
      this._onPieceMoved();
      this.emitter.emit(EVENTS.MOVE, { dir: 0, soft: true, ...this.snapshotActive() });
    }
    return ok;
  }

  /** 하드 드롭: 바닥까지 즉시 낙하 후 락. 떨어진 칸당 2점. */
  hardDrop() {
    if (this.paused || !this.active || this.gameOver) return false;
    let dropped = 0;
    while (this._tryShift(0, 1)) {
      dropped += 1;
      this.lastMoveWasRotation = false; // 낙하는 회전이 아님
      this.usedLastKick = false;
    }
    if (dropped > 0) this.scoring.addHardDrop(dropped);
    this._lock();
    return true;
  }

  /**
   * 회전. dir = +1(시계), -1(반시계). SRS 월킥을 순서대로 시도해 첫 성공 채택.
   * @returns {boolean} 회전 성공 여부
   */
  rotate(dir) {
    if (this.paused || !this.active || this.gameOver) return false;
    const from = this.active.state;
    const to = normState(from + (dir >= 0 ? 1 : -1));
    if (to === from) return false;
    const newCells = SHAPES[this.active.type][to].cells;
    const kicks = getKicks(this.active.type, from, to);
    for (let i = 0; i < kicks.length; i++) {
      const nx = this.active.x + kicks[i].x;
      const ny = this.active.y + kicks[i].y;
      if (!this.board.collides(newCells, nx, ny)) {
        this.active.x = nx;
        this.active.y = ny;
        this.active.state = to;
        this.lastMoveWasRotation = true;
        this.usedLastKick = i === kicks.length - 1 && kicks.length === 5;
        this._onPieceMoved();
        this.emitter.emit(EVENTS.ROTATE, {
          from,
          to,
          kickIndex: i,
          ...this.snapshotActive(),
        });
        return true;
      }
    }
    return false; // 회전 실패: 상태/플래그 불변
  }

  rotateCW() {
    return this.rotate(1);
  }
  rotateCCW() {
    return this.rotate(-1);
  }

  /** 홀드: 활성 피스를 보관/교환. 한 피스당 1회. */
  hold() {
    if (this.paused || this.holdUsed || this.gameOver || !this.active) return false;
    const cur = this.active.type;
    if (this.hold === null) {
      this.hold = cur;
      this._spawn(this._shiftNext());
    } else {
      const swap = this.hold;
      this.hold = cur;
      this._spawn(swap);
    }
    this.holdUsed = true;
    this.emitter.emit(EVENTS.HOLD, {
      held: this.hold,
      active: this.active ? this.active.type : null,
    });
    return true;
  }

  // ---- 락 + 라인클리어 ----

  _lock() {
    const { type, state, x, y } = this.active;
    const cells = this._activeCells();

    // T-스핀 판정(보드에 고정하기 전, 직전 동작 플래그 기준)
    const tSpin = detectTSpin(
      this.board,
      type,
      x,
      y,
      state,
      this.lastMoveWasRotation,
      this.usedLastKick,
    );

    // 락 아웃 판정: 피스 전체가 버퍼(가시 영역 위)에서 고정되면 탑아웃
    let allInBuffer = true;
    for (const c of cells) {
      if (y + c.y >= this.board.bufferRows) {
        allInBuffer = false;
        break;
      }
    }

    this.board.lock(cells, x, y, type);

    const fullRows = this.board.getFullRows();
    const linesCleared = fullRows.length;
    if (linesCleared > 0) this.board.clearRows(fullRows);

    // 퍼펙트 클리어: 클리어 후 보드가 완전히 비었는가
    let perfectClear = false;
    if (linesCleared > 0) {
      perfectClear = this._isBoardEmpty();
    }

    const result = this.scoring.lockResult({ linesCleared, tSpin, perfectClear });

    // 이벤트 방출 순서: tspin → lineclear → combo → levelup → lock
    if (tSpin !== 'none') {
      this.emitter.emit(EVENTS.TSPIN, {
        variant: tSpin, // 'mini' | 'full'
        lines: linesCleared,
        points: result.points,
        backToBack: result.backToBack,
      });
    }
    if (linesCleared > 0) {
      this.emitter.emit(EVENTS.LINE_CLEAR, {
        rows: fullRows.slice(),
        count: linesCleared,
        tSpin, // 'none' | 'mini' | 'full'
        backToBack: result.b2bApplied,
        combo: result.combo,
        perfectClear,
        points: result.points,
      });
    }
    if (result.combo >= 1) {
      // 콤보 증가(2연속 클리어부터). g7이 이 값으로 패널티 라인을 산출한다.
      this.emitter.emit(EVENTS.COMBO, { combo: result.combo, count: linesCleared });
    }
    if (result.leveledUp) {
      this.emitter.emit(EVENTS.LEVEL_UP, { level: result.level });
    }
    this.emitter.emit(EVENTS.LOCK, {
      type,
      rows: fullRows.slice(),
      linesCleared,
      tSpin,
      score: this.scoring.score,
    });

    // 락 아웃 → 탑아웃 (라인을 지웠으면 보드가 내려가 회복되므로 면제)
    if (allInBuffer && linesCleared === 0) {
      this._topOut();
      return;
    }

    // 다음 피스
    this.holdUsed = false;
    if (!this.gameOver) this._spawn(this._shiftNext());
  }

  _isBoardEmpty() {
    const g = this.board.grid;
    for (let y = 0; y < this.board.height; y++) {
      for (let x = 0; x < this.board.width; x++) {
        if (g[y][x] !== null) return false;
      }
    }
    return true;
  }

  // ---- 틱 ----

  /**
   * 시간 진행. dtMs 만큼 중력/락딜레이를 진행한다.
   * @param {number} dtMs  경과 시간(ms)
   */
  update(dtMs) {
    if (!this.started || this.paused || this.gameOver || !this.active) return;
    const g = gravityForLevel(this.scoring.level);

    this.gravityAcc += dtMs;
    // 중력 스텝(여러 칸 누적 가능)
    let guard = 0;
    while (this.gravityAcc >= g && guard < this.board.height + 4) {
      this.gravityAcc -= g;
      guard += 1;
      if (this._tryShift(0, 1)) {
        // 자연 낙하 진행
        this.lastMoveWasRotation = false;
        this.usedLastKick = false;
        if (this.active.y > this.lowestY) {
          this.lowestY = this.active.y;
          this.lockResets = 0;
        }
      } else {
        this.gravityAcc = 0; // 더 못 내려감 → 접지
        break;
      }
    }

    // 락 딜레이
    if (this.isGrounded()) {
      this.lockTimer += dtMs;
      const capExhausted = this.lockResets >= this.maxLockResets;
      if (this.lockTimer >= this.lockDelay || (capExhausted && this.lockTimer > 0)) {
        this._lock();
      }
    } else {
      this.lockTimer = 0;
    }
  }

  // ---- 스냅샷(렌더/AI용 읽기 전용 뷰) ----

  /** 활성 피스의 절대 셀 좌표 목록과 메타. */
  snapshotActive() {
    if (!this.active) return { active: null };
    const { type, state, x, y } = this.active;
    const cells = this._activeCells().map((c) => ({ x: x + c.x, y: y + c.y }));
    return { active: { type, state, x, y, cells } };
  }

  /** 하드드롭 착지 행(고스트). 활성 피스 박스 좌상단 y. */
  getGhostY() {
    if (!this.active) return null;
    let y = this.active.y;
    while (!this.board.collides(this._activeCells(), this.active.x, y + 1)) y += 1;
    return y;
  }

  /** 전체 상태 스냅샷(렌더/직렬화/AI 입력). 내부 가변 객체를 복사해 노출한다. */
  snapshot() {
    return {
      board: this.board.visibleSnapshot(),
      active: this.snapshotActive().active,
      ghostY: this.getGhostY(),
      hold: this.hold,
      holdUsed: this.holdUsed,
      next: this.next.slice(),
      score: this.scoring.score,
      lines: this.scoring.lines,
      level: this.scoring.level,
      combo: this.scoring.combo,
      backToBack: this.scoring.backToBack,
      gameOver: this.gameOver,
      paused: this.paused,
    };
  }
}
