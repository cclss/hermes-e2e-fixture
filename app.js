/* =============================================================
   TETRIS BATTLE — app.js  (grain-2: complete engine)
   Brawl Stars-inspired 1v1 AI Tetris — Vanilla JS, no deps
   ============================================================= */

'use strict';

// ──────────────────────────────────────────────────────────────
// EVENT BUS
// ──────────────────────────────────────────────────────────────
const bus = (() => {
  const listeners = {};
  return {
    on(event, fn)  { (listeners[event] = listeners[event] || []).push(fn); },
    off(event, fn) { if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== fn); },
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
const COMBO_BONUS = 50;   // per combo level
const B2B_BONUS   = 1.5;  // back-to-back multiplier

// Garbage lines sent per clear (standard VS table)
const GARBAGE_TABLE = { 1: 0, 2: 1, 3: 2, 4: 4 };
const COMBO_GARBAGE = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5]; // combo 0..11+

const AI_DIFFICULTY = {
  1: { thinkDelayMs: 900,  mistakeRate: 0.30, depthScore: 1 },
  2: { thinkDelayMs: 420,  mistakeRate: 0.08, depthScore: 2 },
  3: { thinkDelayMs: 120,  mistakeRate: 0.01, depthScore: 4 },
};

const TBAG_PHRASES = [
  'GG EZ 😈', 'TOO SLOW 🐢', 'L RATIO 💀', 'SKILL ISSUE 👁️',
  'BOZO 🤡',   'STAY MAD 😤', 'EZ CLAP 👏', 'IMAGINE LOSING 💅',
  'TOUCH GRASS 🌿', 'NEXT TIME... MAYBE 😏', 'GET REKT 🎮', 'YIKES 😬',
];

// SRS Wall-kick data  [from_rotation -> to_rotation] -> [[dx,dy], ...]
// Standard J/L/S/T/Z kicks
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
// I-piece kicks
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
  bg:      DOM.bgCanvas.getContext('2d'),
  particle: DOM.particleCanvas.getContext('2d'),
  player:  DOM.playerBoard.getContext('2d'),
  ai:      DOM.aiBoard.getContext('2d'),
  pHold:   DOM.playerHold.getContext('2d'),
  pNext:   DOM.playerNext.getContext('2d'),
  aHold:   DOM.aiHold.getContext('2d'),
  aNext:   DOM.aiNext.getContext('2d'),
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
    current:      null,   // { type, shape, rotState, x, y, color, colorDark, colorLight }
    held:         null,
    holdUsed:     false,
    bag:          [],
    nextQueue:    [],
    score:        0,
    level:        1,
    lines:        0,
    combo:        -1,     // -1 = no streak yet; 0 = first clear
    maxCombo:     0,
    backToBack:   false,
    health:       100,
    pendingGarbage: 0,
    activeFx:     null,   // 'mirror' | 'gravity' | 'blind' | null
    fxTimer:      0,
    isAlive:      true,
    gravityAcc:   0,      // accumulated gravity ms
    lockDelay:    0,      // lock-delay accumulator ms
    lockDelayMax: 500,    // ms of no movement before auto-lock
    onGround:     false,
    startTime:    0,      // set when game starts
  };
}

let STATE = {
  phase:       'start',
  player:      createPlayerState(),
  ai:          createPlayerState(),
  difficulty:  2,
  penaltyType: 'garbage',
  tick:        0,
  lastTime:    0,
  winner:      null,
  bgStars:     [],
  bgFloaters:  [],
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
  // Keep nextQueue stocked to 3
  while (ps.nextQueue.length < 3 && ps.bag.length > 0) {
    ps.nextQueue.push(ps.bag.shift());
    if (ps.bag.length === 0) ps.bag = shuffle([...PIECE_KEYS]);
  }
}

function makeCurrentPiece(type) {
  const def = TETROMINOES[type];
  // Deep clone shape
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
    const ny = cur.y - dy; // SRS uses y-up internally, invert for canvas y-down
    if (!collides(ps.board, newShape, nx, ny)) {
      cur.shape    = newShape;
      cur.rotState = newRot;
      cur.x = nx;
      cur.y = ny;
      ps.lockDelay = 0; // reset lock delay on successful rotation
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
  // Mirror effect inverts left/right
  const actualDir = ps.activeFx === 'mirror' ? -dir : dir;
  if (!collides(ps.board, ps.current.shape, ps.current.x + actualDir, ps.current.y)) {
    ps.current.x += actualDir;
    ps.lockDelay = 0;
    return true;
  }
  return false;
}

function moveHorizontalRaw(ps, dir) {
  // unaffected by mirror (for AI)
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
// T-SPIN DETECTION
// ──────────────────────────────────────────────────────────────

function detectTSpin(ps) {
  if (!ps.current || ps.current.type !== 'T') return false;
  const { x, y, rotState } = ps.current;
  // 3-corner rule: at least 3 of the 4 diagonal corners must be occupied
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

  // Find & clear full rows
  const clearedRows = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    if (ps.board[r].every(c => c !== 0)) {
      clearedRows.push(r);
    }
  }

  // Emit line-clear hook (grain-4 VFX subscribes here)
  if (clearedRows.length > 0) {
    bus.emit('lineClear', { side: ps === STATE.player ? 'player' : 'ai', rows: clearedRows });
  }

  // Remove cleared rows (already in descending order) then prepend empty rows
  // Process descending so lower splices don't shift higher indices
  clearedRows.sort((a, b) => b - a);
  for (const r of clearedRows) ps.board.splice(r, 1);
  for (let i = 0; i < clearedRows.length; i++) ps.board.unshift(new Array(COLS).fill(0));

  const n = clearedRows.length;
  const side = ps === STATE.player ? 'player' : 'ai';

  if (n > 0) {
    // Combo tracking
    ps.combo++;
    if (ps.combo > ps.maxCombo) ps.maxCombo = ps.combo;

    // Back-to-back (consecutive Tetris or T-spin)
    const isSpecial = n === 4 || isTSpin;
    const b2bMulti = (isSpecial && ps.backToBack) ? B2B_BONUS : 1.0;
    ps.backToBack = isSpecial;

    // Score
    const base = SCORE_TABLE[n] || 0;
    const comboBonus = ps.combo * COMBO_BONUS;
    ps.score += Math.floor((base + comboBonus) * ps.level * b2bMulti);
    ps.lines += n;

    // Level up every 10 lines
    const newLevel = Math.floor(ps.lines / 10) + 1;
    if (newLevel > ps.level) {
      ps.level = newLevel;
      bus.emit('levelUp', { side, level: newLevel });
    }

    // UI
    updateStatsUI(side);
    if (ps.combo >= 1) showComboToast(side, ps.combo);

    // Flash board
    flashBoard(side);
    thudBoard(side);

    // Penalty
    if (targetPs) {
      const garbageCount = calcGarbageSent(n, ps.combo, isTSpin, b2bMulti > 1);
      if (garbageCount > 0) {
        queuePenaltyAttack(side, garbageCount);
      }
    }

    bus.emit('combo', { side, combo: ps.combo, lines: n });
  } else {
    // Zero-clear resets combo
    ps.combo = -1;
    ps.backToBack = false;
    thudBoard(side);
  }

  ps.current = null;
  spawnPiece(ps);

  if (!ps.isAlive) {
    const winner = ps === STATE.player ? 'ai' : 'player';
    endGame(winner);
  }
}

function calcGarbageSent(lines, combo, isTSpin, isB2B) {
  let base = GARBAGE_TABLE[lines] || 0;
  if (isTSpin) base = Math.max(base, lines * 2);
  if (isB2B) base += 1;
  const comboGarbage = COMBO_GARBAGE[Math.min(combo, COMBO_GARBAGE.length - 1)] || 0;
  return base + comboGarbage;
}

function addGarbageLines(ps, count) {
  if (count <= 0) return;
  const hole = Math.floor(Math.random() * COLS);
  for (let i = 0; i < count; i++) {
    ps.board.shift();
    const row = new Array(COLS).fill('#555566');
    row[hole] = 0;
    ps.board.push(row);
  }
  shakeBoard(ps === STATE.player ? 'player' : 'ai');
  bus.emit('garbageReceived', { side: ps === STATE.player ? 'player' : 'ai', count });
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
  ps.lockDelay = 0;
}


// ──────────────────────────────────────────────────────────────
// LEVEL / GRAVITY
// ──────────────────────────────────────────────────────────────

function gravityIntervalForLevel(level) {
  // Tetris Guideline formula
  return Math.max(50, Math.floor(1000 * Math.pow(0.8 - (level - 1) * 0.007, level - 1)));
}


// ──────────────────────────────────────────────────────────────
// HEALTH SYSTEM
// ──────────────────────────────────────────────────────────────

function applyDamage(ps, amount) {
  ps.health = Math.max(0, ps.health - amount);
  if (ps.health <= 0) ps.isAlive = false;
}

function updateHealthBar(side) {
  const ps   = side === 'player' ? STATE.player : STATE.ai;
  const fill = side === 'player' ? DOM.playerHealthFill : DOM.aiHealthFill;
  fill.style.width = ps.health + '%';
  if (ps.health <= 25) {
    fill.style.animation = 'health-danger 0.6s ease-in-out infinite';
  } else {
    fill.style.animation = '';
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

  // Inner glow overlay (top-left corner gleam)
  const grad = ctx.createLinearGradient(x, y, x + size * 0.6, y + size * 0.6);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, size - 1, size - 1);

  ctx.globalAlpha = 1.0;
}

function renderBoard(ctx, ps) {
  ctx.clearRect(0, 0, COLS * CELL, ROWS * CELL);

  // Draw locked board cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (ps.board[r][c]) {
        drawCell(ctx, c * CELL, r * CELL, ps.board[r][c], CELL);
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
// BACKGROUND STARS
// ──────────────────────────────────────────────────────────────

function initBgStars() {
  DOM.bgCanvas.width  = window.innerWidth;
  DOM.bgCanvas.height = window.innerHeight;
  STATE.bgStars = [];
  STATE.bgFloaters = [];
  const w = DOM.bgCanvas.width, h = DOM.bgCanvas.height;

  // Small twinkling stars
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

  // Larger soft glow blobs
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

  // Floaters
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

  // Stars
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
// PENALTY PARTICLES
// ──────────────────────────────────────────────────────────────

const PARTICLE_COLORS = {
  garbage: '#888899',
  mirror:  '#5B9BF5',
  gravity: '#FF7027',
  blind:   '#9B4FE8',
};

function spawnPenaltyParticles(fromSide, lineCount, type) {
  const color = PARTICLE_COLORS[type] || '#888899';
  const count = Math.min(lineCount * 3, 12);

  const fromWrapper = fromSide === 'player' ? DOM.playerBoardWrapper : DOM.aiBoardWrapper;
  const toWrapper   = fromSide === 'player' ? DOM.aiBoardWrapper     : DOM.playerBoardWrapper;

  const fromRect = fromWrapper.getBoundingClientRect();
  const toRect   = toWrapper.getBoundingClientRect();

  // Gather point: above the VS bolt
  const boltRect = DOM.transferBolt.getBoundingClientRect();
  const gatherX  = boltRect.left + boltRect.width / 2;
  const gatherY  = boltRect.top  + boltRect.height / 2;

  for (let i = 0; i < count; i++) {
    const startX = fromRect.left + Math.random() * fromRect.width;
    const startY = fromRect.top  + Math.random() * fromRect.height;

    const px = document.createElement('div');
    px.className = 'penalty-particle';
    px.style.cssText = `
      left: ${startX}px;
      top:  ${startY}px;
      background: ${color};
      --tx: ${gatherX - startX}px;
      --ty: ${gatherY - startY}px;
      --rot: ${(Math.random() * 360)}deg;
    `;
    document.body.appendChild(px);
    px.classList.add('phase-gather');

    // After gather animation ends, launch to target
    const delay = (800 + Math.random() * 200);
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
    }, delay);

    // Safety cleanup
    setTimeout(() => { if (document.body.contains(px)) px.remove(); }, delay + 900);
  }

  // Flash bolt
  DOM.transferBolt.classList.add('is-sending');
  setTimeout(() => DOM.transferBolt.classList.remove('is-sending'), 600);
}

function updateAttackQueueViz(side, count, type) {
  const el = side === 'player' ? DOM.playerAttackViz : DOM.aiAttackViz;
  el.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const b = document.createElement('div');
    b.className = `atk-block atk-block--${type}`;
    el.appendChild(b);
  }
}

function clearAttackQueueViz(side) {
  const el = side === 'player' ? DOM.playerAttackViz : DOM.aiAttackViz;
  el.innerHTML = '';
}

function queuePenaltyAttack(fromSide, lineCount) {
  const type = STATE.penaltyType;
  updateAttackQueueViz(fromSide, lineCount, type);
  spawnPenaltyParticles(fromSide, lineCount, type);

  // Show incoming warning on opponent
  const toSide = fromSide === 'player' ? 'ai' : 'player';
  const incomingEl    = toSide === 'player' ? DOM.playerIncoming    : DOM.aiIncoming;
  const incomingCount = toSide === 'player' ? DOM.playerIncomingCount : DOM.aiIncomingCount;
  incomingCount.textContent = lineCount;
  incomingEl.classList.add('is-visible');

  const GATHER_DELAY = 1100;
  setTimeout(() => {
    deliverPenalty(toSide, lineCount);
    clearAttackQueueViz(fromSide);
    incomingEl.classList.remove('is-visible');
  }, GATHER_DELAY);
}

function deliverPenalty(toSide, lineCount) {
  const ps = toSide === 'player' ? STATE.player : STATE.ai;
  if (!ps.isAlive || STATE.phase !== 'playing') return;

  const type = STATE.penaltyType;
  switch (type) {
    case 'garbage':
      addGarbageLines(ps, lineCount);
      break;
    case 'mirror':
      ps.activeFx = 'mirror';
      ps.fxTimer  = 8000;
      applyFxOverlay(toSide, 'mirror');
      break;
    case 'gravity':
      ps.activeFx = 'gravity';
      ps.fxTimer  = 6000;
      applyFxOverlay(toSide, 'gravity');
      break;
    case 'blind':
      ps.activeFx = 'blind';
      ps.fxTimer  = 5000;
      applyFxOverlay(toSide, 'blind');
      break;
  }
  shakeBoard(toSide);
  // Always add at least some garbage for non-garbage modes too (1 line)
  if (type !== 'garbage' && lineCount >= 2) {
    addGarbageLines(ps, 1);
  }
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

  // Score pop animation
  scoreEl.classList.remove('is-popping');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('is-popping');
  scoreEl.addEventListener('animationend', () => scoreEl.classList.remove('is-popping'), { once: true });

  updateHealthBar(side);
}

let _comboHideTimers = { player: null, ai: null };

function showComboToast(side, count) {
  const toast = side === 'player' ? DOM.playerComboToast : DOM.aiComboToast;
  const countEl = side === 'player' ? DOM.playerComboToastCount : DOM.aiComboToastCount;
  countEl.textContent = count;
  toast.dataset.hidden = 'false';
  if (_comboHideTimers[side]) clearTimeout(_comboHideTimers[side]);
  _comboHideTimers[side] = setTimeout(() => hideComboToast(side), 1500);
}

function hideComboToast(side) {
  const toast = side === 'player' ? DOM.playerComboToast : DOM.aiComboToast;
  toast.dataset.hidden = 'true';
  // Force re-animation next time by resetting
  toast.style.animation = 'none';
  void toast.offsetWidth;
  toast.style.animation = '';
}

let _tbagTimer    = null;
let _tbagCooldown = false;

function showTbag() {
  if (_tbagCooldown) return;
  _tbagCooldown = true;
  const phrase = TBAG_PHRASES[Math.floor(Math.random() * TBAG_PHRASES.length)];
  DOM.tbagText.textContent = phrase;
  DOM.tbagBubble.dataset.hidden = 'false';
  if (_tbagTimer) clearTimeout(_tbagTimer);
  _tbagTimer = setTimeout(() => {
    DOM.tbagBubble.dataset.hidden = 'true';
    DOM.tbagBubble.style.animation = 'none';
    void DOM.tbagBubble.offsetWidth;
    DOM.tbagBubble.style.animation = '';
    setTimeout(() => { _tbagCooldown = false; }, 1500);
  }, 2200);
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
    if (i >= steps.length) {
      showGame();
      onDone();
      return;
    }
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

  const dt = Math.min(timestamp - STATE.lastTime, 50); // cap dt at 50ms
  STATE.lastTime = timestamp;
  STATE.tick++;

  const player = STATE.player;
  const ai     = STATE.ai;

  // ── Player gravity ──
  if (player.isAlive && player.current) {
    const gravMs = player.activeFx === 'gravity'
      ? Math.floor(gravityIntervalForLevel(player.level) * 0.35)
      : gravityIntervalForLevel(player.level);

    player.gravityAcc += dt;
    if (player.gravityAcc >= gravMs) {
      player.gravityAcc = 0;
      const moved = softDrop(player);
      if (!moved) {
        // On ground — start lock delay
        player.onGround = true;
        player.lockDelay += dt + gravMs;
        if (player.lockDelay >= player.lockDelayMax) {
          lockPiece(player, ai);
        }
      } else {
        player.onGround = false;
        player.lockDelay = 0;
      }
    } else if (player.onGround) {
      player.lockDelay += dt;
      if (player.lockDelay >= player.lockDelayMax) {
        lockPiece(player, ai);
      }
    }
  }

  // ── AI gravity ──
  if (ai.isAlive && ai.current) {
    const aiGravMs = ai.activeFx === 'gravity'
      ? Math.floor(gravityIntervalForLevel(ai.level) * 0.35)
      : gravityIntervalForLevel(ai.level);

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
// AI ENGINE
// ──────────────────────────────────────────────────────────────

let _aiScheduled = false;

function scheduleAiMove() {
  if (_aiScheduled) return;
  _aiScheduled = true;
  const delay = AI_DIFFICULTY[STATE.difficulty].thinkDelayMs;
  setTimeout(() => {
    _aiScheduled = false;
    if (STATE.phase === 'playing' && STATE.ai.isAlive && STATE.ai.current) {
      aiThink();
    }
  }, delay);
}

function aiThink() {
  const ai = STATE.ai;
  if (!ai.current || !ai.isAlive) return;

  const diff = AI_DIFFICULTY[STATE.difficulty];
  let bestScore = Infinity;
  let bestX = ai.current.x;
  let bestRot = 0;

  // Try all rotations
  let testShape = ai.current.shape.map(r => [...r]);
  for (let rot = 0; rot < 4; rot++) {
    // Try all column positions
    for (let col = -2; col < COLS + 2; col++) {
      if (collides(ai.board, testShape, col, 0)) continue;
      // Drop to bottom
      let dropY = 0;
      while (!collides(ai.board, testShape, col, dropY + 1)) dropY++;
      if (collides(ai.board, testShape, col, dropY)) continue;

      // Simulate placement
      const { board: simBoard, linesCleared } = simulatePlacement(
        ai.board, testShape, ai.current.color, col, dropY
      );
      const score = evaluateBoard(simBoard) - linesCleared * 3.5;

      if (score < bestScore) {
        bestScore = score;
        bestX = col;
        bestRot = rot;
      }
    }
    testShape = rotateShapeCW(testShape);
  }

  // Apply mistake based on difficulty
  if (Math.random() < diff.mistakeRate) {
    bestX   += Math.floor(Math.random() * 5) - 2;
    bestRot  = Math.floor(Math.random() * 4);
  }

  // Execute: rotate first
  const targetRot = bestRot;
  let rotsDone = 0;
  while (ai.current.rotState !== targetRot && rotsDone < 4) {
    tryRotate(ai, 1);
    rotsDone++;
  }

  // Move horizontally
  const dx = bestX - ai.current.x;
  const steps = Math.abs(dx);
  const dir   = dx > 0 ? 1 : -1;
  for (let i = 0; i < steps; i++) {
    moveHorizontalRaw(ai, dir);
  }

  // Hard drop
  hardDrop(ai, STATE.player);

  // AI tbag
  maybeTbag(ai.combo);

  // Schedule next move
  if (STATE.phase === 'playing' && ai.isAlive) {
    scheduleAiMove();
  }
}

function evaluateBoard(board) {
  let aggregateHeight = 0;
  let holes = 0;
  let bumpiness = 0;
  const colHeights = new Array(COLS).fill(0);

  for (let c = 0; c < COLS; c++) {
    let found = false;
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] && !found) {
        colHeights[c] = ROWS - r;
        found = true;
      }
      if (found && !board[r][c]) holes++;
    }
    aggregateHeight += colHeights[c];
  }

  for (let c = 0; c < COLS - 1; c++) {
    bumpiness += Math.abs(colHeights[c] - colHeights[c + 1]);
  }

  return aggregateHeight * 0.51 + holes * 3.5 + bumpiness * 0.18;
}

function simulatePlacement(board, shape, color, px, py) {
  // Deep clone board
  const sim = board.map(r => [...r]);
  // Stamp piece
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const br = py + r, bc = px + c;
      if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) sim[br][bc] = color;
    }
  }
  // Count & clear full rows
  let linesCleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (sim[r].every(c => c !== 0)) {
      sim.splice(r, 1);
      sim.unshift(new Array(COLS).fill(0));
      linesCleared++;
    }
  }
  return { board: sim, linesCleared };
}


// ──────────────────────────────────────────────────────────────
// T-BAG SYSTEM
// ──────────────────────────────────────────────────────────────

function maybeTbag(combo) {
  if (STATE.phase !== 'playing') return;
  const threshold = STATE.difficulty === 3 ? 1 : STATE.difficulty === 2 ? 2 : 3;
  if (combo < threshold) return;
  if (Math.random() > 0.45) return;
  showTbag();
}

// Also tbag on big line clears
bus.on('lineClear', ({ side, rows }) => {
  if (side === 'ai' && rows.length >= 2) maybeTbag(STATE.ai.combo);
});


// ──────────────────────────────────────────────────────────────
// INPUT HANDLING (DAS / ARR)
// ──────────────────────────────────────────────────────────────

const INPUT = {
  left:        false,
  right:       false,
  dasTimer:    null,
  arrTimer:    null,
  downTimer:   null,
  DAS:         170,
  ARR:         50,
  SDR:         80,  // soft-drop repeat rate
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
  if (INPUT.dasTimer) { clearTimeout(INPUT.dasTimer);   INPUT.dasTimer = null; }
  if (INPUT.arrTimer) { clearInterval(INPUT.arrTimer);  INPUT.arrTimer = null; }
}

function onKeyDown(e) {
  // Prevent arrow keys from scrolling
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
      if (!INPUT.right) stopDAS();
      else startDAS(1);
      break;
    case 'ArrowRight':
      INPUT.right = false;
      if (!INPUT.left) stopDAS();
      else startDAS(-1);
      break;
    case 'ArrowDown':
      if (INPUT.downTimer) { clearInterval(INPUT.downTimer); INPUT.downTimer = null; }
      break;
  }
}

function bindInputs() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup',   onKeyUp);

  DOM.penaltyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.penaltyType = btn.dataset.penalty;
      DOM.penaltyBtns.forEach(b => b.classList.remove('penalty-btn--active'));
      btn.classList.add('penalty-btn--active');
    });
  });

  DOM.diffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.difficulty = parseInt(btn.dataset.difficulty, 10);
      DOM.diffBtns.forEach(b => b.classList.remove('diff-btn--active'));
      btn.classList.add('diff-btn--active');
      // Also sync start-screen buttons
      DOM.diffBtnsStart.forEach(b => {
        b.classList.toggle('diff-btn--active', b.dataset.difficulty === btn.dataset.difficulty);
      });
    });
  });

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
  // Reset both sides
  STATE.player = createPlayerState();
  STATE.ai     = createPlayerState();
  STATE.winner = null;

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
  DOM.playerFxOverlay.className = 'board-fx-overlay';
  DOM.aiFxOverlay.className     = 'board-fx-overlay';
  DOM.tbagBubble.dataset.hidden = 'true';
  DOM.playerComboToast.dataset.hidden = 'true';
  DOM.aiComboToast.dataset.hidden     = 'true';
  DOM.playerIncoming.classList.remove('is-visible');
  DOM.aiIncoming.classList.remove('is-visible');

  setBattleStatus('BATTLE!');
  DOM.vsEmblem.classList.add('is-active');

  _aiScheduled = false;
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
  STATE.phase = 'playing';
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

  // Populate result stats
  const ps = STATE.player;
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
  DOM.bgCanvas.width       = window.innerWidth;
  DOM.bgCanvas.height      = window.innerHeight;
  DOM.particleCanvas.width  = window.innerWidth;
  DOM.particleCanvas.height = window.innerHeight;
  initBgStars();
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

  // Background loop: runs whenever the main game loop isn't
  let bgRaf = null;
  function bgLoop(ts) {
    if (STATE.phase !== 'playing') {
      animateBgStars(ts);
      bgRaf = requestAnimationFrame(bgLoop);
    } else {
      bgRaf = null; // game loop takes over
    }
  }
  bgRaf = requestAnimationFrame(bgLoop);

  // Restart bg loop when game ends (game loop stops, bg loop picks up)
  bus.on('gameOver', () => {
    if (!bgRaf) bgRaf = requestAnimationFrame(bgLoop);
  });
}

// Boot
init();
