'use strict';

/* ─── Data ───────────────────────────────────────────── */

const CHOICES = {
  scissors: { emoji: '✂️', label: '가위', beats: 'paper',    losesTo: 'rock' },
  rock:     { emoji: '🪨', label: '바위', beats: 'scissors', losesTo: 'paper' },
  paper:    { emoji: '📄', label: '보',   beats: 'rock',     losesTo: 'scissors' },
};

const CHOICE_KEYS = Object.keys(CHOICES);

const RESULT_MESSAGES = {
  win:  ['이겼어요! 🎉', '완벽한 선택! ✨', '잘했어요! 👏', '승리! 🏆'],
  lose: ['졌어요… 😓', '아쉽네요! 💪', '다시 도전! 🔥', '한 번 더! 💨'],
  draw: ['무승부! 🤝', '비겼어요~', '동점이에요!', '막상막하!'],
};

/* ─── State ──────────────────────────────────────────── */

const state = {
  playerScore:    0,
  computerScore:  0,
  difficulty:     'easy',
  playerHistory:  [],   // 최근 최대 10회 기록, hard 모드에서 활용
};

/* ─── DOM refs ───────────────────────────────────────── */

const playerScoreEl   = document.getElementById('player-score');
const computerScoreEl = document.getElementById('computer-score');
const playerEmojiEl   = document.getElementById('player-emoji');
const playerLabelEl   = document.getElementById('player-label');
const computerEmojiEl = document.getElementById('computer-emoji');
const computerLabelEl = document.getElementById('computer-label');
const resultBannerEl  = document.getElementById('result-banner');
const resultTextEl    = document.getElementById('result-text');
const resetBtn        = document.getElementById('reset-btn');
const choiceBtns      = document.querySelectorAll('.choice-btn');
const difficultyBtns  = document.querySelectorAll('.difficulty-btn');

/* ─── Computer AI ────────────────────────────────────── */

/**
 * easy   : 40% 확률로 플레이어 선택에 지는 수, 나머지 완전 무작위
 * normal : 완전 무작위
 * hard   : 최근 최대 10회 기록에서 가장 자주 나온 수를 이기는 수 선택
 *          기록이 3회 미만이면 무작위
 */
function getComputerChoice(playerChoice) {
  switch (state.difficulty) {

    case 'easy': {
      if (Math.random() < 0.4) {
        // 플레이어 선택이 이기는 쪽 → 컴퓨터 패배 수
        return CHOICES[playerChoice].beats;
      }
      return CHOICE_KEYS[Math.floor(Math.random() * CHOICE_KEYS.length)];
    }

    case 'normal': {
      return CHOICE_KEYS[Math.floor(Math.random() * CHOICE_KEYS.length)];
    }

    case 'hard': {
      if (state.playerHistory.length < 3) {
        return CHOICE_KEYS[Math.floor(Math.random() * CHOICE_KEYS.length)];
      }
      const recent = state.playerHistory.slice(-10);
      const freq = {};
      recent.forEach(m => { freq[m] = (freq[m] || 0) + 1; });

      // 가장 자주 등장한 플레이어 수를 예측해 그것을 이기는 수 선택
      const predicted = CHOICE_KEYS.reduce(
        (best, k) => ((freq[k] || 0) > (freq[best] || 0) ? k : best),
        CHOICE_KEYS[0],
      );
      return CHOICES[predicted].losesTo;
    }

    default:
      return CHOICE_KEYS[Math.floor(Math.random() * CHOICE_KEYS.length)];
  }
}

/* ─── Game logic ─────────────────────────────────────── */

function getResult(playerChoice, computerChoice) {
  if (playerChoice === computerChoice) return 'draw';
  if (CHOICES[playerChoice].beats === computerChoice) return 'win';
  return 'lose';
}

function pickMessage(result) {
  const pool = RESULT_MESSAGES[result];
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ─── UI updates ─────────────────────────────────────── */

function bumpScore(el) {
  el.classList.remove('bump');
  // 한 프레임 대기 후 다시 추가해 애니메이션 재생
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('bump'));
  });
}

function setChoiceDisplay(emojiEl, labelEl, choice) {
  emojiEl.textContent = CHOICES[choice].emoji;
  labelEl.textContent = CHOICES[choice].label;
  emojiEl.classList.remove('reveal');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => emojiEl.classList.add('reveal'));
  });
}

function resetChoiceDisplay() {
  playerEmojiEl.textContent   = '❓';
  playerLabelEl.textContent   = '선택하세요';
  computerEmojiEl.textContent = '❓';
  computerLabelEl.textContent = '대기중…';
  playerEmojiEl.classList.remove('reveal');
  computerEmojiEl.classList.remove('reveal');
}

function showResult(result, message) {
  resultBannerEl.className = `result-banner state-${result}`;
  resultTextEl.textContent = message;
}

function clearResult() {
  resultBannerEl.className = 'result-banner state-idle';
  resultTextEl.textContent = '';
}

/* ─── Round ──────────────────────────────────────────── */

function playRound(playerChoice) {
  const computerChoice = getComputerChoice(playerChoice);
  const result         = getResult(playerChoice, computerChoice);

  // 기록 (hard 모드 학습용)
  state.playerHistory.push(playerChoice);
  if (state.playerHistory.length > 10) state.playerHistory.shift();

  // 점수 갱신
  if (result === 'win') {
    state.playerScore += 1;
    playerScoreEl.textContent = state.playerScore;
    bumpScore(playerScoreEl);
  } else if (result === 'lose') {
    state.computerScore += 1;
    computerScoreEl.textContent = state.computerScore;
    bumpScore(computerScoreEl);
  }

  // 선택 표시
  setChoiceDisplay(playerEmojiEl,   playerLabelEl,   playerChoice);
  setChoiceDisplay(computerEmojiEl, computerLabelEl, computerChoice);

  // 결과 배너
  showResult(result, pickMessage(result));
}

/* ─── Reset ──────────────────────────────────────────── */

function resetGame() {
  state.playerScore   = 0;
  state.computerScore = 0;
  state.playerHistory = [];

  playerScoreEl.textContent   = '0';
  computerScoreEl.textContent = '0';

  resetChoiceDisplay();
  clearResult();
}

/* ─── Event listeners ────────────────────────────────── */

choiceBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const choice = btn.dataset.choice;
    if (choice) playRound(choice);
  });
});

difficultyBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const level = btn.dataset.level;
    if (!level || level === state.difficulty) return;

    state.difficulty = level;
    state.playerHistory = [];

    difficultyBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 난이도 변경 시 화면 초기화
    resetChoiceDisplay();
    clearResult();
  });
});

resetBtn.addEventListener('click', resetGame);
