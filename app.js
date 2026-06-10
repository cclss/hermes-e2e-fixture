/* =============================================================
   TETRIS BATTLE — app.js  (grain-3: AI Opponent, Difficulty System & Battle Mechanics)
   Brawl Stars-inspired 1v1 AI Tetris — Vanilla JS, no deps
   ============================================================= */

'use strict';

// ──────────────────────────────────────────────────────────────
// EVENT BUS
// ──────────────────────────────────────────────────────────────
const bus = (() => {
  const listeners = {};
  return {
    on(event, fn)     { (listeners[event] = listeners[event] || []).push(fn); },
    off(event, fn)    { if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== fn); },
    emit(event, data) { (listeners[event] || []).forEach(fn => fn(data)); },
  };
})();

// ──────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────
const COLS      = 10;
const ROWS      = 20;
const CELL      = 30;
const MINI_CELL = 22;

// Tetromino definitions — base rotation state 0
const TETROMINOES = {
  I: { color: '#5B9BF5', colorDark: '#3A7AD4', colorLight: '#8EC4FF', shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
  O: { color: '#FFC234', colorDark: '#D49A10', colorLight: '#FFD96A', shape: [[0,1,1,0],[0,1,1,0],[0,0,0,0]] },
  T: { color: '#9B4FE8', colorDark: '#7A2EC7', colorLight: '#C07FFF', shape: [[0,1,0],[1,1,1],[0,0,0]] },
  S: { color: '#5DBD47', colorDark: '#3D9D27', colorLight: '#85E065', shape: [[0,1,1],[1,1,0],[0,0,0]] },
  Z: { color: '#FF4040', colorDark: '#D42020', colorLight: '#FF7070', shape: [[1,1,0],[0,1,1],[0,0,0]] },
  J: { color: '#FF7027', colorDark: '#D45008', colorLight: '#FFA060', shape: [[1,0,0],[1,1,1],[0,0,0]] },
  L: { color: '#3EC9B4', colorDark: '#1EA98E', colorLight: '#70EDD8', shape: [[0,0,1],[1,1,1],[0,0,0]] },
};

const PIECE_KEYS = Object.keys(TETROMINOES);

// Standard Tetris guideline scoring
const SCORE_TABLE = { 1: 100, 2: 300, 3: 500, 4: 800 };
const COMBO_BONUS = 50;
const B2B_BONUS   = 1.5;

// Garbage lines sent per clear (standard VS table)
const GARBAGE_TABLE  = { 1: 0, 2: 1, 3: 2, 4: 4 };
const COMBO_GARBAGE  = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

// ── AI Difficulty Tiers ─────────────────────────────────────
// Rookie: slow + clumsy  |  Rival: moderate  |  Demon: near-perfect + T-spin
const AI_DIFFICULTY = {
  1: {
    name:         'ROOKIE',
    thinkDelayMs: 750,    // slow decision making
    mistakeRate:  0.35,   // 35% chance of random bad move
    weightNoise:  0.30,   // ±30% variation in heuristic weights
    tspinPref:    0.0,    // no T-spin seeking
  },
  2: {
    name:         'RIVAL',
    thinkDelayMs: 360,
    mistakeRate:  0.09,
    weightNoise:  0.11,
    tspinPref:    0.8,    // mild T-spin preference
  },
  3: {
    name:         'DEMON',
    thinkDelayMs: 90,     // near-instant
    mistakeRate:  0.01,   // nearly flawless
    weightNoise:  0.02,   // barely noisy
    tspinPref:    2.5,    // actively seeks T-spin setups
  },
};

// Dellacherie-style base heuristic weights
const BASE_W = {
  aggHeight:    0.510,
  holes:        3.500,
  bumpiness:    0.184,
  linesCleared: 3.500,
};

// ── T-bag Phrases — ≥8 total across 4 trigger types ─────────
const TBAG_PHRASES = {
  tetris: [
    '4-LINE! POGGERS 💥',
    'TETRIS! EZ CLAP 👏',
    'CLEAN SWEEP 🧹',
    'FULL SEND 😈',
    'PERFECT CLEAR? ALMOST 💅',
  ],
  escape: [
    'THOUGHT I WAS DONE? 👻',
    'I LIVE! 🔥',
    'NOT TODAY 😎',
    'COMEBACK KID 🤣',
    'CAN\'T STOP ME 💪',
  ],
  topout: [
    'L RATIO 💀',
    'STAY MAD 😤',
    'SKILL ISSUE 👁️',
    'BOZO 🤡',
    'GG NO RE 😈',
  ],
  combo: [
    'GG EZ 😈',
    'TOO SLOW 🐢',
    'IMAGINE LOSING 💅',
    'TOUCH GRASS 🌿',
    'NEXT TIME... 😏',
    'GET REKT 🎮',
    'YIKES 😬',
    'EZ GAME EZ LIFE 🎯',
  ],
};

// ── Penalty Flavor — Garbage Row Colors ──────────────────────
// Each flavor produces visually distinct injected rows
const GARBAGE_COLORS = {
  classic: '#636375',  // solid slate-gray — one gap
  cheese:  '#7A5930',  // dirty brown — Swiss-cheese holes
  messy:   '#2B6B45',  // forest green — drifting gap
  mirror:  '#2B4D8A',  // navy blue — reflected gap
  surge:   '#7A2438',  // dark crimson — rapid burst
};

// ── Particle Colors per Flavor ───────────────────────────────
const PARTICLE_COLORS = {
  classic: '#9898AA',
  cheese:  '#CC9955',
  messy:   '#44CC88',
  mirror:  '#4488FF',
  surge:   '#FF2244',
};

// Penalty delivery delay (ms) — payload sits in queue this long
const PENALTY_DELAY_MS = 1500;

// SRS Wall-kick data
const KICKS_JLSTZ = {
  '0->1': [[ 0,0],[-1,0],[-1, 1],[0,-2],[-1,-2]],
  '1->0': [[ 0,0],[ 1,0],[ 1,-1],[0, 2],[ 1, 2]],
  '1->2': [[ 0,0],[ 1,0],[ 1,-1],[0, 2],[ 1, 2]],
  '2->1': [[ 0,0],[-1,0],[-1, 1],[0,-2],[-1,-2]],
  '2->3': [[ 0,0],[ 1,0],[ 1, 1],[0,-2],[ 1,-2]],
  '3->2': [[ 0,0],[-1,0],[-1,-1],[0, 2],[-1, 2]],
  '3->0': [[ 0,0],[-1,0],[-1,-1],[0, 2],[-1, 2]],
  '0->3': [[ 0,0],[ 1,0],[ 1, 1],[0,-2],[ 1,-2]],
};
const KICKS_I = {
  '0->1': [[ 0,0],[-2,0],[ 1,0],[-2,-1],[ 1, 2]],
  '1->0': [[ 0,0],[ 2,0],[-1,0],[ 2, 1],[-1,-2]],
  '1->2': [[ 0,0],[-1,0],[ 2,0],[-1, 2],[ 2,-1]],
  '2->1': [[ 0,0],[ 1,0],[-2,0],[ 1,-2],[-2, 1]],
  '2->3': [[ 0,0],[ 2,0],[-1,0],[ 2, 1],[-1,-2]],
  '3->2': [[ 0,0],[-2,0],[ 1,0],[-2,-1],[ 1, 2]],
  '3->0': [[ 0,0],[ 1,0],[-2,0],[ 1,-2],[-2, 1]],
  '0->3': [[ 0,0],[-1,0],[ 2,0],[-1, 2],[ 2,-1]],
};

// ──────────────────────────────────────────────────────────────
// DOM REFERENCES
// ──────────────────────────────────────────────────────────────
const DOM = {
  bgCanvas:       document.getElementById('bg-canvas'),
  particleCanvas: document.getElementById('particle-canvas'),
  playerBoard:    document.getElementById('player-board'),
  aiBoard:        document.getElementById('ai-board'),
  playerHold:     document.getElementById('player-hold-canvas'),
  playerNext:     document.getElementById('player-next-canvas'),
  aiHold:         document.getElementById('ai-hold-canvas'),
  aiNext:         document.getElementById('ai-next-canvas'),

  playerBoardWrapper: document.getElementById('player-board-wrapper'),
  aiBoardWrapper:     document.getElementById('ai-board-wrapper'),
  playerFxOverlay:    document.getElementById('player-fx-overlay'),
  aiFxOverlay:        document.getElementById('ai-fx-overlay'),
  playerFlash:        document.getElementById('player-flash'),
  aiFlash:            document.getElementById('ai-flash'),

  playerScore:      document.getElementById('player-score'),
  playerLevel:      document.getElementById('player-level'),
  playerLines:      document.getElementById('player-lines'),
  playerComboCount: document.getElementById('player-combo-count'),
  aiScore:          document.getElementById('ai-score'),
  aiLevel:          document.getElementById('ai-level'),
  aiLines:          document.getElementById('ai-lines'),
  aiComboCount:     document.getElementById('ai-combo-count'),

  playerHealthFill: document.getElementById('player-health-fill'),
  aiHealthFill:     document.getElementById('ai-health-fill'),

  playerComboToast:      document.getElementById('player-combo-toast'),
  playerComboToastCount: document.getElementById('player-combo-toast-count'),
  aiComboToast:          document.getElementById('ai-combo-toast'),
  aiComboToastCount:     document.getElementById('ai-combo-toast-count'),

  playerIncoming:      document.getElementById('player-incoming'),
  playerIncomingCount: document.getElementById('player-incoming-count'),
  aiIncoming:          document.getElementById('ai-incoming'),
  aiIncomingCount:     document.getElementById('ai-incoming-count'),

  battleZone:          document.getElementById('battle-zone'),
  battleStatusBanner:  document.getElementById('battle-status-banner'),
  battleStatusText:    document.getElementById('battle-status-text'),
  penaltyTransferLane: document.getElementById('penalty-transfer-lane'),
  playerAttackViz:     document.getElementById('player-attack-viz'),
  aiAttackViz:         document.getElementById('ai-attack-viz'),
  transferBolt:        document.querySelector('.transfer-bolt'),
  vsEmblem:            document.querySelector('.vs-emblem'),

  penaltyPicker:      document.getElementById('penalty-picker'),
  penaltyBtns:        document.querySelectorAll('.penalty-btn[data-penalty]'),
  difficultySelector: document.getElementById('difficulty-selector'),
  diffBtns:           document.querySelectorAll('.diff-btn[data-difficulty]'),
  diffBtnsStart:      document.querySelectorAll('.diff-btn-group--start .diff-btn'),

  tbagBubble: document.getElementById('tbag-bubble'),
  tbagText:   document.getElementById('tbag-text'),

  startScreen:     document.getElementById('start-screen'),
  resultScreen:    document.getElementById('result-screen'),
  pauseScreen:     document.getElementById('pause-screen'),
  countdownScreen: document.getElementById('countdown-screen'),
  countdownNumber: document.getElementById('countdown-number'),

  startBtn:   document.getElementById('start-btn'),
  rematchBtn: document.getElementById('rematch-btn'),
  menuBtn:    document.getElementById('menu-btn'),
  resumeBtn:  document.getElementById('resume-btn'),
  quitBtn:    document.getElementById('quit-btn'),

  resultText:  document.getElementById('result-text'),
  resultSub:   document.getElementById('result-sub'),
  resultStats: document.getElementById('result-stats'),
};

const CTX = {
  bg:       DOM.bgCanvas.getContext('2d'),
  particle: DOM.particleCanvas.getContext('2d'),
  player:   DOM.playerBoard.getContext('2d'),
  ai:       DOM.aiBoard.getContext('2d'),
  pHold:    DOM.playerHold.getContext('2d'),
  pNext:    DOM.playerNext.getContext('2d'),
  aHold:    DOM.aiHold.getContext('2d'),
  aNext:    DOM.aiNext.getContext('2d'),
};


// ──────────────────────────────────────────────────────────────
// GAME STATE
// ──────────────────────────────────────────────────────────────

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function createPlayerState() {
  return {
    board:        createBoard(),
    current:      null,
    held:         null,
    holdUsed:     false,
    bag:          [],
    nextQueue:    [],
    score:        0,
    level:        1,
    lines:        0,
    combo:        -1,
    maxCombo:     0,
    backToBack:   false,
    health:       100,
    pendingGarbage: 0,
    activeFx:     null,
    fxTimer:      0,
    isAlive:      true,
    gravityAcc:   0,
    lockDelay:    0,
    lockDelayMax: 500,
    onGround:     false,
    startTime:    0,
  };
}

let STATE = {
  phase:        'start',
  player:       createPlayerState(),
  ai:           createPlayerState(),
  difficulty:   2,
  penaltyType:  'classic',   // active penalty flavor (captured at queue time)
  tick:         0,
  lastTime:     0,
  winner:       null,
  bgStars:      [],
  bgFloaters:   [],
  gameStartTime: 0,
};


// ──────────────────────────────────────────────────────────────
// 7-BAG / PIECE GENERATION
// ──────────────────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function refillBag(ps) {
  if (ps.bag.length === 0) {
    ps.bag = shuffle([...PIECE_KEYS]);
  }
  while (ps.nextQueue.length < 3 && ps.bag.length > 0) {
    ps.nextQueue.push(ps.bag.shift());
    if (ps.bag.length === 0) ps.bag = shuffle([...PIECE_KEYS]);
  }
}

function makeCurrentPiece(type) {
  const def = TETROMINOES[type];
  const shape = def.shape.map(r => [...r]);
  const spawnX = Math.floor((COLS - shape[0].length) / 2);
  const spawnY = type === 'I' ? -1 : 0;
  return {
    type, shape, rotState: 0,
    x: spawnX, y: spawnY,
    color: def.color, colorDark: def.colorDark, colorLight: def.colorLight,
  };
}

function spawnPiece(ps) {
  refillBag(ps);
  const type = ps.nextQueue.shift();
  refillBag(ps);
  ps.current = makeCurrentPiece(type);
  ps.holdUsed = false;
  ps.onGround = false;
  ps.lockDelay = 0;
  ps.gravityAcc = 0;

  if (collides(ps.board, ps.current.shape, ps.current.x, ps.current.y)) {
    ps.isAlive = false;
  }
}


// ──────────────────────────────────────────────────────────────
// COLLISION
// ──────────────────────────────────────────────────────────────

function collides(board, shape, px, py) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const boardRow = py + r;
      const boardCol = px + c;
      if (boardCol < 0 || boardCol >= COLS) return true;
      if (boardRow >= ROWS) return true;
      if (boardRow >= 0 && board[boardRow][boardCol]) return true;
    }
  }
  return false;
}


// ──────────────────────────────────────────────────────────────
// ROTATION (SRS)
// ──────────────────────────────────────────────────────────────

function rotateShapeCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const out = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out[c][rows - 1 - r] = shape[r][c];
  return out;
}

function rotateShapeCCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const out = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out[cols - 1 - c][r] = shape[r][c];
  return out;
}

function tryRotate(ps, dir) {
  if (!ps.current) return;
  const cur = ps.current;
  const newShape = dir === 1 ? rotateShapeCW(cur.shape) : rotateShapeCCW(cur.shape);
  const oldRot = cur.rotState;
  const newRot = ((oldRot + dir) + 4) % 4;
  const kickTable = cur.type === 'I' ? KICKS_I : KICKS_JLSTZ;
  const key = `${oldRot}->${newRot}`;
  const kicks = kickTable[key] || [[0,0]];

  for (const [dx, dy] of kicks) {
    const nx = cur.x + dx;
    const ny = cur.y - dy;
    if (!collides(ps.board, newShape, nx, ny)) {
      cur.shape    = newShape;
      cur.rotState = newRot;
      cur.x = nx;
      cur.y = ny;
      ps.lockDelay = 0;
      return true;
    }
  }
  return false;
}


// ──────────────────────────────────────────────────────────────
// MOVEMENT
// ──────────────────────────────────────────────────────────────

function moveHorizontal(ps, dir) {
  if (!ps.current || !ps.isAlive) return false;
  const actualDir = ps.activeFx === 'mirror' ? -dir : dir;
  if (!collides(ps.board, ps.current.shape, ps.current.x + actualDir, ps.current.y)) {
    ps.current.x += actualDir;
    ps.lockDelay = 0;
    return true;
  }
  return false;
}

function moveHorizontalRaw(ps, dir) {
  if (!ps.current || !ps.isAlive) return false;
  if (!collides(ps.board, ps.current.shape, ps.current.x + dir, ps.current.y)) {
    ps.current.x += dir;
    ps.lockDelay = 0;
    return true;
  }
  return false;
}

function softDrop(ps) {
  if (!ps.current || !ps.isAlive) return false;
  if (!collides(ps.board, ps.current.shape, ps.current.x, ps.current.y + 1)) {
    ps.current.y++;
    ps.score += 1;
    ps.gravityAcc = 0;
    return true;
  }
  return false;
}

function getGhostY(ps) {
  if (!ps.current) return 0;
  let gy = ps.current.y;
  while (!collides(ps.board, ps.current.shape, ps.current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop(ps, targetPs) {
  if (!ps.current || !ps.isAlive) return;
  const startY = ps.current.y;
  const ghostY = getGhostY(ps);
  ps.score += (ghostY - startY) * 2;
  ps.current.y = ghostY;
  lockPiece(ps, targetPs);
}


// ──────────────────────────────────────────────────────────────
// T-SPIN DETECTION  (3-corner rule)
// ──────────────────────────────────────────────────────────────

function detectTSpin(ps) {
  if (!ps.current || ps.current.type !== 'T') return false;
  const { x, y } = ps.current;
  const corners = [
    [y,     x    ],
    [y,     x + 2],
    [y + 2, x    ],
    [y + 2, x + 2],
  ];
  let occupied = 0;
  for (const [r, c] of corners) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS || ps.board[r][c]) occupied++;
  }
  return occupied >= 3;
}


// ──────────────────────────────────────────────────────────────
// LOCKING & LINE CLEARING
// ──────────────────────────────────────────────────────────────

function stampPiece(ps) {
  const { shape, x, y, color } = ps.current;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const br = y + r, bc = x + c;
      if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) {
        ps.board[br][bc] = color;
      }
    }
  }
}

function lockPiece(ps, targetPs) {
  if (!ps.current) return;

  const isTSpin = detectTSpin(ps);
  stampPiece(ps);

  const clearedRows = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    if (ps.board[r].every(c => c !== 0)) clearedRows.push(r);
  }

  if (clearedRows.length > 0) {
    // Capture cell colors BEFORE rows are spliced (grain-4: needed for burst particles)
    const rowColors = clearedRows.map(r => [...ps.board[r]]);
    bus.emit('lineClear', { side: ps === STATE.player ? 'player' : 'ai', rows: clearedRows, rowColors });
  }

  clearedRows.sort((a, b) => b - a);
  for (const r of clearedRows) ps.board.splice(r, 1);
  for (let i = 0; i < clearedRows.length; i++) ps.board.unshift(new Array(COLS).fill(0));

  const n = clearedRows.length;
  const side = ps === STATE.player ? 'player' : 'ai';

  if (n > 0) {
    ps.combo++;
    if (ps.combo > ps.maxCombo) ps.maxCombo = ps.combo;

    const isSpecial = n === 4 || isTSpin;
    const b2bMulti  = (isSpecial && ps.backToBack) ? B2B_BONUS : 1.0;
    ps.backToBack   = isSpecial;

    const base       = SCORE_TABLE[n] || 0;
    const comboBonus = ps.combo * COMBO_BONUS;
    ps.score += Math.floor((base + comboBonus) * ps.level * b2bMulti);
    ps.lines += n;

    const newLevel = Math.floor(ps.lines / 10) + 1;
    if (newLevel > ps.level) {
      ps.level = newLevel;
      bus.emit('levelUp', { side, level: newLevel });
    }

    updateStatsUI(side);
    if (ps.combo >= 1) showComboToast(side, ps.combo);

    flashBoard(side);
    thudBoard(side);

    if (targetPs) {
      const garbageCount = calcGarbageSent(n, ps.combo, isTSpin, b2bMulti > 1);
      if (garbageCount > 0) queuePenaltyAttack(side, garbageCount);
    }

    bus.emit('combo', { side, combo: ps.combo, lines: n });
  } else {
    ps.combo      = -1;
    ps.backToBack = false;
    thudBoard(side);
  }

  // Grain-4: emit pieceLocked for VFX lock-flash (side already defined above)
  bus.emit('pieceLocked', { side, piece: ps.current });

  ps.current = null;
  spawnPiece(ps);

  if (!ps.isAlive) {
    const winner = ps === STATE.player ? 'ai' : 'player';
    endGame(winner);
  }
}

function calcGarbageSent(lines, combo, isTSpin, isB2B) {
  let base = GARBAGE_TABLE[lines] || 0;
  if (isTSpin) base = Math.max(base, lines * 2);  // T-spin double → 4
  if (isB2B)   base += 1;
  const comboGarbage = COMBO_GARBAGE[Math.min(combo, COMBO_GARBAGE.length - 1)] || 0;
  return base + comboGarbage;
}


// ──────────────────────────────────────────────────────────────
// PENALTY FLAVOR — GARBAGE LINE GENERATORS
// Each function adds `count` rows with a distinct visual identity
// ──────────────────────────────────────────────────────────────

// Classic: single fixed gap column, solid slate-gray
function addGarbageLinesClassic(ps, count) {
  const hole = Math.floor(Math.random() * COLS);
  const col  = GARBAGE_COLORS.classic;
  for (let i = 0; i < count; i++) {
    ps.board.shift();
    const row = new Array(COLS).fill(col);
    row[hole] = 0;
    ps.board.push(row);
  }
}

// Cheese: 2–3 random holes per row, dirty brown
function addGarbageLinesCheese(ps, count) {
  const col = GARBAGE_COLORS.cheese;
  for (let i = 0; i < count; i++) {
    ps.board.shift();
    const row = new Array(COLS).fill(col);
    const gapCount = 2 + Math.floor(Math.random() * 2); // 2 or 3 gaps
    const positions = shuffle([...Array(COLS).keys()]).slice(0, gapCount);
    positions.forEach(p => { row[p] = 0; });
    ps.board.push(row);
  }
}

// Messy: gap drifts ±1 per row, forest green
function addGarbageLinesMessy(ps, count) {
  let hole = Math.floor(Math.random() * COLS);
  const col = GARBAGE_COLORS.messy;
  for (let i = 0; i < count; i++) {
    ps.board.shift();
    const row = new Array(COLS).fill(col);
    row[hole] = 0;
    ps.board.push(row);
    // Drift gap randomly by -1, 0, or +1
    const drift = Math.floor(Math.random() * 3) - 1;
    hole = Math.max(0, Math.min(COLS - 1, hole + drift));
  }
}

// Mirror: gap column = mirrored position of player's piece (reflected across center)
function addGarbageLinesMirror(ps, count, playerCol) {
  const hole = Math.max(0, Math.min(COLS - 1, (COLS - 1) - playerCol));
  const col  = GARBAGE_COLORS.mirror;
  for (let i = 0; i < count; i++) {
    ps.board.shift();
    const row = new Array(COLS).fill(col);
    row[hole] = 0;
    ps.board.push(row);
  }
}

// Surge: lines arrive in rapid bursts (90ms apart) after a brief wind-up
// Visual: dark crimson, each line with a random gap
function addGarbageLinesSurge(ps, count, toSide) {
  let delivered = 0;
  function burstNext() {
    if (delivered >= count || !ps.isAlive || STATE.phase !== 'playing') return;
    ps.board.shift();
    const row = new Array(COLS).fill(GARBAGE_COLORS.surge);
    row[Math.floor(Math.random() * COLS)] = 0;
    ps.board.push(row);
    delivered++;
    if (delivered < count) {
      setTimeout(burstNext, 90);
    } else {
      shakeBoard(toSide);
      flashBoard(toSide);
    }
  }
  burstNext();
}


// ──────────────────────────────────────────────────────────────
// HOLD
// ──────────────────────────────────────────────────────────────

function holdPiece(ps) {
  if (!ps.current || ps.holdUsed || !ps.isAlive) return;
  ps.holdUsed = true;
  const currentType = ps.current.type;
  if (ps.held) {
    ps.current = makeCurrentPiece(ps.held);
  } else {
    ps.current = null;
    spawnPiece(ps);
  }
  ps.held = currentType;
  ps.gravityAcc = 0;
  ps.lockDelay  = 0;
}


// ──────────────────────────────────────────────────────────────
// LEVEL / GRAVITY
// ──────────────────────────────────────────────────────────────

function gravityIntervalForLevel(level) {
  return Math.max(50, Math.floor(1000 * Math.pow(0.8 - (level - 1) * 0.007, level - 1)));
}


// ──────────────────────────────────────────────────────────────
// HEALTH SYSTEM
// ──────────────────────────────────────────────────────────────

function applyDamage(ps, amount) {
  ps.health = Math.max(0, ps.health - amount);
}

function updateHealthBar(side) {
  const ps   = side === 'player' ? STATE.player : STATE.ai;
  const fill = side === 'player' ? DOM.playerHealthFill : DOM.aiHealthFill;
  fill.style.width = ps.health + '%';
  if (ps.health <= 25) {
    fill.style.animation = 'health-danger 0.6s ease-in-out infinite';
    // Danger border on board
    const wrapper = side === 'player' ? DOM.playerBoardWrapper : DOM.aiBoardWrapper;
    wrapper.classList.add('is-danger');
  } else {
    fill.style.animation = '';
    const wrapper = side === 'player' ? DOM.playerBoardWrapper : DOM.aiBoardWrapper;
    wrapper.classList.remove('is-danger');
  }
}


// ──────────────────────────────────────────────────────────────
// RENDERING — MAIN BOARD
// ──────────────────────────────────────────────────────────────

function drawCell(ctx, x, y, color, size, alpha = 1.0, isGhost = false) {
  if (isGhost) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size - 1, size - 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, size - 2.5, size - 2.5);
    ctx.globalAlpha = alpha;
    return;
  }

  ctx.globalAlpha = alpha;

  // Base fill
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size - 1, size - 1);

  // Top-left shine
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.fillRect(x + 2, y + 2, size - 6, 4);
  ctx.fillRect(x + 2, y + 2, 4, size - 6);

  // Bottom-right shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 2, y + size - 5, size - 4, 3);
  ctx.fillRect(x + size - 5, y + 2, 3, size - 4);

  // Inner glow overlay
  const grad = ctx.createLinearGradient(x, y, x + size * 0.6, y + size * 0.6);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, size - 1, size - 1);

  ctx.globalAlpha = 1.0;
}

// Draws a garbage row with a subtle striped/grungy overlay
function drawGarbageCell(ctx, x, y, color, size) {
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size - 1, size - 1);

  // Diagonal hash lines for "dirty" look
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth = 1;
  for (let d = 0; d < size * 2; d += 5) {
    ctx.beginPath();
    ctx.moveTo(x + Math.max(0, d - size + 1), y + Math.min(size - 1, d));
    ctx.lineTo(x + Math.min(size - 1, d), y + Math.max(0, d - size + 1));
    ctx.stroke();
  }

  // Thin top shine
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x + 1, y + 1, size - 3, 3);
}

const GARBAGE_COLOR_SET = new Set(Object.values(GARBAGE_COLORS));

function renderBoard(ctx, ps) {
  ctx.clearRect(0, 0, COLS * CELL, ROWS * CELL);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = ps.board[r][c];
      if (!cell) continue;
      // Render garbage rows differently
      if (GARBAGE_COLOR_SET.has(cell)) {
        drawGarbageCell(ctx, c * CELL, r * CELL, cell, CELL);
      } else {
        drawCell(ctx, c * CELL, r * CELL, cell, CELL);
      }
    }
  }

  if (!ps.current) return;

  // Ghost piece
  const ghostY = getGhostY(ps);
  const { shape, x, color } = ps.current;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const br = ghostY + r;
      if (br < 0 || br >= ROWS) continue;
      drawCell(ctx, (x + c) * CELL, br * CELL, color, CELL, 1.0, true);
    }
  }

  // Current piece
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const br = ps.current.y + r;
      if (br < 0) continue;
      drawCell(ctx, (x + c) * CELL, br * CELL, color, CELL);
    }
  }
}

function renderMiniPiece(ctx, type, canvasW, canvasH) {
  ctx.clearRect(0, 0, canvasW, canvasH);
  if (!type) return;
  const def = TETROMINOES[type];
  const shape = def.shape;
  const rows = shape.length, cols = shape[0].length;
  const offX = Math.floor((canvasW - cols * MINI_CELL) / 2);
  const offY = Math.floor((canvasH - rows * MINI_CELL) / 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!shape[r][c]) continue;
      drawCell(ctx, offX + c * MINI_CELL, offY + r * MINI_CELL, def.color, MINI_CELL);
    }
  }
}


// ──────────────────────────────────────────────────────────────
// BACKGROUND STARS / FLOATERS
// ──────────────────────────────────────────────────────────────

function initBgStars() {
  DOM.bgCanvas.width  = window.innerWidth;
  DOM.bgCanvas.height = window.innerHeight;
  STATE.bgStars    = [];
  STATE.bgFloaters = [];
  const w = DOM.bgCanvas.width, h = DOM.bgCanvas.height;

  for (let i = 0; i < 140; i++) {
    STATE.bgStars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.8 + 0.3,
      speed: Math.random() * 0.12 + 0.02,
      opacity: Math.random() * 0.6 + 0.2,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.03 + 0.01,
      hue: Math.random() < 0.15 ? (Math.random() < 0.5 ? '#a0c8ff' : '#ffd0a0') : '#ffffff',
    });
  }

  for (let i = 0; i < 6; i++) {
    STATE.bgFloaters.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 80 + 40,
      speed: Math.random() * 0.04 + 0.01,
      dir: Math.random() * Math.PI * 2,
      hue: ['rgba(155,79,232,0.04)','rgba(91,155,245,0.04)','rgba(255,194,52,0.03)'][i % 3],
    });
  }
}

function animateBgStars(timestamp) {
  const ctx = CTX.bg;
  const w = DOM.bgCanvas.width, h = DOM.bgCanvas.height;
  ctx.clearRect(0, 0, w, h);

  for (const f of STATE.bgFloaters) {
    f.x += Math.cos(f.dir) * f.speed;
    f.y += Math.sin(f.dir) * f.speed;
    if (f.x < -f.r) f.x = w + f.r;
    if (f.x > w + f.r) f.x = -f.r;
    if (f.y < -f.r) f.y = h + f.r;
    if (f.y > h + f.r) f.y = -f.r;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    g.addColorStop(0, f.hue);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const s of STATE.bgStars) {
    s.twinklePhase += s.twinkleSpeed;
    s.y += s.speed;
    if (s.y > h + 4) { s.y = -4; s.x = Math.random() * w; }
    const alpha = s.opacity * (0.65 + 0.35 * Math.sin(s.twinklePhase));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = s.hue;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;
}


// ──────────────────────────────────────────────────────────────
// PENALTY PARTICLES — gather → launch animation
// ──────────────────────────────────────────────────────────────

function spawnPenaltyParticles(fromSide, lineCount, flavor) {
  const color = PARTICLE_COLORS[flavor] || '#888899';
  const count = Math.min(lineCount * 4, 16);

  const fromWrapper = fromSide === 'player' ? DOM.playerBoardWrapper : DOM.aiBoardWrapper;
  const toWrapper   = fromSide === 'player' ? DOM.aiBoardWrapper     : DOM.playerBoardWrapper;

  const fromRect = fromWrapper.getBoundingClientRect();
  const toRect   = toWrapper.getBoundingClientRect();
  const boltRect = DOM.transferBolt.getBoundingClientRect();
  const gatherX  = boltRect.left + boltRect.width  / 2;
  const gatherY  = boltRect.top  + boltRect.height / 2;

  for (let i = 0; i < count; i++) {
    const startX = fromRect.left + Math.random() * fromRect.width;
    const startY = fromRect.top  + Math.random() * fromRect.height;

    const px = document.createElement('div');
    px.className = `penalty-particle penalty-particle--${flavor}`;
    px.style.cssText = `
      left: ${startX}px;
      top:  ${startY}px;
      background: ${color};
      --tx: ${gatherX - startX}px;
      --ty: ${gatherY - startY}px;
      --rot: ${Math.random() * 360}deg;
    `;
    document.body.appendChild(px);
    px.classList.add('phase-gather');

    // Wind-up time: longer for Surge
    const gatherMs = flavor === 'surge' ? 1050 : 850;
    const launchDelay = gatherMs + Math.random() * 150;

    setTimeout(() => {
      if (!document.body.contains(px)) return;
      const landX = toRect.left + Math.random() * toRect.width;
      const landY = toRect.top  + Math.random() * toRect.height;
      px.style.setProperty('--lx', `${gatherX - startX + (landX - gatherX) * 0.4}px`);
      px.style.setProperty('--ly', `${gatherY - startY + (landY - gatherY) * 0.4}px`);
      px.style.setProperty('--fx', `${landX - startX}px`);
      px.style.setProperty('--fy', `${landY - startY}px`);
      px.classList.remove('phase-gather');
      px.classList.add('phase-launch');
      px.addEventListener('animationend', () => px.remove(), { once: true });
    }, launchDelay);

    setTimeout(() => { if (document.body.contains(px)) px.remove(); }, launchDelay + 800);
  }

  // Flash bolt
  DOM.transferBolt.classList.add('is-sending');
  setTimeout(() => DOM.transferBolt.classList.remove('is-sending'), 500);
}

function updateAttackQueueViz(side, count, flavor) {
  const el = side === 'player' ? DOM.playerAttackViz : DOM.aiAttackViz;
  el.innerHTML = '';
  for (let i = 0; i < Math.min(count, 12); i++) {
    const b = document.createElement('div');
    b.className = `atk-block atk-block--${flavor}`;
    el.appendChild(b);
  }
}

function clearAttackQueueViz(side) {
  const el = side === 'player' ? DOM.playerAttackViz : DOM.aiAttackViz;
  el.innerHTML = '';
}


// ──────────────────────────────────────────────────────────────
// PENALTY SYSTEM — Payload Queue
// Flavor is captured at queue time; switching mid-game only affects
// the *next* queued payload, never retroactively changes a queued one.
// ──────────────────────────────────────────────────────────────

function queuePenaltyAttack(fromSide, lineCount) {
  const flavor = STATE.penaltyType;  // capture flavor NOW (not at delivery)
  const toSide = fromSide === 'player' ? 'ai' : 'player';

  // Visual feedback
  updateAttackQueueViz(fromSide, lineCount, flavor);
  spawnPenaltyParticles(fromSide, lineCount, flavor);

  // Incoming warning on opponent's side
  const incomingEl    = toSide === 'player' ? DOM.playerIncoming    : DOM.aiIncoming;
  const incomingCount = toSide === 'player' ? DOM.playerIncomingCount : DOM.aiIncomingCount;
  incomingCount.textContent = lineCount;
  incomingEl.classList.add('is-visible');

  bus.emit('penalty:queued', { fromSide, toSide, count: lineCount, flavor, delayMs: PENALTY_DELAY_MS });

  // Surge: show wind-up warning animation on target board
  if (flavor === 'surge') {
    const targetWrapper = toSide === 'player' ? DOM.playerBoardWrapper : DOM.aiBoardWrapper;
    setTimeout(() => {
      targetWrapper.classList.add('is-surge-incoming');
      targetWrapper.addEventListener('animationend', () =>
        targetWrapper.classList.remove('is-surge-incoming'), { once: true });
    }, 700);
  }

  // Delayed delivery (1.5 s configurable)
  setTimeout(() => {
    if (STATE.phase !== 'playing') return;
    deliverPenalty(toSide, lineCount, flavor);
    clearAttackQueueViz(fromSide);
    incomingEl.classList.remove('is-visible');
  }, PENALTY_DELAY_MS);
}

function deliverPenalty(toSide, lineCount, flavor) {
  const ps = toSide === 'player' ? STATE.player : STATE.ai;
  if (!ps.isAlive || STATE.phase !== 'playing') return;

  // Determine mirror column from player's current piece
  const playerCol = STATE.player.current
    ? STATE.player.current.x + Math.floor(STATE.player.current.shape[0].length / 2)
    : 4;

  switch (flavor) {
    case 'classic': addGarbageLinesClassic(ps, lineCount); shakeBoard(toSide); break;
    case 'cheese':  addGarbageLinesCheese(ps, lineCount);  shakeBoard(toSide); break;
    case 'messy':   addGarbageLinesMessy(ps, lineCount);   shakeBoard(toSide); break;
    case 'mirror':  addGarbageLinesMirror(ps, lineCount, playerCol); shakeBoard(toSide); break;
    case 'surge':   addGarbageLinesSurge(ps, lineCount, toSide); break; // shakes internally
    default:        addGarbageLinesClassic(ps, lineCount); shakeBoard(toSide);
  }

  // Health damage scales with line count
  applyDamage(ps, lineCount * 7);
  updateHealthBar(toSide);
  bus.emit('garbageReceived', { side: toSide, count: lineCount, flavor });
}

function applyFxOverlay(side, fx) {
  const el = side === 'player' ? DOM.playerFxOverlay : DOM.aiFxOverlay;
  el.className = 'board-fx-overlay';
  if (fx) el.classList.add(`fx-${fx}`);
}


// ──────────────────────────────────────────────────────────────
// UI UPDATES
// ──────────────────────────────────────────────────────────────

function updateStatsUI(side) {
  const ps = side === 'player' ? STATE.player : STATE.ai;
  const scoreEl = side === 'player' ? DOM.playerScore : DOM.aiScore;
  const levelEl = side === 'player' ? DOM.playerLevel : DOM.aiLevel;
  const linesEl = side === 'player' ? DOM.playerLines : DOM.aiLines;
  const comboEl = side === 'player' ? DOM.playerComboCount : DOM.aiComboCount;

  scoreEl.textContent = ps.score;
  levelEl.textContent = ps.level;
  linesEl.textContent = ps.lines;
  comboEl.textContent = Math.max(0, ps.combo);

  scoreEl.classList.remove('is-popping');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('is-popping');
  scoreEl.addEventListener('animationend', () => scoreEl.classList.remove('is-popping'), { once: true });

  updateHealthBar(side);
}

let _comboHideTimers = { player: null, ai: null };

function showComboToast(side, count) {
  const toast   = side === 'player' ? DOM.playerComboToast     : DOM.aiComboToast;
  const countEl = side === 'player' ? DOM.playerComboToastCount : DOM.aiComboToastCount;
  countEl.textContent = count;
  toast.dataset.hidden = 'false';
  if (_comboHideTimers[side]) clearTimeout(_comboHideTimers[side]);
  _comboHideTimers[side] = setTimeout(() => {
    toast.dataset.hidden = 'true';
    toast.style.animation = 'none';
    void toast.offsetWidth;
    toast.style.animation = '';
  }, 1500);
}

let _tbagTimer    = null;
let _tbagCooldown = false;

function showTbag(phrase) {
  if (_tbagCooldown) return;
  _tbagCooldown = true;
  DOM.tbagText.textContent = phrase;
  DOM.tbagBubble.dataset.hidden = 'false';
  if (_tbagTimer) clearTimeout(_tbagTimer);
  _tbagTimer = setTimeout(() => {
    DOM.tbagBubble.dataset.hidden = 'true';
    DOM.tbagBubble.style.animation = 'none';
    void DOM.tbagBubble.offsetWidth;
    DOM.tbagBubble.style.animation = '';
    setTimeout(() => { _tbagCooldown = false; }, 1200);
  }, 2500);
}

function pickPhrase(trigger) {
  const list = TBAG_PHRASES[trigger] || TBAG_PHRASES.combo;
  return list[Math.floor(Math.random() * list.length)];
}

function setBattleStatus(text) {
  DOM.battleStatusText.textContent = text;
}

function flashBoard(side) {
  const el = side === 'player' ? DOM.playerFlash : DOM.aiFlash;
  el.classList.remove('is-flashing');
  void el.offsetWidth;
  el.classList.add('is-flashing');
  el.addEventListener('animationend', () => el.classList.remove('is-flashing'), { once: true });
}

function thudBoard(side) {
  const el = side === 'player' ? DOM.playerBoardWrapper : DOM.aiBoardWrapper;
  el.classList.remove('is-thud');
  void el.offsetWidth;
  el.classList.add('is-thud');
  el.addEventListener('animationend', () => el.classList.remove('is-thud'), { once: true });
}

function shakeBoard(side) {
  const el = side === 'player' ? DOM.playerBoardWrapper : DOM.aiBoardWrapper;
  el.classList.remove('is-shaking');
  void el.offsetWidth;
  el.classList.add('is-shaking');
  el.addEventListener('animationend', () => el.classList.remove('is-shaking'), { once: true });
}

function showScreen(name) {
  const screens = ['start', 'result', 'pause', 'countdown'];
  screens.forEach(s => {
    const el = DOM[s + 'Screen'];
    if (el) el.dataset.hidden = (s === name) ? 'false' : 'true';
  });
}

function showGame() {
  ['start','result','pause','countdown'].forEach(s => {
    const el = DOM[s + 'Screen'];
    if (el) el.dataset.hidden = 'true';
  });
}


// ──────────────────────────────────────────────────────────────
// COUNTDOWN
// ──────────────────────────────────────────────────────────────

function runCountdown(onDone) {
  const steps = ['3', '2', '1', 'GO!'];
  let i = 0;
  showScreen('countdown');

  function tick() {
    if (i >= steps.length) { showGame(); onDone(); return; }
    DOM.countdownNumber.textContent = steps[i];
    DOM.countdownNumber.style.animation = 'none';
    void DOM.countdownNumber.offsetWidth;
    DOM.countdownNumber.style.animation = 'countdown-pop 0.9s var(--te-spring) both';
    i++;
    setTimeout(tick, 900);
  }
  tick();
}


// ──────────────────────────────────────────────────────────────
// GAME LOOP
// ──────────────────────────────────────────────────────────────

let _rAFid = null;

function gameLoop(timestamp) {
  if (STATE.phase !== 'playing') {
    _rAFid = requestAnimationFrame(gameLoop);
    return;
  }

  const dt = Math.min(timestamp - STATE.lastTime, 50);
  STATE.lastTime = timestamp;
  STATE.tick++;

  const player = STATE.player;
  const ai     = STATE.ai;

  // ── Player gravity ──
  if (player.isAlive && player.current) {
    const gravMs = gravityIntervalForLevel(player.level);

    player.gravityAcc += dt;
    if (player.gravityAcc >= gravMs) {
      player.gravityAcc = 0;
      const moved = softDrop(player);
      if (!moved) {
        player.onGround = true;
        player.lockDelay += dt + gravMs;
        if (player.lockDelay >= player.lockDelayMax) lockPiece(player, ai);
      } else {
        player.onGround = false;
        player.lockDelay = 0;
      }
    } else if (player.onGround) {
      player.lockDelay += dt;
      if (player.lockDelay >= player.lockDelayMax) lockPiece(player, ai);
    }
  }

  // ── AI gravity ──
  if (ai.isAlive && ai.current) {
    const aiGravMs = gravityIntervalForLevel(ai.level);

    ai.gravityAcc += dt;
    if (ai.gravityAcc >= aiGravMs) {
      ai.gravityAcc = 0;
      const moved = softDrop(ai);
      if (!moved) {
        ai.onGround = true;
        ai.lockDelay += dt + aiGravMs;
        if (ai.lockDelay >= ai.lockDelayMax) {
          lockPiece(ai, player);
          if (STATE.phase === 'playing' && ai.isAlive) scheduleAiMove();
        }
      } else {
        ai.onGround = false;
        ai.lockDelay = 0;
      }
    } else if (ai.onGround) {
      ai.lockDelay += dt;
      if (ai.lockDelay >= ai.lockDelayMax) {
        lockPiece(ai, player);
        if (STATE.phase === 'playing' && ai.isAlive) scheduleAiMove();
      }
    }
  }

  // ── FX timers ──
  for (const [side, ps] of [['player', player], ['ai', ai]]) {
    if (ps.activeFx && ps.fxTimer > 0) {
      ps.fxTimer -= dt;
      if (ps.fxTimer <= 0) {
        ps.activeFx = null;
        ps.fxTimer  = 0;
        applyFxOverlay(side, null);
      }
    }
  }

  // ── Near-death tracking for AI (used by T-bag escape trigger) ──
  checkAiNearDeathStatus();

  // ── Render boards ──
  renderBoard(CTX.player, player);
  renderBoard(CTX.ai, ai);

  // ── Render mini pieces ──
  renderMiniPiece(CTX.pHold, player.held,             DOM.playerHold.width, DOM.playerHold.height);
  renderMiniPiece(CTX.pNext, player.nextQueue[0] || null, DOM.playerNext.width, DOM.playerNext.height);
  renderMiniPiece(CTX.aHold, ai.held,                 DOM.aiHold.width, DOM.aiHold.height);
  renderMiniPiece(CTX.aNext, ai.nextQueue[0] || null,    DOM.aiNext.width, DOM.aiNext.height);

  // ── Background ──
  animateBgStars(timestamp);

  _rAFid = requestAnimationFrame(gameLoop);
}

function startLoop() {
  if (_rAFid) cancelAnimationFrame(_rAFid);
  STATE.lastTime = performance.now();
  _rAFid = requestAnimationFrame(gameLoop);
}

function stopLoop() {
  if (_rAFid) { cancelAnimationFrame(_rAFid); _rAFid = null; }
}


// ──────────────────────────────────────────────────────────────
// AI ENGINE — Grain-3 Rewrite
// Weighted heuristic with configurable weight noise, T-spin
// preference (Demon), and mid-game difficulty ramping.
// ──────────────────────────────────────────────────────────────

let _aiScheduled = false;

// Mid-game difficulty ramp: smoothly increases AI performance
// as the player's score climbs, making the AI progressively faster / more accurate.
function getEffectiveAiParams() {
  const base  = STATE.difficulty;
  const diff  = AI_DIFFICULTY[base];
  const score = STATE.player.score;

  // No ramp for max difficulty (already optimal)
  if (base === 3) return diff;

  // Ramp factor: 0 at score=0, 1.0 at score=8000
  const t = Math.min(score / 8000, 1.0);

  // Interpolate toward the next tier's values (up to 55% of the gap)
  const next = AI_DIFFICULTY[Math.min(base + 1, 3)];
  return {
    ...diff,
    thinkDelayMs: Math.round(diff.thinkDelayMs - (diff.thinkDelayMs - next.thinkDelayMs) * t * 0.55),
    mistakeRate:  diff.mistakeRate  - (diff.mistakeRate  - next.mistakeRate)  * t * 0.50,
    weightNoise:  diff.weightNoise  - (diff.weightNoise  - next.weightNoise)  * t * 0.40,
  };
}

// Add Gaussian-ish noise to a weight value
function noisyWeight(base, noiseLevel) {
  return base * (1.0 + (Math.random() * 2 - 1) * noiseLevel);
}

// Evaluate a board state using noisy weighted heuristics
function evaluateBoardWeighted(board, w) {
  let aggHeight  = 0;
  let holes      = 0;
  let bumpiness  = 0;
  const colH = new Array(COLS).fill(0);

  for (let c = 0; c < COLS; c++) {
    let blockFound = false;
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] && !blockFound) {
        colH[c]    = ROWS - r;
        blockFound = true;
      }
      if (blockFound && !board[r][c]) holes++;
    }
    aggHeight += colH[c];
  }

  for (let c = 0; c < COLS - 1; c++) {
    bumpiness += Math.abs(colH[c] - colH[c + 1]);
  }

  return aggHeight * w.aggH + holes * w.holes + bumpiness * w.bump;
}

// Simulate piece placement on a cloned board, return evaluation data
function simulatePlacement(board, shape, color, px, py, detectTSpinFlag) {
  const sim = board.map(r => [...r]);

  // Stamp piece
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const br = py + r, bc = px + c;
      if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) sim[br][bc] = color;
    }
  }

  // Check T-spin (3-corner rule)
  let isTSpin = false;
  if (detectTSpinFlag) {
    const corners = [[py, px], [py, px + 2], [py + 2, px], [py + 2, px + 2]];
    let occ = 0;
    for (const [r, c] of corners) {
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS || sim[r][c]) occ++;
    }
    isTSpin = occ >= 3;
  }

  // Clear full rows
  let linesCleared = 0;
  for (let r = ROWS - 1; r >= 0; ) {
    if (sim[r].every(c => c !== 0)) {
      sim.splice(r, 1);
      sim.unshift(new Array(COLS).fill(0));
      linesCleared++;
    } else {
      r--;
    }
  }

  return { board: sim, linesCleared, isTSpin };
}

function scheduleAiMove() {
  if (_aiScheduled) return;
  _aiScheduled = true;
  const params = getEffectiveAiParams();
  setTimeout(() => {
    _aiScheduled = false;
    if (STATE.phase === 'playing' && STATE.ai.isAlive && STATE.ai.current) {
      aiThink(params);
    }
  }, params.thinkDelayMs);
}

function aiThink(params) {
  const ai = STATE.ai;
  if (!ai.current || !ai.isAlive) return;

  // If no params passed (shouldn't happen), use fresh effective params
  if (!params) params = getEffectiveAiParams();

  // Build noisy weights for this placement decision
  const w = {
    aggH:  noisyWeight(BASE_W.aggHeight,    params.weightNoise),
    holes: noisyWeight(BASE_W.holes,        params.weightNoise),
    bump:  noisyWeight(BASE_W.bumpiness,    params.weightNoise),
    lines: noisyWeight(BASE_W.linesCleared, params.weightNoise),
  };

  const isTpiece  = ai.current.type === 'T';
  const tspinPref = params.tspinPref;

  let bestScore  = Infinity;
  let bestX      = ai.current.x;
  let bestRot    = 0;

  let testShape = ai.current.shape.map(r => [...r]);

  for (let rot = 0; rot < 4; rot++) {
    for (let col = -2; col < COLS + 2; col++) {
      // Fast check: can piece exist at col, row 0?
      if (collides(ai.board, testShape, col, 0)) continue;

      // Drop to landing row
      let dropY = 0;
      while (!collides(ai.board, testShape, col, dropY + 1)) dropY++;
      if (collides(ai.board, testShape, col, dropY)) continue;

      const { board: simBoard, linesCleared, isTSpin } = simulatePlacement(
        ai.board, testShape, ai.current.color, col, dropY, isTpiece
      );

      // Base board score (lower = better)
      let score = evaluateBoardWeighted(simBoard, w) - linesCleared * w.lines;

      // T-spin reward: reduce score (better) when T-spin clears lines
      if (isTSpin && linesCleared > 0) {
        score -= tspinPref * linesCleared * 2.0;
      }

      if (score < bestScore) {
        bestScore = score;
        bestX     = col;
        bestRot   = rot;
      }
    }
    testShape = rotateShapeCW(testShape);
  }

  // Apply random mistake based on difficulty
  if (Math.random() < params.mistakeRate) {
    bestX   += Math.round((Math.random() * 6) - 3);
    bestRot  = Math.floor(Math.random() * 4);
  }

  // Execute: rotate first
  let rotsDone = 0;
  while (ai.current.rotState !== bestRot && rotsDone < 4) {
    tryRotate(ai, 1);
    rotsDone++;
  }

  // Move horizontally
  const dx  = bestX - ai.current.x;
  const dir = dx > 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(dx); i++) moveHorizontalRaw(ai, dir);

  // Hard drop
  hardDrop(ai, STATE.player);

  // Possibly T-bag on combo
  checkAndTbag('combo', ai.combo);

  // Schedule next move
  if (STATE.phase === 'playing' && ai.isAlive) scheduleAiMove();
}


// ──────────────────────────────────────────────────────────────
// T-BAG SYSTEM — Grain-3: Specific Triggers
// ──────────────────────────────────────────────────────────────

// Track whether AI was near-death before a line clear
let _aiNearDeath = false;

function checkAiNearDeathStatus() {
  if (!STATE.ai.isAlive) return;
  let maxH = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (STATE.ai.board[r][c]) {
        const h = ROWS - r;
        if (h > maxH) maxH = h;
        break;
      }
    }
  }
  if (maxH >= Math.floor(ROWS * 0.72) && !_aiNearDeath) {
    _aiNearDeath = true;
  }
}

function checkAndTbag(trigger, combo) {
  if (STATE.phase !== 'playing') return;
  const diff = AI_DIFFICULTY[STATE.difficulty];
  const threshold = diff.name === 'DEMON' ? 1 : diff.name === 'RIVAL' ? 2 : 3;
  if (combo >= threshold && Math.random() < 0.38) {
    const phrase = pickPhrase(trigger);
    showTbag(phrase);
    bus.emit('taunt', phrase);
  }
}

// Trigger: AI clears 4 lines (Tetris), or escapes near-death by clearing ≥2 lines
bus.on('lineClear', ({ side, rows }) => {
  if (side !== 'ai' || STATE.phase !== 'playing') return;

  if (rows.length === 4) {
    // Clean Tetris against the player
    _aiNearDeath = false; // Tetris clears near-death status
    setTimeout(() => {
      const phrase = pickPhrase('tetris');
      showTbag(phrase);
      bus.emit('taunt', phrase);
    }, 150);
  } else if (_aiNearDeath && rows.length >= 2) {
    // AI escaped near-death situation
    _aiNearDeath = false;
    setTimeout(() => {
      const phrase = pickPhrase('escape');
      showTbag(phrase);
      bus.emit('taunt', phrase);
    }, 400);
  } else {
    _aiNearDeath = false;
  }
});

// Trigger: Player tops out while AI has combo ≥ 1
bus.on('gameOver', ({ winner }) => {
  if (winner === 'ai' && STATE.ai.combo >= 1) {
    const phrase = pickPhrase('topout');
    // Slight delay so result screen doesn't cover it
    setTimeout(() => { showTbag(phrase); bus.emit('taunt', phrase); }, 300);
  }
});


// ──────────────────────────────────────────────────────────────
// INPUT HANDLING (DAS / ARR)
// ──────────────────────────────────────────────────────────────

const INPUT = {
  left:      false,
  right:     false,
  dasTimer:  null,
  arrTimer:  null,
  downTimer: null,
  DAS: 170,
  ARR: 50,
  SDR: 80,
};

function startDAS(dir) {
  stopDAS();
  moveHorizontal(STATE.player, dir);
  INPUT.dasTimer = setTimeout(() => {
    INPUT.arrTimer = setInterval(() => {
      if (STATE.phase === 'playing') moveHorizontal(STATE.player, dir);
    }, INPUT.ARR);
  }, INPUT.DAS);
}

function stopDAS() {
  if (INPUT.dasTimer) { clearTimeout(INPUT.dasTimer);  INPUT.dasTimer = null; }
  if (INPUT.arrTimer) { clearInterval(INPUT.arrTimer); INPUT.arrTimer = null; }
}

function onKeyDown(e) {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
    e.preventDefault();
  }

  if (STATE.phase === 'start' || STATE.phase === 'result') {
    if (e.key === 'Enter' || e.key === ' ') onStartBtn();
    return;
  }
  if (STATE.phase === 'paused') {
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') onResume();
    return;
  }
  if (STATE.phase !== 'playing') return;

  const ps = STATE.player;
  if (!ps.isAlive) return;

  switch (e.key) {
    case 'ArrowLeft':
      if (!INPUT.left) { INPUT.left = true; startDAS(-1); }
      break;
    case 'ArrowRight':
      if (!INPUT.right) { INPUT.right = true; startDAS(1); }
      break;
    case 'ArrowUp':
    case 'x': case 'X':
      tryRotate(ps, 1);
      break;
    case 'z': case 'Z':
      tryRotate(ps, -1);
      break;
    case 'ArrowDown':
      if (!INPUT.downTimer) {
        softDrop(ps);
        INPUT.downTimer = setInterval(() => {
          if (STATE.phase === 'playing') softDrop(ps);
        }, INPUT.SDR);
      }
      break;
    case ' ':
      hardDrop(ps, STATE.ai);
      break;
    case 'c': case 'C': case 'Shift':
      holdPiece(ps);
      break;
    case 'p': case 'P': case 'Escape':
      togglePause();
      break;
  }
}

function onKeyUp(e) {
  switch (e.key) {
    case 'ArrowLeft':
      INPUT.left = false;
      if (!INPUT.right) stopDAS(); else startDAS(1);
      break;
    case 'ArrowRight':
      INPUT.right = false;
      if (!INPUT.left) stopDAS(); else startDAS(-1);
      break;
    case 'ArrowDown':
      if (INPUT.downTimer) { clearInterval(INPUT.downTimer); INPUT.downTimer = null; }
      break;
  }
}

function bindInputs() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup',   onKeyUp);

  // Penalty flavor picker
  DOM.penaltyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.penaltyType = btn.dataset.penalty;
      DOM.penaltyBtns.forEach(b => b.classList.remove('penalty-btn--active'));
      btn.classList.add('penalty-btn--active');
    });
  });

  // Difficulty selector (in-game)
  DOM.diffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.difficulty = parseInt(btn.dataset.difficulty, 10);
      DOM.diffBtns.forEach(b => b.classList.remove('diff-btn--active'));
      btn.classList.add('diff-btn--active');
      DOM.diffBtnsStart.forEach(b => {
        b.classList.toggle('diff-btn--active', b.dataset.difficulty === btn.dataset.difficulty);
      });
    });
  });

  // Start-screen difficulty selector
  DOM.diffBtnsStart.forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.difficulty = parseInt(btn.dataset.difficulty, 10);
      DOM.diffBtnsStart.forEach(b => b.classList.remove('diff-btn--active'));
      btn.classList.add('diff-btn--active');
      DOM.diffBtns.forEach(b => {
        b.classList.toggle('diff-btn--active', b.dataset.difficulty === btn.dataset.difficulty);
      });
    });
  });

  DOM.startBtn.addEventListener('click',  onStartBtn);
  DOM.rematchBtn.addEventListener('click', onRematch);
  DOM.menuBtn.addEventListener('click',   onMenu);
  DOM.resumeBtn.addEventListener('click', onResume);
  DOM.quitBtn.addEventListener('click',   onMenu);
}


// ──────────────────────────────────────────────────────────────
// GAME FLOW
// ──────────────────────────────────────────────────────────────

function onStartBtn() {
  if (STATE.phase !== 'start') return;
  startGame();
}

function startGame() {
  // Reset state
  STATE.player = createPlayerState();
  STATE.ai     = createPlayerState();
  STATE.winner = null;
  _aiNearDeath = false;

  // Pre-fill bags and spawn initial pieces
  refillBag(STATE.player);
  refillBag(STATE.ai);
  spawnPiece(STATE.player);
  spawnPiece(STATE.ai);

  // Reset UI
  updateStatsUI('player');
  updateStatsUI('ai');
  clearAttackQueueViz('player');
  clearAttackQueueViz('ai');
  DOM.playerFxOverlay.className     = 'board-fx-overlay';
  DOM.aiFxOverlay.className         = 'board-fx-overlay';
  DOM.tbagBubble.dataset.hidden     = 'true';
  DOM.playerComboToast.dataset.hidden = 'true';
  DOM.aiComboToast.dataset.hidden     = 'true';
  DOM.playerIncoming.classList.remove('is-visible');
  DOM.aiIncoming.classList.remove('is-visible');
  DOM.playerBoardWrapper.classList.remove('is-danger');
  DOM.aiBoardWrapper.classList.remove('is-danger');

  setBattleStatus('BATTLE!');
  DOM.vsEmblem.classList.add('is-active');

  VFX.reset();
  _aiScheduled = false;
  _tbagCooldown = false;
  if (_tbagTimer) { clearTimeout(_tbagTimer); _tbagTimer = null; }
  stopDAS();

  STATE.phase = 'countdown';
  STATE.gameStartTime = performance.now();

  runCountdown(() => {
    STATE.phase = 'playing';
    STATE.lastTime = performance.now();
    startLoop();
    scheduleAiMove();
  });
}

function togglePause() {
  if (STATE.phase === 'playing') {
    STATE.phase = 'paused';
    stopLoop();
    showScreen('pause');
    setBattleStatus('PAUSED');
  } else if (STATE.phase === 'paused') {
    onResume();
  }
}

function onResume() {
  if (STATE.phase !== 'paused') return;
  STATE.phase    = 'playing';
  STATE.lastTime = performance.now();
  showGame();
  startLoop();
  setBattleStatus('BATTLE!');
  scheduleAiMove();
}

function endGame(winner) {
  if (STATE.phase === 'result') return;
  STATE.phase  = 'result';
  STATE.winner = winner;
  stopLoop();

  const won = winner === 'player';
  DOM.resultText.textContent = won ? 'YOU WIN! 🏆' : 'YOU LOSE 💀';
  DOM.resultSub.textContent  = won ? '완벽한 승리!' : '다음엔 이기자!';
  document.getElementById('result-screen').dataset.result = won ? 'win' : 'lose';

  const ps = STATE.player;
  const elapsed = Math.floor((performance.now() - STATE.gameStartTime) / 1000);
  const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const secs = (elapsed % 60).toString().padStart(2, '0');

  DOM.resultStats.innerHTML = `
    <div class="result-stat-tile">
      <span class="stat-label">SCORE</span>
      <span class="stat-value">${ps.score.toLocaleString()}</span>
    </div>
    <div class="result-stat-tile">
      <span class="stat-label">LINES</span>
      <span class="stat-value">${ps.lines}</span>
    </div>
    <div class="result-stat-tile">
      <span class="stat-label">LEVEL</span>
      <span class="stat-value">${ps.level}</span>
    </div>
    <div class="result-stat-tile">
      <span class="stat-label">MAX COMBO</span>
      <span class="stat-value">${ps.maxCombo}</span>
    </div>
    <div class="result-stat-tile">
      <span class="stat-label">TIME</span>
      <span class="stat-value">${mins}:${secs}</span>
    </div>
  `;

  showScreen('result');
  setBattleStatus(won ? 'PLAYER WINS!' : 'CPU WINS!');
  bus.emit('gameOver', { winner });
}

function onRematch() {
  STATE.phase = 'start';
  showScreen('start');
  setBattleStatus('READY?');
}

function onMenu() {
  STATE.phase = 'start';
  stopLoop();
  showScreen('start');
  setBattleStatus('READY?');
  DOM.vsEmblem.classList.remove('is-active');
}


// ──────────────────────────────────────────────────────────────
// CANVAS RESIZE
// ──────────────────────────────────────────────────────────────

function resizeCanvases() {
  DOM.bgCanvas.width        = window.innerWidth;
  DOM.bgCanvas.height       = window.innerHeight;
  DOM.particleCanvas.width  = window.innerWidth;
  DOM.particleCanvas.height = window.innerHeight;
  initBgStars();
  if (typeof VFX !== 'undefined') VFX.refreshRects();
}


// ──────────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────────

function init() {
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);
  bindInputs();
  initBgStars();

  STATE.phase = 'start';
  DOM.startScreen.dataset.hidden     = 'false';
  DOM.resultScreen.dataset.hidden    = 'true';
  DOM.pauseScreen.dataset.hidden     = 'true';
  DOM.countdownScreen.dataset.hidden = 'true';

  // Background loop (runs when game loop isn't)
  let bgRaf = null;
  function bgLoop(ts) {
    if (STATE.phase !== 'playing') {
      animateBgStars(ts);
      bgRaf = requestAnimationFrame(bgLoop);
    } else {
      bgRaf = null;
    }
  }
  bgRaf = requestAnimationFrame(bgLoop);

  bus.on('gameOver', () => {
    if (!bgRaf) bgRaf = requestAnimationFrame(bgLoop);
  });

  // ── Grain-4: wire VFX events ──
  bus.on('lineClear',      data => VFX.onLineClear(data));
  bus.on('penalty:queued', data => VFX.onPenaltyQueued(data));
  bus.on('pieceLocked',    data => VFX.onPieceLocked(data));
  bus.on('combo',          data => VFX.onCombo(data));

  // Start VFX overlay loop
  VFX.start();
}

// ═══════════════════════════════════════════════════════════════
// GRAIN-4: VFX & PARTICLE SYSTEM
// Full-screen canvas overlay (particle-canvas) — pointer-events none
// Driven by bus events; reads game state only.
// ═══════════════════════════════════════════════════════════════

// ── VFX Config — mirrors vfx-timing Token Group ─────────────
const VFX_CONFIG = {
  burstBaseCount:   10,      // particles per cell
  burstComboMult:   0.32,    // extra multiplier per combo level
  particleDragBase: 0.86,    // per-60fps-frame velocity decay
  particleGravity:  210,     // px/s² downward
  particleLifeBase: 0.90,
  particleDecayMin: 0.020,
  particleDecayRng: 0.012,

  orbCollectDur:    720,     // ms — collect phase
  orbChargeDur:     220,     // ms — pulse/charge
  orbLaunchDur:     430,     // ms — arc flight
  orbImpactDur:     260,     // ms — expand+fade on impact

  shockwaveSpeed:   250,     // px/s radial expansion
  shockwaveDecay:   2.3,     // alpha/s

  glowBloomAlpha:   0.30,    // piece glow peak opacity
  glowBloomRadius:  1.48,    // glow radius as CELL multiplier

  heatPerLine:      0.22,
  heatDecayRate:    0.36,    // per second
  heatMaxAlpha:     0.13,    // board backdrop max overlay alpha
};

// ── VFX Module ────────────────────────────────────────────────
const VFX = (() => {
  const canvas = DOM.particleCanvas;
  const ctx    = CTX.particle;

  let particles  = [];
  let shockwaves = [];
  let orbs       = [];
  let rafId      = null;
  let lastTs     = 0;

  const heat = { player: 0, ai: 0 };

  // ── Board rect cache ──────────────────────────────────────
  const _rects = { player: null, ai: null };

  function refreshRects() {
    _rects.player = DOM.playerBoardWrapper.getBoundingClientRect();
    _rects.ai     = DOM.aiBoardWrapper.getBoundingClientRect();
  }

  function getRect(side) {
    if (!_rects[side]) refreshRects();
    return _rects[side];
  }

  function cellCenter(side, col, row) {
    const r = getRect(side);
    return {
      x: r.left + col * CELL + CELL * 0.5,
      y: r.top  + row * CELL + CELL * 0.5,
    };
  }

  // ── Color helpers ─────────────────────────────────────────
  function parseHex(hex) {
    if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return [160, 160, 180];
    return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
  }

  function rgba(hex, a) {
    const [r,g,b] = parseHex(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ─────────────────────────────────────────────────────────
  // (A) LINE-CLEAR BURST
  // Chunky square particles from each cleared cell + shockwave
  // ─────────────────────────────────────────────────────────
  function spawnLineClearBurst(side, rows, rowColors, comboLevel) {
    refreshRects();
    const cfg  = VFX_CONFIG;
    const mult = 1 + Math.min(comboLevel, 6) * cfg.burstComboMult;

    for (let ri = 0; ri < rows.length; ri++) {
      const row   = rows[ri];
      const rColors = (rowColors && rowColors[ri]) || [];

      for (let c = 0; c < COLS; c++) {
        const rawColor = rColors[c];
        const color    = (rawColor && rawColor !== 0) ? rawColor : '#AAAACC';
        const { x, y } = cellCenter(side, c, row);
        const pCount   = Math.round((cfg.burstBaseCount + Math.random() * 4) * mult);

        for (let i = 0; i < pCount; i++) {
          const angle = (Math.PI * 2 / pCount) * i + (Math.random() - 0.5) * 0.7;
          const spd   = 65 + Math.random() * 150 * mult;
          particles.push({
            type:    'burst',
            x, y,
            vx:      Math.cos(angle) * spd,
            vy:      Math.sin(angle) * spd - 45,
            size:    5 + Math.random() * 9,
            color,
            alpha:   1.0,
            life:    cfg.particleLifeBase,
            decay:   cfg.particleDecayMin + Math.random() * cfg.particleDecayRng,
            drag:    cfg.particleDragBase,
            gravity: cfg.particleGravity,
            outline: true,
          });
        }
      }
    }

    // Shockwave rings — one per cleared row for multi-line; bonus ring on combo
    const ringCount = rows.length + (comboLevel >= 2 ? 1 : 0);
    for (let k = 0; k < ringCount; k++) {
      const row   = rows[Math.min(k, rows.length - 1)];
      const { x: cx } = cellCenter(side, 4, row);
      const { y: cy } = cellCenter(side, 4, row);
      const baseColor = ((rowColors && rowColors[0]) || [])[4] || '#FFFFFFAA';
      shockwaves.push({
        x: cx, y: cy,
        r: 6,
        speed: cfg.shockwaveSpeed + k * 28,
        alpha: 0.75 - k * 0.12,
        color: baseColor,
        lineW: 3.0 - k * 0.4,
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // (B) TRANSFER ORB
  // Debris particles collect at board bottom → orb forms →
  // arcs to opponent → squash+stretch impact
  // ─────────────────────────────────────────────────────────
  function spawnTransferOrb(fromSide, lineCount, flavor) {
    refreshRects();
    const fromRect = getRect(fromSide);
    const toSide   = fromSide === 'player' ? 'ai' : 'player';
    const color    = PARTICLE_COLORS[flavor] || '#9898AA';

    // Collection point: bottom-center of the sending board
    const collectX = fromRect.left + fromRect.width * 0.5;
    const collectY = fromRect.bottom - 18;

    // Shared ref object so debris particles can track orb state
    const ref = { orb: null };

    // Debris particles — spawn across the board face
    const debrisN = Math.min(lineCount * 9, 42);
    for (let i = 0; i < debrisN; i++) {
      const sx = fromRect.left + Math.random() * fromRect.width;
      const sy = fromRect.top  + Math.random() * fromRect.height;
      particles.push({
        type:     'debris',
        x: sx, y: sy,
        vx:       (Math.random() - 0.5) * 38,
        vy:       15 + Math.random() * 25,
        size:     3 + Math.random() * 5,
        color,
        alpha:    0.7 + Math.random() * 0.3,
        life:     1.0,
        decay:    0,
        drag:     0.93,
        gravity:  0,
        outline:  true,
        ref,
        collectX,
        collectY,
        seekAge:  0,
      });
    }

    const orb = {
      x: collectX, y: collectY,
      r: 0,
      maxR: 15 + lineCount * 2.8,
      color,
      alpha: 0,
      phase: 'collect',
      timer: 0,
      collectDur: VFX_CONFIG.orbCollectDur,
      chargeDur:  VFX_CONFIG.orbChargeDur,
      launchDur:  VFX_CONFIG.orbLaunchDur,
      impactDur:  VFX_CONFIG.orbImpactDur,
      fromSide,
      toSide,
      toRect:  null,    // filled on launch
      startX:  0, startY: 0, endX: 0, endY: 0, peakY: 0,
      trail: [],
      ref,
    };
    ref.orb = orb;
    orbs.push(orb);
  }

  // ─────────────────────────────────────────────────────────
  // (C-lock) LOCK FLASH — bright white flash on locked cells
  // ─────────────────────────────────────────────────────────
  function spawnLockFlash(side, piece) {
    if (!piece) return;
    refreshRects();
    const rect = getRect(side);
    const { shape, x: px, y: py } = piece;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const br = py + r;
        if (br < 0 || br >= ROWS) continue;
        particles.push({
          type:    'lockflash',
          x: rect.left + (px + c) * CELL + CELL * 0.5,
          y: rect.top  + br * CELL + CELL * 0.5,
          vx: 0, vy: 0,
          size:    CELL - 1,
          color:   '#FFFFFF',
          alpha:   0.62,
          life:    0.62,
          decay:   0.052,
          drag:    1,
          gravity: 0,
          outline: false,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // (C-glow) ACTIVE PIECE GLOW — radial bloom on overlay canvas
  // ─────────────────────────────────────────────────────────
  function drawPieceGlow(side) {
    if (STATE.phase !== 'playing') return;
    const ps = side === 'player' ? STATE.player : STATE.ai;
    if (!ps.current) return;
    const rect = getRect(side);
    const { shape, x: px, y: py, color } = ps.current;
    const [r,g,b] = parseHex(color);
    const radius = CELL * VFX_CONFIG.glowBloomRadius;
    const peakA  = VFX_CONFIG.glowBloomAlpha;

    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (!shape[row][col]) continue;
        const br = py + row;
        if (br < 0 || br >= ROWS) continue;
        const cx = rect.left + (px + col) * CELL + CELL * 0.5;
        const cy = rect.top  + br * CELL + CELL * 0.5;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0,   `rgba(${r},${g},${b},${peakA})`);
        grad.addColorStop(0.55,`rgba(${r},${g},${b},${(peakA * 0.35).toFixed(2)})`);
        grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Board backdrop radial gradient shifting with combo heat
  function drawBoardBackdrop(side) {
    const h = heat[side];
    if (h < 0.02) return;
    const rect = getRect(side);
    const cx = rect.left + rect.width  * 0.5;
    const cy = rect.top  + rect.height * 0.58;
    const hc  = side === 'player' ? [255, 185, 45] : [255, 75, 45];
    const maxA = VFX_CONFIG.heatMaxAlpha * h;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rect.height * 0.7);
    grad.addColorStop(0,   `rgba(${hc[0]},${hc[1]},${hc[2]},${maxA.toFixed(3)})`);
    grad.addColorStop(0.5, `rgba(${hc[0]},${hc[1]},${hc[2]},${(maxA*0.45).toFixed(3)})`);
    grad.addColorStop(1,   `rgba(${hc[0]},${hc[1]},${hc[2]},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
  }

  // ─────────────────────────────────────────────────────────
  // UPDATE LOGIC
  // ─────────────────────────────────────────────────────────
  function updateParticle(p, dt) {
    if (p.type === 'debris') {
      p.seekAge += dt;
      const orb = p.ref && p.ref.orb;

      if (!orb || orb.phase === 'dead') { p.alpha = 0; return; }

      if (orb.phase === 'impact') { p.alpha -= dt * 5; return; }

      if (orb.phase === 'launch') {
        // Trail behind orb
        p.x += (orb.x - p.x) * 9 * dt;
        p.y += (orb.y - p.y) * 9 * dt;
        p.alpha -= dt * 4.5;
        return;
      }

      if (orb.phase === 'charge') {
        p.x += (orb.x - p.x) * 14 * dt;
        p.y += (orb.y - p.y) * 14 * dt;
        p.alpha -= dt * 3.5;
        return;
      }

      // Collect phase: gravity-style attraction toward collect point
      const dx = p.collectX - p.x;
      const dy = p.collectY - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 8) { p.alpha = 0; return; }

      const progress   = Math.min(p.seekAge / (VFX_CONFIG.orbCollectDur * 0.001), 1);
      const seekForce  = progress * progress * 4.5;
      p.vx += (dx / dist) * seekForce * 380 * dt;
      p.vy += (dy / dist) * seekForce * 380 * dt;
      // Subtle swirl
      p.vx += (p.collectY - p.y) * 0.6 * dt;
      p.vy -= (p.collectX - p.x) * 0.6 * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      return;
    }

    // Standard physics (burst, lockflash)
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy *= Math.pow(p.drag, dt * 60);
    p.vy += (p.gravity || 0) * dt;
    p.x  += p.vx * dt;
    p.y  += p.vy * dt;
    p.life  -= p.decay;
    p.alpha  = p.life;
    if (p.size > 2) p.size -= dt * 3;
  }

  function updateOrb(orb, dt) {
    orb.timer += dt * 1000;

    if (orb.phase === 'collect') {
      const t   = Math.min(orb.timer / orb.collectDur, 1);
      orb.r     = orb.maxR * t * t;
      orb.alpha = Math.min(t * 1.6, 0.92);
      if (t >= 1) { orb.phase = 'charge'; orb.timer = 0; }
    }
    else if (orb.phase === 'charge') {
      const t   = orb.timer / orb.chargeDur;
      orb.r     = orb.maxR * (1 + 0.22 * Math.sin(t * Math.PI * 5));
      orb.alpha = 0.96;
      if (orb.timer >= orb.chargeDur) {
        orb.phase  = 'launch';
        orb.timer  = 0;
        orb.startX = orb.x;
        orb.startY = orb.y;
        // Fresh rect for the target board
        orb.toRect = orb.toSide === 'player'
          ? DOM.playerBoardWrapper.getBoundingClientRect()
          : DOM.aiBoardWrapper.getBoundingClientRect();
        orb.endX  = orb.toRect.left + orb.toRect.width * 0.5;
        orb.endY  = orb.toRect.bottom - 18;
        orb.peakY = Math.min(orb.startY, orb.endY) - 150;
      }
    }
    else if (orb.phase === 'launch') {
      const t  = Math.min(orb.timer / orb.launchDur, 1);
      // Ease-in-out cubic
      const te = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
      orb.x = orb.startX + (orb.endX - orb.startX) * te;
      // Quadratic Bezier arc
      const it = 1 - t;
      orb.y = it*it*orb.startY + 2*it*t*orb.peakY + t*t*orb.endY;
      orb.alpha = 1.0;
      orb.r     = orb.maxR * (0.78 + 0.22 * Math.sin(t * Math.PI));

      if (Math.random() < 0.55) {
        orb.trail.push({
          x: orb.x + (Math.random()-0.5)*4,
          y: orb.y + (Math.random()-0.5)*4,
          alpha: 0.55,
          r: orb.r * (0.28 + Math.random() * 0.38),
        });
      }

      if (t >= 1) {
        orb.phase = 'impact';
        orb.timer = 0;
        triggerGarbageImpact(orb.toSide);
      }
    }
    else if (orb.phase === 'impact') {
      const t   = Math.min(orb.timer / orb.impactDur, 1);
      orb.r     = orb.maxR * (1 + t * 3.2);
      orb.alpha = 1 - t * t;
      if (t >= 1) orb.phase = 'dead';
    }

    // Age trail
    for (let i = orb.trail.length - 1; i >= 0; i--) {
      orb.trail[i].alpha -= dt * 4.2;
      if (orb.trail[i].alpha <= 0) orb.trail.splice(i, 1);
    }
  }

  // ─────────────────────────────────────────────────────────
  // DRAW LOGIC
  // ─────────────────────────────────────────────────────────
  function drawParticle(p) {
    const a = Math.max(0, Math.min(1, p.alpha));
    if (a < 0.02) return;
    const s = Math.max(0.5, p.size);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillRect(-s*0.5, -s*0.5, s, s);
    if (p.outline && s > 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(-s*0.5, -s*0.5, s, s);
    }
    if (s > 5) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(-s*0.5 + 1, -s*0.5 + 1, s*0.42, 2);
      ctx.fillRect(-s*0.5 + 1, -s*0.5 + 1, 2, s*0.42);
    }
    ctx.restore();
  }

  function drawShockwave(sw) {
    if (sw.alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha = sw.alpha;
    ctx.strokeStyle = sw.color;
    ctx.lineWidth   = Math.max(0.5, sw.lineW || 2.5);
    ctx.shadowBlur  = 10;
    ctx.shadowColor = sw.color;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawOrb(orb) {
    // Orb trail
    const [or, og, ob] = parseHex(orb.color);
    for (const t of orb.trail) {
      if (t.alpha < 0.01) continue;
      ctx.save();
      ctx.globalAlpha = t.alpha * 0.55;
      const grad = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
      grad.addColorStop(0,   `rgba(${or},${og},${ob},0.85)`);
      grad.addColorStop(0.6, `rgba(${or},${og},${ob},0.25)`);
      grad.addColorStop(1,   `rgba(${or},${og},${ob},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (orb.alpha < 0.02) return;
    const ox = orb.x, oy = orb.y, sr = orb.r;
    ctx.save();
    ctx.globalAlpha = orb.alpha;

    // Outer diffuse glow
    const outer = ctx.createRadialGradient(ox, oy, 0, ox, oy, sr * 2.6);
    outer.addColorStop(0,   `rgba(${or},${og},${ob},0.38)`);
    outer.addColorStop(0.5, `rgba(${or},${og},${ob},0.12)`);
    outer.addColorStop(1,   `rgba(${or},${og},${ob},0)`);
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(ox, oy, sr * 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Orb body with highlight
    const body = ctx.createRadialGradient(
      ox - sr * 0.28, oy - sr * 0.28, 0,
      ox, oy, sr
    );
    body.addColorStop(0,    `rgba(255,255,255,0.92)`);
    body.addColorStop(0.22, `rgba(${or},${og},${ob},1)`);
    body.addColorStop(0.65, `rgba(${Math.floor(or*0.72)},${Math.floor(og*0.72)},${Math.floor(ob*0.72)},0.9)`);
    body.addColorStop(1,    `rgba(${Math.floor(or*0.4)},${Math.floor(og*0.4)},${Math.floor(ob*0.4)},0.85)`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(ox, oy, sr, 0, Math.PI * 2);
    ctx.fill();

    // Cartoon outline
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth   = 2.5;
    ctx.stroke();

    ctx.restore();
  }

  // ── Impact helpers ────────────────────────────────────────
  function triggerGarbageImpact(side) {
    const el = side === 'player' ? DOM.playerBoardWrapper : DOM.aiBoardWrapper;
    el.classList.remove('garbage-impact');
    void el.offsetWidth;
    el.classList.add('garbage-impact');
    el.addEventListener('animationend', () => el.classList.remove('garbage-impact'), { once: true });
  }

  // ── Main tick ─────────────────────────────────────────────
  function tick(ts) {
    rafId  = requestAnimationFrame(tick);
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Board backdrop heat glow
    drawBoardBackdrop('player');
    drawBoardBackdrop('ai');

    // Active piece bloom
    drawPieceGlow('player');
    drawPieceGlow('ai');

    // Decay combo heat
    heat.player = Math.max(0, heat.player - dt * VFX_CONFIG.heatDecayRate);
    heat.ai     = Math.max(0, heat.ai     - dt * VFX_CONFIG.heatDecayRate);

    // Orbs
    for (let i = orbs.length - 1; i >= 0; i--) {
      if (orbs[i].phase !== 'dead') { updateOrb(orbs[i], dt); drawOrb(orbs[i]); }
      else orbs.splice(i, 1);
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      updateParticle(p, dt);
      if (p.alpha < 0.02 || p.life <= 0) particles.splice(i, 1);
      else drawParticle(p);
    }

    // Shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.r     += sw.speed * dt;
      sw.alpha -= VFX_CONFIG.shockwaveDecay * dt;
      if (sw.alpha <= 0) shockwaves.splice(i, 1);
      else drawShockwave(sw);
    }
  }

  // ── Public API ────────────────────────────────────────────
  return {
    start() {
      if (rafId) cancelAnimationFrame(rafId);
      lastTs = performance.now();
      rafId  = requestAnimationFrame(tick);
    },
    stop() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    },
    reset() {
      particles.length  = 0;
      shockwaves.length = 0;
      orbs.length       = 0;
      heat.player = 0;
      heat.ai     = 0;
    },
    refreshRects,
    onLineClear({ side, rows, rowColors }) {
      const ps = side === 'player' ? STATE.player : STATE.ai;
      spawnLineClearBurst(side, rows, rowColors, Math.max(0, ps.combo));
      heat[side] = Math.min(1.0, heat[side] + VFX_CONFIG.heatPerLine * rows.length);
    },
    onPenaltyQueued({ fromSide, count, flavor }) {
      spawnTransferOrb(fromSide, count, flavor);
    },
    onPieceLocked({ side, piece }) {
      spawnLockFlash(side, piece);
    },
    onCombo({ side, combo }) {
      heat[side] = Math.min(1.0, heat[side] + 0.11 * combo);
    },
  };
})();

// Boot
init();
