// ============================================================================
// run.mjs — 헤드리스 엔진 검증 하니스 (node로 실행, DOM 비의존)
//
//   node src/engine/__tests__/run.mjs   (또는 npm test)
//
// 엔진이 렌더 의존 없이 동작함을 증명하고, SRS 회전/월킥·T스핀·B2B·콤보·
// 락딜레이·7-bag 분포를 표준에 맞게 검증한다.
// ============================================================================

import {
  TetrisEngine,
  EVENTS,
  Board,
  BagRandomizer,
  SHAPES,
  PIECE_TYPES,
  Scoring,
  detectTSpin,
  gravityForLevel,
} from '../index.js';

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) {
    passed++;
  } else {
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

// 보드 가시 영역 하단 기준으로 행을 채우는 헬퍼.
function fillRow(board, y, exceptCols = []) {
  const ex = new Set(exceptCols);
  for (let x = 0; x < board.width; x++) {
    if (!ex.has(x)) board.grid[y][x] = 'X';
  }
}

// ---------------------------------------------------------------------------
section('피스 정의 무결성');
for (const t of PIECE_TYPES) {
  for (let s = 0; s < 4; s++) {
    eq(SHAPES[t][s].cells.length, 4, `${t} 상태${s} 셀 4개`);
  }
}
// T 상태0 셀 좌표 표준 확인
{
  const c = SHAPES.T[0].cells.map((p) => `${p.x},${p.y}`).sort().join(' ');
  eq(c, '0,1 1,0 1,1 2,1', 'T 상태0 셀 좌표');
}
// O는 모든 상태 동일
{
  const a = JSON.stringify(SHAPES.O[0].cells);
  const b = JSON.stringify(SHAPES.O[2].cells);
  eq(a, b, 'O 회전 불변');
}

// ---------------------------------------------------------------------------
section('7-bag 랜덤마이저');
{
  const r = new BagRandomizer({ seed: 42 });
  const first7 = r.take(7);
  const uniq = new Set(first7);
  eq(uniq.size, 7, '첫 bag 7종 유일');
  ok(PIECE_TYPES.every((t) => uniq.has(t)), '첫 bag에 7종 모두 포함');
  const second7 = new Set(r.take(7));
  eq(second7.size, 7, '둘째 bag 7종 유일');

  // 결정성: 같은 시드 → 같은 시퀀스
  const r2 = new BagRandomizer({ seed: 42 });
  const seqA = new BagRandomizer({ seed: 42 }).take(20).join('');
  const seqB = r2.take(20).join('');
  eq(seqA, seqB, '시드 결정성');
  // 다른 시드 → (거의 확실히) 다른 시퀀스
  const seqC = new BagRandomizer({ seed: 7 }).take(20).join('');
  ok(seqA !== seqC, '다른 시드 → 다른 시퀀스');
}

// ---------------------------------------------------------------------------
section('SRS 월킥: T 플로어킥 (0→R, 킥 인덱스 2)');
{
  // 빈 보드. T를 바닥에 접지시키고 CW 회전 → [0,0],[-1,0] 막히고 [-1,-1] 성공.
  const eng = new TetrisEngine({ seed: 1 });
  eng.start();
  const H = eng.board.height;
  eng.active = { type: 'T', state: 0, x: 4, y: H - 2 }; // 박스 바닥행 = H-1
  eng.lastMoveWasRotation = false;
  eng.lowestY = H - 2;
  let kickIndex = -1;
  eng.once(EVENTS.ROTATE, (e) => (kickIndex = e.kickIndex));
  const x0 = eng.active.x;
  const y0 = eng.active.y;
  const ok2 = eng.rotateCW();
  ok(ok2, '플로어킥 회전 성공');
  eq(eng.active.state, 1, '상태 R로 전이');
  eq(kickIndex, 2, '사용된 킥 인덱스 = 2');
  eq(eng.active.x, x0 - 1, '킥으로 x -1');
  eq(eng.active.y, y0 - 1, '킥으로 y -1 (위로)');
}

// ---------------------------------------------------------------------------
section('SRS 월킥: 막히지 않으면 킥 인덱스 0');
{
  const eng = new TetrisEngine({ seed: 1 });
  eng.start();
  const H = eng.board.height;
  eng.active = { type: 'T', state: 0, x: 4, y: H - 6 }; // 공중
  let kickIndex = -1;
  eng.once(EVENTS.ROTATE, (e) => (kickIndex = e.kickIndex));
  eng.rotateCW();
  eq(kickIndex, 0, '여유 있으면 기본 위치(0) 채택');
}

// ---------------------------------------------------------------------------
section('T-스핀 판정 (순수 함수, 3-코너 규칙)');
{
  const b = new Board();
  const H = b.height;
  // T 정면이 아래(state2), 박스(3,H-3). BL/BR + 오버행(TL) = 3코너, 정면 BL/BR 점유 → full
  fillRow(b, H - 1, [4]); // 바닥: col4만 빈 슬롯
  fillRow(b, H - 2, [3, 4, 5]); // 위: cols3,4,5 빈 슬롯
  b.grid[H - 3][3] = 'X'; // 오버행 → TL 코너 점유
  const variant = detectTSpin(b, 'T', 3, H - 3, 2, true, false);
  eq(variant, 'full', 'TSD 형태 → full T-스핀');

  // 회전이 아니었으면 none
  eq(detectTSpin(b, 'T', 3, H - 3, 2, false, false), 'none', '비회전 → none');

  // 미니: 정면 코너 하나만, 마지막 킥 아님 → mini
  const b2 = new Board();
  const H2 = b2.height;
  // state0(정면=TL,TR). TR만 + 뒤쪽 BL,BR 점유 → 정면 1개 → mini
  b2.grid[H2 - 1][2] = 'X'; // BL? 코너 좌표는 box(0,H2-3): TL(0,H2-3) TR(2,H2-3) BL(0,H2-1) BR(2,H2-1)
  // 코너 3개 채우되 정면(TL,TR) 중 하나만
  b2.grid[H2 - 1][0] = 'X'; // BL
  b2.grid[H2 - 1][2] = 'X'; // BR
  b2.grid[H2 - 3][2] = 'X'; // TR (정면 1개)
  const mini = detectTSpin(b2, 'T', 0, H2 - 3, 0, true, false);
  eq(mini, 'mini', '정면 1코너 → mini');
  const promoted = detectTSpin(b2, 'T', 0, H2 - 3, 0, true, true);
  eq(promoted, 'full', '마지막 킥이면 mini→full 승격');
}

// ---------------------------------------------------------------------------
section('엔진 통합: T-스핀 더블 + B2B + 콤보');
{
  const eng = new TetrisEngine({ seed: 1 });
  eng.start();
  const H = eng.board.height;

  function buildTSD() {
    eng.board.reset();
    fillRow(eng.board, H - 1, [4]); // 바닥 col4 슬롯
    fillRow(eng.board, H - 2, [3, 4, 5]); // 위 cols3,4,5 슬롯
    eng.board.grid[H - 3][3] = 'X'; // 오버행
  }

  // --- 1차 TSD ---
  buildTSD();
  let tspinEvt = null;
  let lineEvt = null;
  let comboEvt = null;
  const offT = eng.on(EVENTS.TSPIN, (e) => (tspinEvt = e));
  const offL = eng.on(EVENTS.LINE_CLEAR, (e) => (lineEvt = e));
  const offC = eng.on(EVENTS.COMBO, (e) => (comboEvt = e));

  eng.active = { type: 'T', state: 2, x: 3, y: H - 3 };
  eng.lastMoveWasRotation = true;
  eng.usedLastKick = false;
  const scoreBefore = eng.scoring.score;
  eng._lock();

  ok(tspinEvt && tspinEvt.variant === 'full', '1차: full T-스핀 이벤트');
  ok(lineEvt && lineEvt.count === 2, '1차: 2줄 클리어');
  eq(eng.scoring.score - scoreBefore, 1200, '1차 점수 = TSD 1200 (레벨1)');
  eq(eng.scoring.backToBack, true, '1차 후 B2B 활성');
  eq(eng.scoring.combo, 0, '1차 후 콤보 0');

  // --- 2차 TSD (연속) ---
  tspinEvt = null;
  lineEvt = null;
  comboEvt = null;
  buildTSD();
  eng.active = { type: 'T', state: 2, x: 3, y: H - 3 };
  eng.lastMoveWasRotation = true;
  eng.usedLastKick = false;
  const score2Before = eng.scoring.score;
  eng._lock();

  ok(lineEvt && lineEvt.backToBack === true, '2차: B2B 적용 표시');
  // 점수 = floor(1200*1.5)=1800 + 콤보(50*1) = 1850
  eq(eng.scoring.score - score2Before, 1850, '2차 점수 = B2B 1800 + 콤보 50');
  eq(eng.scoring.combo, 1, '2차 후 콤보 1');
  ok(comboEvt && comboEvt.combo === 1, '2차: 콤보 증가 이벤트(콤보 1)');

  offT();
  offL();
  offC();
}

// ---------------------------------------------------------------------------
section('스코어링 단위: 콤보/B2B 누적');
{
  const s = new Scoring({ level: 1 });
  let r = s.lockResult({ linesCleared: 1, tSpin: 'none' });
  eq(r.comboBonus, 0, '첫 클리어 콤보 보너스 0');
  eq(s.combo, 0, '콤보 0');
  r = s.lockResult({ linesCleared: 1, tSpin: 'none' });
  eq(r.comboBonus, 50, '둘째 연속 클리어 콤보 50');
  eq(s.combo, 1, '콤보 1');
  r = s.lockResult({ linesCleared: 0, tSpin: 'none' });
  eq(s.combo, -1, '클리어 실패 시 콤보 리셋');

  // 테트리스 B2B
  const s2 = new Scoring({ level: 1 });
  s2.lockResult({ linesCleared: 4, tSpin: 'none' }); // 800
  const r2 = s2.lockResult({ linesCleared: 4, tSpin: 'none' }); // 800*1.5=1200 + combo50
  ok(r2.b2bApplied, '연속 테트리스 B2B 적용');
}

// ---------------------------------------------------------------------------
section('중력 곡선 단조 감소');
{
  let prev = Infinity;
  let mono = true;
  for (let lv = 1; lv <= 15; lv++) {
    const g = gravityForLevel(lv);
    if (g > prev) mono = false;
    prev = g;
  }
  ok(mono, '레벨↑ → 중력 간격↓(또는 동일)');
  eq(Math.round(gravityForLevel(1)), 1000, '레벨1 중력 ≈ 1000ms');
}

// ---------------------------------------------------------------------------
section('락 딜레이: 슬라이드/회전 여유');
{
  const eng = new TetrisEngine({ seed: 1, lockDelay: 500 });
  eng.start();
  let lockCount = 0;
  eng.on(EVENTS.LOCK, () => lockCount++);

  // 활성 피스를 바닥까지 소프트드롭으로 접지
  let guard = 0;
  while (eng.softDrop() && guard++ < 60) {}
  ok(eng.isGrounded(), '접지 상태');

  eng.update(400); // 락딜레이 미만
  eq(lockCount, 0, '400ms 후 아직 락 안 됨');

  eng.moveLeft(); // 이동 → 타이머 리셋
  eng.update(400);
  eq(lockCount, 0, '이동 리셋으로 추가 400ms에도 락 안 됨');

  eng.update(150); // 누적 550 > 500
  eq(lockCount, 1, '리셋 후 500ms 경과 → 락');
}

// ---------------------------------------------------------------------------
section('헤드리스성: DOM 접근 없이 전체 게임 진행');
{
  const eng = new TetrisEngine({ seed: 99 });
  eng.start();
  let topout = false;
  eng.on(EVENTS.TOPOUT, () => (topout = true));
  // 계속 하드드롭만 하며 진행 → 결국 탑아웃까지 도달(무한루프 가드)
  let steps = 0;
  while (!topout && steps++ < 2000) {
    eng.update(16);
    if (!eng.gameOver) eng.hardDrop();
  }
  ok(eng.snapshot().board.length === eng.board.visibleHeight, '스냅샷 가시 영역 높이');
  ok(steps < 2000, '유한 스텝 내 진행/종료(렌더 의존 0)');
}

// ---------------------------------------------------------------------------
console.log(`\n결과: ${passed} 통과, ${failed} 실패`);
if (failed > 0) {
  console.error('실패 항목:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('모든 검증 통과 ✓');
