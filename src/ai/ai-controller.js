// ============================================================================
// ai/ai-controller.js — 휴리스틱 봇 구동기 (프레임 분산 실행)
//
// 별도로 구동되는 AI 엔진 인스턴스(g3 API)를 인간처럼 단계 실행한다. 플레이어
// 엔진/입력에는 일절 접근하지 않는다(경계: AI는 자기 엔진만 만진다).
//
// 상태기:
//   think → 새 피스 등장 시 thinkMs(±분산)만큼 "숙고". 시간이 차면 한 번 탐색해
//           목표 배치(plan = {state, x})를 정한다.
//   exec  → moveMs(±분산) 간격마다 한 스텝씩: 회전 → 수평 이동 → (정렬되면)
//           하드드롭. 회전/이동을 엔진 커맨드로 직접 내리고 결과(active)를 읽어
//           적응적으로 진행하므로 월킥에도 안전하다.
//   done  → 다음 피스 스폰(active 참조 교체)까지 대기.
//
// 탐색은 think 종료 시 1회만 수행하고(가지치기+빔으로 비용 억제), 실제 손동작은
// 프레임마다 한 스텝으로 분산 → 메인 루프를 막지 않고 기계적이지 않게 보인다.
// 생각시간·이동간격에 분산을 주어 매번 다른 리듬으로 둔다.
// ============================================================================

import { planMove } from './placement-search.js';
import { resolveDifficulty } from './difficulty.js';

const STEP_GUARD = 32; // 한 프레임에 처리할 스텝 상한(긴 dt 점프 시 폭주 방지)

export class AIController {
  /**
   * @param {object} cfg
   * @param {() => object} cfg.getEngine        구동할 AI 엔진 인스턴스 반환(재시작 시 교체 가능)
   * @param {string|object} [cfg.difficulty='medium']
   * @param {(info:object)=>void} [cfg.onHardDrop]  하드드롭 직전 관찰 훅(이펙트용, 키보드 컨트롤러와 동일 계약)
   * @param {()=>number} [cfg.rng=Math.random]   분산/실수용 난수원(테스트 주입 가능)
   */
  constructor({ getEngine, difficulty = 'medium', onHardDrop = null, rng = Math.random }) {
    this.getEngine = getEngine;
    this.cfg = resolveDifficulty(difficulty);
    this.onHardDrop = onHardDrop;
    this.rng = rng || Math.random;
    this._reset();
  }

  /** 난이도 교체(g8 선택 UI 대응). 진행 상태는 다음 피스부터 반영된다. */
  setDifficulty(d) {
    this.cfg = resolveDifficulty(d);
  }

  _reset() {
    this.activeRef = null; // 마지막으로 계획을 세운 활성 피스 참조
    this.phase = 'idle'; // 'idle' | 'think' | 'exec' | 'done'
    this.plan = null; // { state, x }
    this.thinkTimer = 0;
    this.thinkBudget = 0;
    this.moveTimer = 0;
    this.moveBudget = 0;
  }

  /** 재시작 등으로 봇 상태를 초기화한다. */
  reset() {
    this._reset();
  }

  _jitter(base, jitter) {
    if (!jitter) return base;
    return Math.max(0, base + (this.rng() * 2 - 1) * jitter);
  }

  /** 프레임마다 호출. 엔진은 이후 update(dt)로 중력/락을 진행한다. */
  update(dt) {
    const eng = this.getEngine();
    if (!eng || !eng.started || eng.gameOver || eng.paused) return;
    const active = eng.active;
    if (!active) return;

    // 새 피스 감지: 엔진은 스폰마다 active를 새 객체로 교체한다.
    if (active !== this.activeRef) {
      this.activeRef = active;
      this.plan = null;
      this.phase = 'think';
      this.thinkTimer = 0;
      this.thinkBudget = this._jitter(this.cfg.thinkMs, this.cfg.thinkJitter);
    }

    if (this.phase === 'think') {
      this.thinkTimer += dt;
      if (this.thinkTimer >= this.thinkBudget) {
        this.plan = this._decide(eng);
        this.phase = 'exec';
        this.moveTimer = 0;
        this.moveBudget = this._jitter(this.cfg.moveMs, this.cfg.moveJitter);
      }
      return;
    }

    if (this.phase === 'exec') {
      this.moveTimer += dt;
      let guard = 0;
      while (this.phase === 'exec' && this.moveTimer >= this.moveBudget && guard < STEP_GUARD) {
        guard += 1;
        this.moveTimer -= this.moveBudget;
        this.moveBudget = this._jitter(this.cfg.moveMs, this.cfg.moveJitter);
        this._stepExec(eng);
      }
    }
  }

  /** 목표 배치 결정. 실수 확률에 따라 차선을 고른다. */
  _decide(eng) {
    const candidates = planMove(eng, this.cfg);
    if (candidates.length === 0) {
      // 둘 곳을 못 찾으면(거의 없음) 현 상태로 즉시 떨군다.
      return { state: eng.active.state, x: eng.active.x };
    }
    if (this.cfg.mistakeProb > 0 && candidates.length > 1 && this.rng() < this.cfg.mistakeProb) {
      const pool = Math.min(this.cfg.mistakePool || 4, candidates.length - 1);
      const idx = 1 + Math.floor(this.rng() * pool);
      return candidates[Math.min(idx, candidates.length - 1)];
    }
    return candidates[0];
  }

  /** exec 단계 한 스텝: 회전 → 이동 → 정렬되면 하드드롭. */
  _stepExec(eng) {
    const a = eng.active;
    if (!a) {
      this.phase = 'done';
      return;
    }
    // 1) 회전 정렬
    if (a.state !== this.plan.state) {
      const before = a.state;
      this._rotateToward(eng, before, this.plan.state);
      if (eng.active && eng.active.state !== before) return; // 회전 진행됨
      // 회전 실패(벽 등) → 수평/드롭으로 진행
    }
    // 2) 수평 정렬
    const cur = eng.active;
    if (cur && cur.x !== this.plan.x) {
      const moved = cur.x < this.plan.x ? eng.moveRight() : eng.moveLeft();
      if (moved) return; // 한 칸 이동
      // 막힘 → 현재 위치에서 떨군다(최선 노력)
    }
    // 3) 정렬 완료(또는 막힘) → 하드드롭
    this._commitDrop(eng);
    this.phase = 'done';
  }

  /** from→to 최소 회전 1스텝. 180°는 다음 스텝에서 한 번 더. */
  _rotateToward(eng, from, to) {
    const diff = ((to - from) % 4 + 4) % 4;
    if (diff === 3) eng.rotateCCW();
    else eng.rotateCW(); // diff 1 또는 2(2는 두 스텝에 걸쳐)
  }

  /** 하드드롭(이펙트 훅에 낙하 직전 좌표 전달 — 엔진 규칙은 읽기만). */
  _commitDrop(eng) {
    let info = null;
    if (this.onHardDrop && eng.active) {
      const snap = eng.snapshotActive().active;
      if (snap) info = { cells: snap.cells, type: snap.type, fromY: snap.y, toY: eng.getGhostY() };
    }
    eng.hardDrop();
    if (info) this.onHardDrop(info);
  }
}
