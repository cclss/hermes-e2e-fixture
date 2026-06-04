// ============================================================================
// run.mjs — 대전(g7) 헤드리스 검증 하니스 (node로 실행, DOM 비의존)
//
//   node src/versus/__tests__/run.mjs   (또는 npm test)
//
// 공격 테이블/구멍 모델(순수), 보드·엔진 가비지 주입 API, 그리고 VersusController의
// 공격→상쇄→예고→삽입 흐름을 렌더 의존 없이 검증한다. document/window가 없어도
// 컨트롤러가 안전하게 동작함을 함께 확인한다(연출은 no-op).
// ============================================================================

import { TetrisEngine, EVENTS, Board, mulberry32 } from '../../engine/index.js';
import {
  computeAttackLines,
  nextHoleColumn,
  ATTACK_LINES,
  TSPIN_ATTACK,
  COMBO_BONUS,
  PERFECT_CLEAR_BONUS,
} from '../attack-table.js';
import { VersusController } from '../versus-controller.js';

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
    console.error('  ✗ ' + msg);
  }
}
function eq(a, b, msg) {
  ok(a === b, `${msg} (기대 ${b}, 실제 ${a})`);
}
function section(name) {
  console.log('\n— ' + name);
}

// 렌더/이펙트 없는 가짜 세션(컨트롤러가 요구하는 최소 표면).
function fakeSession(engine, isAI = false) {
  return { engine, effects: null, isAI, cfg: { surface: null }, onTick: null, onRestart: null };
}

// ---------------------------------------------------------------------------
section('공격 테이블 — 라인/스핀/B2B/콤보/퍼펙트');
{
  eq(computeAttackLines({ count: 1 }), ATTACK_LINES[1], '싱글 → 0줄');
  eq(computeAttackLines({ count: 2 }), 1, '더블 → 1줄');
  eq(computeAttackLines({ count: 3 }), 2, '트리플 → 2줄');
  eq(computeAttackLines({ count: 4 }), 4, '테트리스 → 4줄');
  eq(computeAttackLines({ count: 0 }), 0, '0줄 클리어 → 0줄');

  eq(computeAttackLines({ count: 2, tSpin: 'full' }), TSPIN_ATTACK[2], 'T스핀 더블 → 4줄');
  eq(computeAttackLines({ count: 1, tSpin: 'full' }), 2, 'T스핀 싱글 → 2줄');
  eq(computeAttackLines({ count: 1, tSpin: 'mini' }), 1, 'T스핀 미니 싱글 → 1줄');

  // B2B 보너스는 페이로드가 적용을 표시할 때만.
  eq(computeAttackLines({ count: 4, backToBack: true }), 4 + 1, '테트리스 + B2B → 5줄');
  eq(
    computeAttackLines({ count: 2, tSpin: 'full', backToBack: true }),
    TSPIN_ATTACK[2] + 1,
    'T스핀더블 + B2B → 5줄',
  );

  // 콤보: 표를 콤보 값으로 직접 인덱싱(0=첫 클리어).
  eq(computeAttackLines({ count: 1, combo: 0 }), 0, '싱글 콤보0 → 0줄');
  eq(computeAttackLines({ count: 1, combo: 1 }), COMBO_BONUS[1], '싱글 콤보1 → 1줄');
  eq(computeAttackLines({ count: 2, combo: 3 }), 1 + COMBO_BONUS[3], '더블 콤보3 → 3줄');
  eq(
    computeAttackLines({ count: 1, combo: 99 }),
    COMBO_BONUS[COMBO_BONUS.length - 1],
    '콤보 포화(>표길이) → 마지막 값',
  );

  // 퍼펙트 클리어 보너스.
  eq(
    computeAttackLines({ count: 4, perfectClear: true }),
    4 + PERFECT_CLEAR_BONUS,
    '테트리스 + 퍼펙트 → 14줄',
  );
}

// ---------------------------------------------------------------------------
section('구멍 컬럼 모델 — 결정성/유효범위/반복·어긋남');
{
  const rng = mulberry32(42);
  let prev = null;
  let inRange = true;
  for (let i = 0; i < 200; i++) {
    const h = nextHoleColumn(rng, prev, 10);
    if (h < 0 || h >= 10 || h !== (h | 0)) inRange = false;
    prev = h;
  }
  ok(inRange, '구멍은 항상 0..width-1 정수');

  // 동일 시드 → 동일 시퀀스(결정성).
  const seqA = [];
  const seqB = [];
  const ra = mulberry32(7);
  const rb = mulberry32(7);
  let pa = null;
  let pb = null;
  for (let i = 0; i < 20; i++) {
    pa = nextHoleColumn(ra, pa, 10);
    seqA.push(pa);
    pb = nextHoleColumn(rb, pb, 10);
    seqB.push(pb);
  }
  eq(seqA.join(','), seqB.join(','), '동일 시드 → 동일 구멍 시퀀스');

  // repeatProb=0 이면 직전 구멍과 반드시 달라진다(어긋남 보장).
  const r0 = mulberry32(123);
  let p0 = 3;
  let allDiffer = true;
  for (let i = 0; i < 50; i++) {
    const h = nextHoleColumn(r0, p0, 10, 0);
    if (h === p0) allDiffer = false;
    p0 = h;
  }
  ok(allDiffer, 'repeatProb=0 → 직전 구멍과 항상 다름');
}

// ---------------------------------------------------------------------------
section('Board.addGarbageRows — 삽입/구멍/상승/매장');
{
  const b = new Board();
  const W = b.width;
  const bottom = b.height - 1;
  // 바닥행에 표식 블록 하나.
  b.grid[bottom][0] = 'X';
  const buried = b.addGarbageRows(2, 3);
  ok(!buried, '빈 상단 → 매장 아님');
  // 가비지 2줄이 바닥에, 구멍은 컬럼3.
  eq(b.grid[bottom][3], null, '바닥 가비지행 구멍 = 컬럼3');
  eq(b.grid[bottom][0], 'G', '바닥 가비지행 비구멍 = G');
  eq(b.grid[bottom - 1][3], null, '아래 둘째 가비지행도 구멍 컬럼3');
  // 기존 표식 블록은 2칸 위로 상승.
  eq(b.grid[bottom - 2][0], 'X', '기존 블록이 2칸 위로 상승');
  // 가비지행 채움 칸 수 = W-1.
  let filled = 0;
  for (let x = 0; x < W; x++) if (b.grid[bottom][x] === 'G') filled++;
  eq(filled, W - 1, '가비지행은 구멍 1칸 빼고 모두 G');

  // 매장: 상단행에 블록이 있는데 위로 밀면 buried.
  const b2 = new Board();
  b2.grid[0][0] = 'X';
  ok(b2.addGarbageRows(1, 0), '상단행 블록 → 매장(buried) true');
}

// ---------------------------------------------------------------------------
section('Engine.addGarbage — 주입/이벤트/탑아웃');
{
  const eng = new TetrisEngine({ seed: 5 });
  eng.start();
  let garbageEvents = 0;
  eng.on(EVENTS.GARBAGE, () => garbageEvents++);
  const res = eng.addGarbage(3, 4);
  eq(res.applied, 3, '가비지 3줄 적용');
  eq(garbageEvents, 1, 'GARBAGE 이벤트 1회 방출');
  const snap = eng.snapshot();
  const bottom = snap.board[snap.board.length - 1];
  let g = 0;
  for (const v of bottom) if (v === 'G') g++;
  eq(g, eng.board.width - 1, '바닥 가시행에 가비지(구멍1) 표시');

  // 매장 시 탑아웃.
  const eng2 = new TetrisEngine({ seed: 6 });
  eng2.start();
  // 버퍼 최상단행을 채워 위로 밀면 탑아웃되게.
  eng2.board.grid[0][0] = 'X';
  let topout = false;
  eng2.on(EVENTS.TOPOUT, () => (topout = true));
  const r2 = eng2.addGarbage(1, 5);
  ok(r2.topout && topout, '상단 매장 → 탑아웃');

  // 게임오버/미시작 가드.
  const eng3 = new TetrisEngine({ seed: 7 });
  eq(eng3.addGarbage(3, 0).applied, 0, '미시작 엔진은 주입 무시');
}

// ---------------------------------------------------------------------------
section('VersusController — 공격→상쇄→예고→삽입 (DOM 없이)');
{
  const pEng = new TetrisEngine({ seed: 11 });
  const aEng = new TetrisEngine({ seed: 22 });
  pEng.start();
  aEng.start();
  const player = fakeSession(pEng, false);
  const ai = fakeSession(aEng, true);
  const vs = new VersusController({ player, ai, seed: 99, tauntTarget: null });

  // 컨트롤러가 세션 프레임 훅을 설치했는가.
  ok(typeof player.onTick === 'function', '플레이어 세션에 onTick 설치');
  ok(typeof ai.onTick === 'function', 'AI 세션에 onTick 설치');

  // (1) 플레이어 테트리스 → AI 수신 큐에 4줄 예고.
  pEng.emitter.emit(EVENTS.LINE_CLEAR, { count: 4, tSpin: 'none', combo: 0 });
  eq(vs.ai.incoming.length, 1, 'AI 수신 큐에 배치 1개');
  eq(vs.ai.incoming[0].lines, 4, '예고 4줄(테트리스)');
  ok(vs.ai.incoming[0].charge > 0, '갓 전송된 가비지는 충전중(예고)');

  // 아직 충전중 → 드롭(0줄 락)해도 삽입 안 됨.
  const beforeH = aEng.board.highestFilledRow();
  aEng.emitter.emit(EVENTS.LOCK, { linesCleared: 0 });
  eq(aEng.board.highestFilledRow(), beforeH, '충전중 가비지는 드롭 시 삽입 안 함');

  // 충전 완료까지 시간 진행(onTick으로 charge 감소).
  for (let i = 0; i < 80; i++) ai.onTick(16, aEng.snapshot());
  ok(vs.ai.incoming[0].charge <= 0, '시간 경과 후 armed');

  // (2) AI가 드롭(0줄)하면 armed 4줄이 보드에 삽입.
  aEng.emitter.emit(EVENTS.LOCK, { linesCleared: 0 });
  eq(vs.ai.incoming.length, 0, '삽입 후 수신 큐 비움');
  const aSnap = aEng.snapshot();
  let bottomG = 0;
  for (const v of aSnap.board[aSnap.board.length - 1]) if (v === 'G') bottomG++;
  eq(bottomG, aEng.board.width - 1, 'AI 바닥에 가비지 삽입됨');

  // (3) 상쇄(counter): AI에 예고가 쌓인 상태에서 AI가 라인 클리어 → 잔여만 전송.
  vs.ai.incoming.push({ lines: 3, charge: 0 });
  // AI 더블(=1줄 공격) → 자기 수신 3줄 중 1줄 상쇄, 잔여 2줄 유지, 전송 0.
  aEng.emitter.emit(EVENTS.LINE_CLEAR, { count: 2, tSpin: 'none', combo: 0 });
  eq(vs.ai.incoming.reduce((n, b) => n + b.lines, 0), 2, 'AI 더블이 수신 1줄 상쇄(3→2)');
  eq(vs.player.incoming.length, 0, '상쇄로 전부 소모 → 플레이어에게 전송 없음');

  // (4) 라인 지운 락(linesCleared>0)은 가비지 삽입을 트리거하지 않음.
  vs.ai.incoming = [{ lines: 4, charge: 0 }];
  const h2 = aEng.board.highestFilledRow();
  aEng.emitter.emit(EVENTS.LOCK, { linesCleared: 2 });
  eq(aEng.board.highestFilledRow(), h2, '라인 지운 락은 가비지 미삽입');

  // (5) 한 드롭 삽입 상한(MAX_APPLY_PER_LOCK=8): 12줄 armed → 8줄만 삽입, 4줄 잔여.
  const pEng2 = new TetrisEngine({ seed: 33 });
  pEng2.start();
  const player2 = fakeSession(pEng2, false);
  const ai2 = fakeSession(new TetrisEngine({ seed: 44 }), true);
  ai2.engine.start();
  const vs2 = new VersusController({ player: player2, ai: ai2, seed: 1, tauntTarget: null });
  vs2.player.incoming = [{ lines: 12, charge: 0 }];
  pEng2.emitter.emit(EVENTS.LOCK, { linesCleared: 0 });
  eq(vs2.player.incoming.reduce((n, b) => n + b.lines, 0), 4, '상한 8줄 삽입 후 4줄 잔여');

  // (6) 재시작 훅: 수신 큐 초기화.
  vs.player.incoming = [{ lines: 5, charge: 100 }];
  player.onRestart();
  eq(vs.player.incoming.length, 0, '재시작 시 수신 큐 초기화');
}

// ---------------------------------------------------------------------------
console.log(`\n결과: ${passed} 통과, ${failed} 실패`);
if (failed > 0) {
  console.error('실패 항목:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('대전(g7) 검증 통과 ✓');
