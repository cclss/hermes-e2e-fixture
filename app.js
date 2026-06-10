/* =============================================================
   TETRIS BATTLE — app.js
   Brawl Stars-inspired 1v1 AI Tetris
   All game logic is TODO — this file establishes architecture
   stubs and wires up DOM references for future grains.
   ============================================================= */

'use strict';

// ──────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────

const COLS      = 10;
const ROWS      = 20;
const CELL      = 30;   // pixels — must match --cell CSS token
const MINI_CELL = 22;   // next/hold preview cell size

// Tetromino shapes (SRS-style, 4 rotations each)
const TETROMINOES = {
  I: { color: '#5B9BF5', shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
  O: { color: '#FFC234', shape: [[1,1],[1,1]] },
  T: { color: '#9B4FE8', shape: [[0,1,0],[1,1,1],[0,0,0]] },
  S: { color: '#5DBD47', shape: [[0,1,1],[1,1,0],[0,0,0]] },
  Z: { color: '#FF4040', shape: [[1,1,0],[0,1,1],[0,0,0]] },
  J: { color: '#FF7027', shape: [[1,0,0],[1,1,1],[0,0,0]] },
  L: { color: '#3EC9B4', shape: [[0,0,1],[1,1,1],[0,0,0]] },
};

const PIECE_KEYS = Object.keys(TETROMINOES);

// Scoring table (lines cleared → base points)
const SCORE_TABLE = { 1: 100, 2: 300, 3: 500, 4: 800 };

// Combo multiplier: each consecutive clear adds this
const COMBO_MULTIPLIER = 50;

// Penalty line counts per combo tier
const PENALTY_LINES = { 1: 1, 2: 1, 3: 2, 4: 4 };

// AI difficulty profiles
const AI_DIFFICULTY = {
  1: { thinkDelayMs: 1200, mistakeRate: 0.25, depthScore: 1 },
  2: { thinkDelayMs: 600,  mistakeRate: 0.10, depthScore: 2 },
  3: { thinkDelayMs: 180,  mistakeRate: 0.02, depthScore: 4 },
};

// T-bag phrases (AI taunts)
const TBAG_PHRASES = [
  'GG EZ 😈', 'TOO SLOW 🐢', "L RATIO 💀", 'SKILL ISSUE 👁️',
  'BOZO 🤡',   'STAY MAD 😤', "EZ CLAP 👏",  'IMAGINE LOSING 💅',
  'TOUCH GRASS 🌿', 'NEXT TIME... MAYBE 😏',
];

// Penalty types
const PENALTY_TYPES = ['garbage', 'mirror', 'gravity', 'blind'];

// ──────────────────────────────────────────────────────────────
// DOM REFERENCES
// ──────────────────────────────────────────────────────────────

const DOM = {
  // Canvases
  bgCanvas:       document.getElementById('bg-canvas'),
  particleCanvas: document.getElementById('particle-canvas'),
  playerBoard:    document.getElementById('player-board'),
  aiBoard:        document.getElementById('ai-board'),
  playerHold:     document.getElementById('player-hold-canvas'),
  playerNext:     document.getElementById('player-next-canvas'),
  aiHold:         document.getElementById('ai-hold-canvas'),
  aiNext:         document.getElementById('ai-next-canvas'),

  // Wrappers
  playerBoardWrapper: document.getElementById('player-board-wrapper'),
  aiBoardWrapper:     document.getElementById('ai-board-wrapper'),
  playerFxOverlay:    document.getElementById('player-fx-overlay'),
  aiFxOverlay:        document.getElementById('ai-fx-overlay'),
  playerFlash:        document.getElementById('player-flash'),
  aiFlash:            document.getElementById('ai-flash'),

  // Scores / stats
  playerScore:    document.getElementById('player-score'),
  playerLevel:    document.getElementById('player-level'),
  playerLines:    document.getElementById('player-lines'),
  playerComboCount: document.getElementById('player-combo-count'),
  aiScore:        document.getElementById('ai-score'),
  aiLevel:        document.getElementById('ai-level'),
  aiLines:        document.getElementById('ai-lines'),
  aiComboCount:   document.getElementById('ai-combo-count'),

  // Health bars
  playerHealthFill: document.getElementById('player-health-fill'),
  aiHealthFill:     document.getElementById('ai-health-fill'),

  // Combo toasts
  playerComboToast:      document.getElementById('player-combo-toast'),
  playerComboToastCount: document.getElementById('player-combo-toast-count'),
  aiComboToast:          document.getElementById('ai-combo-toast'),
  aiComboToastCount:     document.getElementById('ai-combo-toast-count'),

  // Incoming warnings
  playerIncoming:      document.getElementById('player-incoming'),
  playerIncomingCount: document.getElementById('player-incoming-count'),
  aiIncoming:          document.getElementById('ai-incoming'),
  aiIncomingCount:     document.getElementById('ai-incoming-count'),

  // Battle zone
  battleZone:          document.getElementById('battle-zone'),
  battleStatusBanner:  document.getElementById('battle-status-banner'),
  battleStatusText:    document.getElementById('battle-status-text'),
  penaltyTransferLane: document.getElementById('penalty-transfer-lane'),
  playerAttackViz:     document.getElementById('player-attack-viz'),
  aiAttackViz:         document.getElementById('ai-attack-viz'),
  transferBolt:        document.querySelector('.transfer-bolt'),
  vsEmblem:            document.querySelector('.vs-emblem'),

  // Controls
  penaltyPicker:      document.getElementById('penalty-picker'),
  penaltyBtns:        document.querySelectorAll('.penalty-btn[data-penalty]'),
  difficultySelector: document.getElementById('difficulty-selector'),
  diffBtns:           document.querySelectorAll('.diff-btn[data-difficulty]'),
  diffBtnsStart:      document.querySelectorAll('.diff-btn-group--start .diff-btn'),

  // T-bag bubble
  tbagBubble: document.getElementById('tbag-bubble'),
  tbagText:   document.getElementById('tbag-text'),

  // Screens
  startScreen:     document.getElementById('start-screen'),
  resultScreen:    document.getElementById('result-screen'),
  pauseScreen:     document.getElementById('pause-screen'),
  countdownScreen: document.getElementById('countdown-screen'),
  countdownNumber: document.getElementById('countdown-number'),

  // Buttons
  startBtn:   document.getElementById('start-btn'),
  rematchBtn: document.getElementById('rematch-btn'),
  menuBtn:    document.getElementById('menu-btn'),
  resumeBtn:  document.getElementById('resume-btn'),
  quitBtn:    document.getElementById('quit-btn'),

  // Result
  resultText:  document.getElementById('result-text'),
  resultSub:   document.getElementById('result-sub'),
  resultStats: document.getElementById('result-stats'),
};

// Canvas 2D contexts
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

/** Creates a fresh, empty board grid (2D array, 0 = empty) */
function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

/** Creates a fresh player/AI state object */
function createPlayerState() {
  return {
    board:       createBoard(),   // 2D grid of color strings or 0
    current:     null,            // { type, shape, x, y, color }
    held:        null,            // held piece type string or null
    holdUsed:    false,           // can't hold twice per piece
    bag:         [],              // 7-bag randomizer queue
    nextQueue:   [],              // preview pieces (show next 1-3)
    score:       0,
    level:       1,
    lines:       0,
    combo:       0,               // consecutive line-clear streak
    maxCombo:    0,
    health:      100,             // 0–100, lose at 0
    pendingLines: 0,              // garbage lines queued to receive
    activeFx:    null,            // 'mirror' | 'gravity' | 'blind' | null
    fxTimer:     0,               // ms remaining on active effect
    isAlive:     true,
  };
}

// Top-level game state
let STATE = {
  phase:       'start',   // 'start' | 'countdown' | 'playing' | 'paused' | 'result'
  player:      createPlayerState(),
  ai:          createPlayerState(),
  difficulty:  2,         // 1 | 2 | 3
  penaltyType: 'garbage', // current attack mode
  tick:        0,         // frame counter
  lastTime:    0,         // timestamp of last rAF
  gravityMs:   1000,      // ms between auto-drops (decreases with level)
  aiGravityMs: 1000,      // separate AI gravity
  winner:      null,      // 'player' | 'ai' | null
  bgStars:     [],        // background star particles
  particles:   [],        // active penalty particles
  tbagTimer:   null,      // tbag hide timeout id
};


// ──────────────────────────────────────────────────────────────
// BAG / PIECE GENERATION
// ──────────────────────────────────────────────────────────────

/** Shuffles an array in place (Fisher-Yates). */
function shuffle(arr) {
  // TODO: implement Fisher-Yates shuffle
}

/** Refills the 7-bag for a player state and extends nextQueue. */
function refillBag(ps) {
  // TODO: add all 7 piece keys shuffled into ps.bag, then
  //       shift enough into ps.nextQueue to keep 3 previews
}

/** Spawns the next piece for a player state from their nextQueue. */
function spawnPiece(ps) {
  // TODO: grab from ps.nextQueue, place at top-center of board,
  //       check immediate collision → if true, ps.isAlive = false
}


// ──────────────────────────────────────────────────────────────
// COLLISION DETECTION
// ──────────────────────────────────────────────────────────────

/**
 * Returns true if `piece` at (x, y) with `shape` collides with
 * the board boundaries or filled cells.
 * @param {number[][]} board
 * @param {number[][]} shape
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function collides(board, shape, x, y) {
  // TODO: iterate shape cells, check bounds + board[r][c]
  return false;
}


// ──────────────────────────────────────────────────────────────
// ROTATION (SRS)
// ──────────────────────────────────────────────────────────────

/**
 * Returns a 90° clockwise rotated version of `shape`.
 * @param {number[][]} shape
 * @returns {number[][]}
 */
function rotateShape(shape) {
  // TODO: transpose + reverse rows for clockwise rotation
  return shape;
}

/**
 * Attempts rotation with SRS wall-kick tests.
 * Mutates ps.current if a valid position is found.
 * @param {object} ps  player state
 * @param {number} dir  1 = clockwise, -1 = counter-clockwise
 */
function tryRotate(ps, dir) {
  // TODO: SRS kick tables for J/L/S/T/Z and I piece
}


// ──────────────────────────────────────────────────────────────
// MOVEMENT
// ──────────────────────────────────────────────────────────────

/** Moves current piece left or right. Returns true if moved. */
function moveHorizontal(ps, dir) {
  // TODO: check collision at x+dir, update ps.current.x
  return false;
}

/** Soft-drops current piece one row. Returns true if moved. */
function softDrop(ps) {
  // TODO: move down 1, increase score by 1
  return false;
}

/**
 * Hard-drops current piece to the lowest valid position.
 * Scores 2 pts per row dropped.
 */
function hardDrop(ps) {
  // TODO: find ghost position, drop, lock immediately
}

/**
 * Calculates the ghost piece position (lowest collision-free row).
 * @returns {number} ghost Y
 */
function getGhostY(ps) {
  // TODO: iterate y downward until collide
  return ps.current ? ps.current.y : 0;
}


// ──────────────────────────────────────────────────────────────
// LOCKING & LINE CLEARING
// ──────────────────────────────────────────────────────────────

/**
 * Locks the current piece into the board, clears complete lines,
 * updates score/level/combo, and queues penalties.
 * @param {object} ps         player state (the attacker)
 * @param {object} targetPs   opponent player state (receives penalty)
 */
function lockPiece(ps, targetPs) {
  // TODO:
  // 1. stamp current piece into ps.board
  // 2. detect & collect full rows
  // 3. clear rows (splice + unshift empty row)
  // 4. update score (SCORE_TABLE, COMBO_MULTIPLIER)
  // 5. update level (every 10 lines → level++)
  // 6. update combo counter, show combo toast
  // 7. if lines cleared ≥ 1, schedule penalty send to targetPs
  // 8. trigger board-flash animation
  // 9. spawn next piece
}

/**
 * Receives pending garbage / penalty lines into a player's board.
 * @param {object} ps  the victim player state
 */
function receivePenalty(ps) {
  // TODO: based on STATE.penaltyType + ps.pendingLines,
  //       apply garbage rows, mirror fx, gravity fx, or blind fx
}

/**
 * Adds `count` garbage lines to the bottom of ps.board.
 * Garbage lines have one random hole per row.
 * @param {object} ps
 * @param {number} count
 */
function addGarbageLines(ps, count) {
  // TODO: push rows off top, inject count rows with random hole
}


// ──────────────────────────────────────────────────────────────
// HOLD
// ──────────────────────────────────────────────────────────────

/** Swaps current piece with held piece (or spawns from next). */
function holdPiece(ps) {
  // TODO: guard holdUsed flag, swap ps.held ↔ ps.current
}


// ──────────────────────────────────────────────────────────────
// LEVEL / SPEED
// ──────────────────────────────────────────────────────────────

/** Returns drop interval in ms for a given level (Tetris guideline). */
function gravityIntervalForLevel(level) {
  // TODO: return Math.max(50, 1000 * Math.pow(0.8 - (level - 1) * 0.007, level - 1))
  return 1000;
}


// ──────────────────────────────────────────────────────────────
// HEALTH SYSTEM
// ──────────────────────────────────────────────────────────────

/**
 * Applies damage to a player based on lines topped-out.
 * Health depletes; at 0 the opponent wins.
 */
function applyDamage(ps, amount) {
  // TODO: reduce ps.health, clamp to 0, check isAlive
}

/** Updates health bar DOM element to reflect current health. */
function updateHealthBar(side) {
  // TODO: set DOM.playerHealthFill / aiHealthFill width%
  // add is-danger class below 25%
}


// ──────────────────────────────────────────────────────────────
// RENDERING — MAIN BOARD
// ──────────────────────────────────────────────────────────────

/**
 * Renders a board + ghost + current piece onto a canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ps   player state
 */
function renderBoard(ctx, ps) {
  // TODO:
  // 1. clear canvas (ctx.clearRect)
  // 2. draw board cells (ctx.fillRect per locked cell)
  // 3. draw ghost piece (semi-transparent)
  // 4. draw current piece
  // 5. draw ink border highlight on each cell (small inset)
}

/** Renders a single tetromino cell with cartoon highlight. */
function drawCell(ctx, x, y, color, size) {
  // TODO: fillRect for base color, lighter top-left corner,
  //       darker bottom-right, small inset border shine
}

/** Renders a mini piece preview (next/hold) on a small canvas. */
function renderMiniPiece(ctx, type, canvasW, canvasH) {
  // TODO: center the piece shape on the mini canvas using MINI_CELL
}


// ──────────────────────────────────────────────────────────────
// RENDERING — BACKGROUND STARS
// ──────────────────────────────────────────────────────────────

/** Initializes background stars on #bg-canvas. */
function initBgStars() {
  // TODO: resize canvas to window, create ~120 star objects
  //       { x, y, r, speed, opacity, twinklePhase }
}

/** Animates background stars (parallax drift + twinkle). */
function animateBgStars(timestamp) {
  // TODO: clear, update positions, draw each star as a filled circle
}


// ──────────────────────────────────────────────────────────────
// RENDERING — PENALTY PARTICLES
// ──────────────────────────────────────────────────────────────

/**
 * Spawns penalty block particles that gather in the center then
 * launch toward the opponent.
 *
 * Phase 1 (gather ~800ms): blocks fly from board edge to center lane
 * Phase 2 (delay ~300ms):  blocks pulse in the center (pending attack)
 * Phase 3 (launch ~500ms): blocks whoosh across to opponent board
 *
 * @param {string} fromSide  'player' | 'ai'
 * @param {number} lineCount  number of penalty lines
 * @param {string} type       penalty type
 */
function spawnPenaltyParticles(fromSide, lineCount, type) {
  // TODO: create DOM .penalty-particle elements, set CSS vars
  //       --tx, --ty, --lx, --ly, --fx, --fy for each phase,
  //       append to #particle-canvas parent, clean up on animationend
}

/** Updates attack queue visualization in the battle zone. */
function updateAttackQueueViz(side, count, type) {
  // TODO: populate #player-attack-viz / #ai-attack-viz with
  //       .atk-block elements matching count and type
}

/** Clears attack queue viz after launch. */
function clearAttackQueueViz(side) {
  // TODO: empty the viz container
}


// ──────────────────────────────────────────────────────────────
// UI UPDATES
// ──────────────────────────────────────────────────────────────

/** Refreshes all score/level/lines DOM elements for a side. */
function updateStatsUI(side) {
  // TODO: set DOM.playerScore/aiScore etc. innerText values,
  //       trigger .is-popping animation class on score change
}

/** Shows or hides the combo toast for a side. */
function showComboToast(side, count) {
  // TODO: set count text, data-hidden="false", auto-hide after 1.5s
}

/** Hides combo toast. */
function hideComboToast(side) {
  // TODO: set data-hidden="true"
}

/** Shows AI t-bag speech bubble with a random phrase. */
function showTbag() {
  // TODO: pick random TBAG_PHRASES, set tbagText, data-hidden="false"
  //       auto-hide after 2.2s, apply tbag-bounce animation
}

/** Sets battle status banner text. */
function setBattleStatus(text) {
  DOM.battleStatusText.textContent = text;
}

/** Flashes the line-clear overlay on a board. */
function flashBoard(side) {
  const el = side === 'player' ? DOM.playerFlash : DOM.aiFlash;
  el.classList.remove('is-flashing');
  void el.offsetWidth; // reflow to restart animation
  el.classList.add('is-flashing');
  el.addEventListener('animationend', () => el.classList.remove('is-flashing'), { once: true });
}

/** Applies board shake to a wrapper. */
function shakeBoard(side) {
  const el = side === 'player' ? DOM.playerBoardWrapper : DOM.aiBoardWrapper;
  el.classList.remove('is-shaking');
  void el.offsetWidth;
  el.classList.add('is-shaking');
  el.addEventListener('animationend', () => el.classList.remove('is-shaking'), { once: true });
}

/** Shows / hides a screen overlay. */
function showScreen(name) {
  const screens = ['startScreen', 'resultScreen', 'pauseScreen', 'countdownScreen'];
  screens.forEach(s => {
    DOM[s].dataset.hidden = (s === name + 'Screen') ? 'false' : 'true';
  });
}

/** Shows all game elements (hides all overlays). */
function showGame() {
  ['startScreen','resultScreen','pauseScreen','countdownScreen'].forEach(s => {
    DOM[s].dataset.hidden = 'true';
  });
}


// ──────────────────────────────────────────────────────────────
// COUNTDOWN SEQUENCE
// ──────────────────────────────────────────────────────────────

/**
 * Runs 3-2-1-GO! countdown, then calls `onDone`.
 * @param {Function} onDone
 */
function runCountdown(onDone) {
  // TODO: show #countdown-screen, cycle through 3/2/1/GO!
  //       with ~900ms per beat, then call onDone()
}


// ──────────────────────────────────────────────────────────────
// GAME LOOP
// ──────────────────────────────────────────────────────────────

let _rAFid = null;

/**
 * Main game loop — called every animation frame.
 * @param {number} timestamp  rAF timestamp
 */
function gameLoop(timestamp) {
  // TODO:
  // 1. Calculate delta time
  // 2. Player gravity: if enough ms elapsed, softDrop(STATE.player)
  //    — if can't drop, lockPiece
  // 3. AI gravity: same for STATE.ai
  // 4. Apply pending FX timers (fxTimer countdown)
  // 5. Receive pending penalties
  // 6. renderBoard(CTX.player, STATE.player)
  // 7. renderBoard(CTX.ai, STATE.ai)
  // 8. renderMiniPiece for hold/next canvases
  // 9. animateBgStars(timestamp)
  // 10. Check win/lose conditions
  // 11. requestAnimationFrame(gameLoop)

  _rAFid = requestAnimationFrame(gameLoop);
}

/** Starts the game loop. */
function startLoop() {
  if (_rAFid) cancelAnimationFrame(_rAFid);
  STATE.lastTime = performance.now();
  _rAFid = requestAnimationFrame(gameLoop);
}

/** Stops the game loop. */
function stopLoop() {
  if (_rAFid) {
    cancelAnimationFrame(_rAFid);
    _rAFid = null;
  }
}


// ──────────────────────────────────────────────────────────────
// AI ENGINE
// ──────────────────────────────────────────────────────────────

let _aiThinkTimer = null;

/**
 * AI decision cycle — picks the best placement for the current piece.
 * Runs on a delay based on difficulty.
 */
function aiThink() {
  // TODO:
  // 1. Cancel previous timer
  // 2. Wait AI_DIFFICULTY[STATE.difficulty].thinkDelayMs
  // 3. Enumerate all column+rotation placements
  // 4. Score each placement with evaluateBoard()
  // 5. Apply random mistake based on mistakeRate
  // 6. Execute moves: horizontal moves + hard drop
  // 7. Re-schedule aiThink after piece locked
}

/**
 * Scores a hypothetical board state for the AI heuristic.
 * Lower score = better position.
 * @param {number[][]} board
 * @returns {number}
 */
function evaluateBoard(board) {
  // TODO: weighted sum of:
  // - aggregate height (penalize tall stacks)
  // - complete lines (reward)
  // - holes (heavily penalize)
  // - bumpiness (penalize uneven surface)
  return 0;
}

/**
 * Clones a board and applies a piece placement.
 * @param {number[][]} board
 * @param {number[][]} shape
 * @param {string} color
 * @param {number} x
 * @param {number} y
 * @returns {{ board: number[][], linesCleared: number }}
 */
function simulatePlacement(board, shape, color, x, y) {
  // TODO: deep-clone board, stamp piece, clear lines, return result
  return { board: board, linesCleared: 0 };
}


// ──────────────────────────────────────────────────────────────
// T-BAG SYSTEM
// ──────────────────────────────────────────────────────────────

/**
 * Triggers AI t-bag if appropriate (combo ≥ threshold, or line clear).
 * @param {number} combo   AI's current combo count
 */
function maybeTbag(combo) {
  // TODO: check combo threshold (≥2), random 40% chance,
  //       call showTbag(), avoid spamming (cooldown timer)
}


// ──────────────────────────────────────────────────────────────
// PENALTY / ATTACK SYSTEM
// ──────────────────────────────────────────────────────────────

/**
 * Queues a penalty attack from `fromSide` to opponent.
 * The attack "gathers" visually for GATHER_DELAY ms before landing.
 * @param {string} fromSide  'player' | 'ai'
 * @param {number} linesCleared
 * @param {number} combo
 */
function queuePenaltyAttack(fromSide, linesCleared, combo) {
  // TODO:
  // 1. Calculate penalty line count from PENALTY_LINES + combo bonus
  // 2. Update attack queue viz
  // 3. Spawn particles (spawnPenaltyParticles)
  // 4. After ~1100ms (gather delay), deliver penalty to opponent
  //    (addGarbageLines or set activeFx based on STATE.penaltyType)
  // 5. Shake opponent board
  // 6. Clear attack queue viz
}

/**
 * Delivers a queued attack to the target side.
 * @param {string} toSide
 * @param {number} lineCount
 */
function deliverPenalty(toSide, lineCount) {
  // TODO: apply penalty based on STATE.penaltyType to target player state
}


// ──────────────────────────────────────────────────────────────
// INPUT HANDLING
// ──────────────────────────────────────────────────────────────

// DAS (Delayed Auto Shift) and ARR (Auto Repeat Rate) state
const INPUT = {
  left:   false,
  right:  false,
  dasTimer: null,
  arrTimer: null,
  DAS: 170,  // ms before auto-repeat kicks in
  ARR: 50,   // ms between repeated moves
};

/**
 * Handles keydown for player input.
 * Implements DAS/ARR for horizontal movement.
 * @param {KeyboardEvent} e
 */
function onKeyDown(e) {
  if (STATE.phase !== 'playing') {
    if (e.key === 'Enter' || e.key === ' ') onStartBtn();
    return;
  }

  // TODO: switch on e.key:
  // ArrowLeft / ArrowRight → moveHorizontal with DAS/ARR
  // ArrowUp / x / X        → tryRotate(STATE.player, 1)
  // z / Z                  → tryRotate(STATE.player, -1)
  // ArrowDown              → softDrop(STATE.player)
  // ' ' (Space)            → hardDrop(STATE.player)
  // c / C / Shift          → holdPiece(STATE.player)
  // p / P / Escape         → togglePause()
}

/** Handles keyup to stop DAS/ARR. */
function onKeyUp(e) {
  // TODO: clear DAS/ARR timers on left/right release
}

/** Wires up all input listeners. */
function bindInputs() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup',   onKeyUp);

  // Penalty type buttons
  DOM.penaltyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.penaltyType = btn.dataset.penalty;
      DOM.penaltyBtns.forEach(b => b.classList.remove('penalty-btn--active'));
      btn.classList.add('penalty-btn--active');
    });
  });

  // Difficulty buttons (in-game)
  DOM.diffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.difficulty = parseInt(btn.dataset.difficulty, 10);
      DOM.diffBtns.forEach(b => b.classList.remove('diff-btn--active'));
      btn.classList.add('diff-btn--active');
    });
  });

  // Difficulty buttons (start screen)
  DOM.diffBtnsStart.forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.difficulty = parseInt(btn.dataset.difficulty, 10);
      DOM.diffBtnsStart.forEach(b => b.classList.remove('diff-btn--active'));
      btn.classList.add('diff-btn--active');
    });
  });

  // Screen buttons
  DOM.startBtn.addEventListener('click', onStartBtn);
  DOM.rematchBtn.addEventListener('click', onRematch);
  DOM.menuBtn.addEventListener('click', onMenu);
  DOM.resumeBtn.addEventListener('click', onResume);
  DOM.quitBtn.addEventListener('click', onMenu);
}


// ──────────────────────────────────────────────────────────────
// GAME FLOW
// ──────────────────────────────────────────────────────────────

/** Called when the PLAY! button is pressed. */
function onStartBtn() {
  if (STATE.phase !== 'start') return;
  startGame();
}

/** Resets state and starts a fresh game. */
function startGame() {
  // TODO:
  // 1. Reset STATE.player and STATE.ai (createPlayerState)
  // 2. Spawn initial pieces for both
  // 3. Set STATE.phase = 'countdown'
  // 4. runCountdown(() => { STATE.phase = 'playing'; startLoop(); })
  // 5. Activate VS emblem glow
  setBattleStatus('READY?');
  DOM.vsEmblem.classList.add('is-active');
  showScreen('countdown');
  // TODO: full implementation
}

/** Pauses or resumes the game. */
function togglePause() {
  if (STATE.phase === 'playing') {
    STATE.phase = 'paused';
    stopLoop();
    showScreen('pause');
  } else if (STATE.phase === 'paused') {
    onResume();
  }
}

/** Resumes from pause. */
function onResume() {
  if (STATE.phase !== 'paused') return;
  STATE.phase = 'playing';
  showGame();
  startLoop();
}

/**
 * Called when either player's isAlive becomes false.
 * @param {string} winner  'player' | 'ai'
 */
function endGame(winner) {
  STATE.phase = 'result';
  STATE.winner = winner;
  stopLoop();

  const won = winner === 'player';
  DOM.resultText.textContent = won ? 'YOU WIN! 🏆' : 'YOU LOSE 💀';
  DOM.resultSub.textContent  = won ? '완벽한 승리!' : '다음엔 이기자!';
  document.getElementById('result-screen').dataset.result = won ? 'win' : 'lose';

  // TODO: populate result stats tiles
  showScreen('result');
  setBattleStatus(won ? 'PLAYER WINS!' : 'CPU WINS!');
}

/** Rematch — same difficulty, fresh boards. */
function onRematch() {
  STATE.phase = 'start';
  showScreen('start');
  // TODO: full reset
}

/** Return to main menu. */
function onMenu() {
  STATE.phase = 'start';
  stopLoop();
  showScreen('start');
  setBattleStatus('READY?');
}


// ──────────────────────────────────────────────────────────────
// CANVAS RESIZE HANDLER
// ──────────────────────────────────────────────────────────────

/** Resizes background/particle canvases to match the viewport. */
function resizeCanvases() {
  DOM.bgCanvas.width      = window.innerWidth;
  DOM.bgCanvas.height     = window.innerHeight;
  DOM.particleCanvas.width  = window.innerWidth;
  DOM.particleCanvas.height = window.innerHeight;
  // TODO: re-init bg stars after resize
}


// ──────────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────────

function init() {
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);
  bindInputs();
  initBgStars();
  animateBgStars(0); // start bg animation even on title screen

  // Show start screen
  STATE.phase = 'start';
  DOM.startScreen.dataset.hidden = 'false';
  DOM.resultScreen.dataset.hidden = 'true';
  DOM.pauseScreen.dataset.hidden  = 'true';
  DOM.countdownScreen.dataset.hidden = 'true';

  // Continuously animate background while on start screen
  // (gameLoop is NOT running yet)
  function bgLoop(ts) {
    if (STATE.phase === 'start' || STATE.phase === 'result') {
      animateBgStars(ts);
      requestAnimationFrame(bgLoop);
    }
  }
  requestAnimationFrame(bgLoop);
}

// Boot
init();
