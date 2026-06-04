// ============================================================================
// run.mjs — 휴리스틱 봇 검증 하니스 (node 실행, DOM 비의존)
//
//   node src/ai/__tests__/run.mjs   (또는 npm test가 엔진 테스트 뒤 함께 실행)
//
// 봇이 렌더 의존 없이 동작함을 증명한다: 보드 평가 휴리스틱의 정확성, 배치
// 탐색이 라인 완성/구멍 회피를 선택함, AI 컨트롤러가 별도 엔진을 단계 실행해
// 라인을 지움, 난이도(쉬움/어려움)가 체감상 구분됨(어려움이 구멍↓·라인↑).
// ============================================================================

import { TetrisEngine, Board, mulberry32 } from '../../engine/index.js';
import {
  columnHeights,
  countHoles,
  bumpiness,
  wellDepths,
  evaluateGrid,
  DEFAULT_WEIGHTS,
} from '../heuristics.js';
import { enumeratePlacements, scorePlacements, planMove } from '../placement-search.js';
import { AIController } from '../ai-controller.js';
import { resolveDifficulty, DIFFICULTIES } from '../difficulty.js';

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

// 빈 그리드 H×W 생성.
function emptyGrid(W, H) {
  const g = new Array(H);
  for (let y = 0; y < H; y++) g[y] = new Array(W).fill(null);
  return g;
}

// ---------------------------------------------------------------------------
section('휴리스틱 — 열 높이 / 구멍 / 거칠기 / 우물');
{
  const W = 6;
  const H = 6;
  const g = emptyGrid(W, H);
  // 0열: 바닥 3칸 채움 → 높이 3
  g[5][0] = 'X';
  g[4][0] = 'X';
  g[3][0] = 'X';
  // 1열: 맨 위(상대)만 채우고 아래 비움 → 높이 4, 구멍 3
  g[2][1] = 'X';
  // 2열: 비움 → 높이 0
  const heights = columnHeights(g, W, H);
  eq(heights[0], 3, '0열 높이');
  eq(heights[1], 4, '1열 높이(맨 위 블록까지)');
  eq(heights[2], 0, '2열 높이 0');

  const holes = countHoles(g, heights, W, H);
  eq(holes, 3, '1열 아래 막힌 구멍 3');

  const bump = bumpiness(heights);
  // |3-4|+|4-0|+0+0+0 = 1+4 = 5
  eq(bump, 5, '표면 거칠기 합');

  const wells = wellDepths(heights, W, H);
  // 2열: 좌(4) 우(0) → min 0 - 0 = 0 (우물 아님)
  eq(wells[2], 0, '평평한 쪽은 우물 아님');
}
{
  // 가장자리 테트리스 우물: 마지막 열만 비고 나머지 높이 4
  const W = 5;
  const H = 8;
  const g = emptyGrid(W, H);
  for (let c = 0; c < W - 1; c++) {
    for (let y = H - 4; y < H; y++) g[y][c] = 'X';
  }
  const heights = columnHeights(g, W, H);
  const wells = wellDepths(heights, W, H);
  eq(wells[W - 1], 4, '가장자리 빈 열은 깊이 4 우물(벽=천장 취급)');
}

// ---------------------------------------------------------------------------
section('휴리스틱 — 평가 점수 방향성');
{
  const W = 6;
  const H = 8;
  // 평평하고 낮은 보드(좋음)
  const flat = emptyGrid(W, H);
  for (let c = 0; c < W; c++) flat[H - 1][c] = 'X';
  // 구멍이 많은 보드(나쁨)
  const holey = emptyGrid(W, H);
  for (let c = 0; c < W; c++) {
    holey[H - 1][c] = c % 2 === 0 ? 'X' : null;
    holey[H - 3][c] = 'X'; // 위에 블록, 아래 빈칸 → 구멍 유발
  }
  const sFlat = evaluateGrid(flat, W, H, { lines: 0 }).score;
  const sHoley = evaluateGrid(holey, W, H, { lines: 0 }).score;
  ok(sFlat > sHoley, `평평/낮은 보드가 구멍투성이보다 높은 점수 (${sFlat.toFixed(2)} > ${sHoley.toFixed(2)})`);
}
{
  // 라인 클리어는 보상이다: 같은 보드라도 lines가 크면 점수 증가.
  const W = 6;
  const H = 8;
  const g = emptyGrid(W, H);
  for (let c = 0; c < W; c++) g[H - 1][c] = 'X';
  const s0 = evaluateGrid(g, W, H, { lines: 0 }).score;
  const s2 = evaluateGrid(g, W, H, { lines: 2 }).score;
  ok(s2 > s0, `라인 클리어 보상 반영 (${s2.toFixed(2)} > ${s0.toFixed(2)})`);
}
{
  // 공격성: 테트리스 우물(깊이≥4)을 갖춘 보드는 aggression이 클수록 더 선호된다.
  const W = 6;
  const H = 10;
  const g = emptyGrid(W, H);
  for (let c = 0; c < W - 1; c++) for (let y = H - 5; y < H; y++) g[y][c] = 'X';
  const sLow = evaluateGrid(g, W, H, { lines: 0, aggression: 0 }).score;
  const sHigh = evaluateGrid(g, W, H, { lines: 0, aggression: 0.9 }).score;
  ok(sHigh > sLow, `공격형이 테트리스 우물 보드를 더 선호 (${sHigh.toFixed(2)} > ${sLow.toFixed(2)})`);
}

// ---------------------------------------------------------------------------
section('배치 탐색 — 열거 / 최적 선택');
{
  // 빈 보드에서 O 피스: 가능한 열 = 9개(폭10, 박스 2 → x 0..8), 회전 1종.
  const eng = new TetrisEngine({ seed: 1 });
  eng.start();
  const board = eng.board;
  const placements = enumeratePlacements(board, 'O');
  eq(placements.length, board.width - 1, 'O 피스 빈 보드 배치 후보 수(폭-1)');
  for (const p of placements) eq(p.lines, 0, 'O 배치는 라인 미완성');
}
{
  // 한 칸만 비어 줄이 완성되는 상황: 그 칸을 채우는 배치를 선택해야 한다.
  // 가시 영역 맨 아랫줄(버퍼 20 + 19 = 39행)을 9번 열까지 채우고 9열만 비움.
  const board = new Board();
  const bottom = board.height - 1;
  for (let x = 0; x < board.width - 1; x++) board.grid[bottom][x] = 'X';
  // 세로 I(상태1)를 마지막 열에 떨구면 1줄 완성. 최적 후보가 라인을 완성해야 한다.
  const cands = scorePlacements(board, 'I', { weights: DEFAULT_WEIGHTS });
  const best = cands[0];
  ok(best.lines >= 1, `라인 완성 배치를 최적으로 선택 (lines=${best.lines})`);
  // 라인을 완성하는 후보가 실제로 존재(마지막 빈 열을 메우는 배치)
  ok(
    cands.some((c) => c.lines >= 1),
    '라인 완성 가능한 배치가 후보에 존재',
  );
}

// ---------------------------------------------------------------------------
section('AI 컨트롤러 — 별도 엔진 단계 실행');
{
  // 봇이 엔진을 구동해 피스를 락하고(보드가 채워짐) 크래시 없이 진행하는지.
  const eng = new TetrisEngine({ seed: 42 });
  eng.start();
  const bot = new AIController({
    getEngine: () => eng,
    difficulty: 'hard',
    rng: mulberry32(7),
  });
  const locks = runMatch(eng, bot, 20);
  ok(locks >= 15, `20피스 목표 중 충분히 락됨 (locks=${locks})`);
  ok(!Number.isNaN(eng.scoring.score), '점수 정상(NaN 아님)');
}
{
  // 플레이어 엔진 비간섭: 봇은 자기 엔진만 만진다.
  const playerEng = new TetrisEngine({ seed: 1 });
  playerEng.start();
  const beforeScore = playerEng.scoring.score;
  const aiEng = new TetrisEngine({ seed: 2 });
  aiEng.start();
  const bot = new AIController({ getEngine: () => aiEng, difficulty: 'medium', rng: mulberry32(3) });
  runMatch(aiEng, bot, 10);
  eq(playerEng.scoring.score, beforeScore, '봇 구동이 다른(플레이어) 엔진에 영향 없음');
  ok(playerEng.active !== aiEng.active, '두 엔진의 활성 피스는 독립 객체');
}

// ---------------------------------------------------------------------------
section('난이도 — 체감 구분(어려움이 구멍↓ · 라인↑)');
{
  // 동일 시드로 쉬움 vs 어려움을 충분히 길게 돌려 결과 품질을 비교한다.
  const PIECES = 40;
  const easy = runStats('easy', 1234, PIECES);
  const hard = runStats('hard', 1234, PIECES);
  console.log(
    `    easy : lines=${easy.lines} holes=${easy.holes} maxH=${easy.maxHeight}`,
  );
  console.log(
    `    hard : lines=${hard.lines} holes=${hard.holes} maxH=${hard.maxHeight}`,
  );
  ok(hard.holes <= easy.holes, `어려움이 구멍을 더 적게 만든다 (hard ${hard.holes} ≤ easy ${easy.holes})`);
  ok(hard.lines >= easy.lines, `어려움이 라인을 더 많이 지운다 (hard ${hard.lines} ≥ easy ${easy.lines})`);
}
{
  // 생각시간 분산: 같은 봇이라도 매 피스 대기시간이 균일하지 않다(기계적이지 않음).
  const cfg = resolveDifficulty('medium');
  ok(cfg.thinkJitter > 0 && cfg.moveJitter > 0, 'medium 난이도에 생각/이동 분산 존재');
  ok(DIFFICULTIES.hard.thinkMs < DIFFICULTIES.easy.thinkMs, '어려움이 더 빨리 생각한다');
  ok(DIFFICULTIES.hard.mistakeProb < DIFFICULTIES.easy.mistakeProb, '어려움이 실수를 덜 한다');
  ok(DIFFICULTIES.hard.aggression > DIFFICULTIES.easy.aggression, '어려움이 더 공격적이다');
  ok(DIFFICULTIES.hard.lookahead > DIFFICULTIES.easy.lookahead, '어려움이 더 깊게 수읽기한다');
}

// ---------------------------------------------------------------------------
// 헬퍼: 봇+엔진을 프레임 루프로 PIECES만큼 돌리고 락 횟수를 반환.
function runMatch(eng, bot, targetPieces) {
  const DT = 16; // ~60fps 프레임 간격
  const MAX_FRAMES = targetPieces * 400 + 2000;
  let locks = 0;
  eng.on('lock', () => {
    locks += 1;
  });
  let frames = 0;
  while (locks < targetPieces && !eng.gameOver && frames < MAX_FRAMES) {
    bot.update(DT);
    eng.update(DT);
    frames += 1;
  }
  return locks;
}

// 헬퍼: 난이도별로 PIECES만큼 돌린 뒤 보드 품질 통계를 낸다.
function runStats(difficulty, seed, pieces) {
  const eng = new TetrisEngine({ seed });
  eng.start();
  const bot = new AIController({
    getEngine: () => eng,
    difficulty,
    rng: mulberry32(seed + 99),
  });
  runMatch(eng, bot, pieces);
  const W = eng.board.width;
  const H = eng.board.height;
  const heights = columnHeights(eng.board.grid, W, H);
  const holes = countHoles(eng.board.grid, heights, W, H);
  return {
    lines: eng.scoring.lines,
    holes,
    maxHeight: Math.max(...heights),
  };
}

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(48)}`);
if (failed === 0) {
  console.log(`✓ AI 전체 통과: ${passed}개`);
  process.exit(0);
} else {
  console.error(`✗ 실패 ${failed}개 / 통과 ${passed}개`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
