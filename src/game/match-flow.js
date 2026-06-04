// ============================================================================
// game/match-flow.js — 대전 화면·게임 흐름 오케스트레이션 (g8)
//
// 시작 화면 → 난이도 선택 → 카운트다운 → 플레이 → 일시정지 → 승/패(KO) → 리매치
// 의 전체 플로우를 하나의 상태기로 묶는다. 두 GameSession(플레이어·AI)과
// VersusController는 "재사용"만 하며, 이 모듈은 그 위에서 전역 씬(scene) 오버레이로
// 화면 전환과 흐름을 조립한다.
//
// 경계(grain-8):
//  · 게임 규칙/스코어/콤보/공격은 엔진(g3)·versus(g7)에만. 여기서는 엔진 이벤트를
//    "구독"(TOPOUT)해 승패를 가리고, 표시(씬/HUD)와 흐름(freeze/unfreeze)만 한다.
//  · 모든 시각 값은 tokens.css의 var(--token)을 소비하는 CSS 클래스로만 — JS는
//    상태 클래스/텍스트만 토글한다(색·시간 하드코딩 금지).
//  · 보드를 멈추는 것은 GameSession.setPaused(엔진 pause 위임)로만. 상태 변형 없음.
//
// UI 카피 톤: 기존 grain(g1~g7)과 일관된 "네온 아케이드" — 짧고 강한 영문 대문자
// 캡션. 결정 근거는 docs/recording.md(g8) 참조.
// ============================================================================

import { EVENTS } from '../engine/index.js';
import { DIFFICULTY_ORDER } from '../ai/difficulty.js';

// --- 흐름 상태 ---
const STATE = Object.freeze({
  TITLE: 'title',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  RESULT: 'result',
});

// --- 카운트다운 필(feel) 타이밍 (감각값 — 디자인 토큰 아님, AI 타이밍과 동일 분류) ---
const COUNT_STEP_MS = 760; // 3·2·1 각 단계 유지 시간
const FIGHT_HOLD_MS = 540; // "FIGHT!" 유지 시간 후 개시

// 난이도 → UI 라벨/플레이버(카피 톤의 단일 출처). 키는 difficulty.js와 일치.
const DIFFICULTY_LABELS = Object.freeze({
  easy: { label: 'EASY', tag: 'WARM-UP BOT' },
  medium: { label: 'NORMAL', tag: 'FAIR FIGHT' },
  hard: { label: 'HARD', tag: 'NO MERCY' },
});

// 조작 안내(아케이드 캡션). 시작/일시정지 화면 공용.
const CONTROLS_HINT =
  'MOVE ◀ ▶ · ROTATE ▲ / Z · SOFT ▼ · HARD ␣ · HOLD C · PAUSE P';

/** 작은 DOM 빌더(클래스/내용). */
function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

export class MatchFlow {
  /**
   * @param {object} cfg
   * @param {HTMLElement} cfg.scene                전역 씬 오버레이 루트
   * @param {import('./game-session.js').GameSession} cfg.player  플레이어 세션
   * @param {import('./game-session.js').GameSession} cfg.ai      AI 세션
   * @param {import('../versus/index.js').VersusController} [cfg.versus]  대전 컨트롤러(선택)
   * @param {string} [cfg.defaultDifficulty='medium']  초기 선택 난이도
   */
  constructor(cfg) {
    this.scene = cfg.scene;
    this.player = cfg.player;
    this.ai = cfg.ai;
    this.versus = cfg.versus || null;
    this.difficulty = cfg.defaultDifficulty || 'medium';

    this.state = STATE.TITLE;
    this._gen = 0; // 카운트다운 등 비동기 타이머 무효화용 세대 카운터
    this._timer = null;
    this._matchOver = false;

    // 연출/사운드(g9) 구독 훅(규칙 비변경, 표시/오디오용):
    //   onFlow('state', state) · onFlow('count', {text,isFight}) ·
    //   onFlow('result', {playerWon}) · onFlow('select', name)
    this.onFlow = cfg.onFlow || null;

    // 일시정지/재시작 키를 플레이어 세션(키보드 보유) 위에서 위임받는다.
    this.player.onPauseKey = () => this.handlePauseKey();
    this.player.onRestartKey = () => this.handleRestartKey();
  }

  /** 부트스트랩: 보드를 띄워(얼린 상태) 두고 시작 화면을 연다. */
  init() {
    // 보드 렌더 루프를 가동하되 즉시 얼린다 — 시작 화면 뒤로 아레나가 비친다.
    this.player.start();
    this.ai.start();
    this.player.setPaused(true);
    this.ai.setPaused(true);

    // 승패 판정: 어느 보드든 TOPOUT 하면 매치 종료. 엔진 인스턴스는 재시작에도
    // 유지되므로 한 번만 구독한다(매치 내 중복 처리는 _matchOver 가드).
    this.player.engine.on(EVENTS.TOPOUT, () => this._endMatch(false));
    this.ai.engine.on(EVENTS.TOPOUT, () => this._endMatch(true));

    this.showTitle();
    return this;
  }

  // ---- 상태 전환 ----

  _setState(state) {
    this.state = state;
    this.scene.className = `scene scene--${state}`;
    this.scene.hidden = state === STATE.PLAYING;
    if (this.onFlow) this.onFlow('state', state);
  }

  _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /** 진행 중인 비동기 시퀀스(카운트다운)를 무효화한다. */
  _invalidate() {
    this._gen += 1;
    this._clearTimer();
  }

  // ---- 시작 화면 ----

  showTitle() {
    this._invalidate();
    this._matchOver = false;
    this._clearVictory();
    this._setState(STATE.TITLE);
    this._renderTitle();
  }

  _renderTitle() {
    this.scene.replaceChildren();
    const card = el('div', 'scene-card scene-card--title');

    card.appendChild(el('p', 'scene__brand', 'NEON BLITZ'));
    card.appendChild(el('p', 'scene__tagline', 'VS A.I. DUEL'));

    const picker = el('div', 'difficulty');
    picker.appendChild(el('p', 'difficulty__label', 'SELECT RIVAL'));
    const opts = el('div', 'difficulty__options', '');
    for (const name of DIFFICULTY_ORDER) {
      const meta = DIFFICULTY_LABELS[name] || { label: name.toUpperCase(), tag: '' };
      const btn = el(
        'button',
        'btn btn--ghost difficulty__opt',
        `<span class="difficulty__opt-name">${meta.label}</span>` +
          `<span class="difficulty__opt-tag">${meta.tag}</span>`
      );
      btn.type = 'button';
      btn.dataset.diff = name;
      btn.setAttribute('aria-pressed', String(name === this.difficulty));
      btn.classList.toggle('is-selected', name === this.difficulty);
      btn.addEventListener('click', () => this._selectDifficulty(name));
      opts.appendChild(btn);
    }
    picker.appendChild(opts);
    card.appendChild(picker);

    const start = el('button', 'btn btn--primary scene__cta', 'ENTER THE GRID');
    start.type = 'button';
    start.addEventListener('click', () => this.beginMatch());
    card.appendChild(start);

    card.appendChild(el('p', 'scene__hint', CONTROLS_HINT));

    this.scene.appendChild(card);
    // 키보드 접근성: 시작 버튼에 포커스(Enter로도 시작 가능).
    start.focus();
  }

  _selectDifficulty(name) {
    this.difficulty = name;
    this.ai.setAIDifficulty(name);
    if (this.onFlow) this.onFlow('select', name); // 선택 확인음(g9)
    // 선택 토글만 갱신(DOM 재구성 없이 마이크로 인터랙션 유지).
    const btns = this.scene.querySelectorAll('.difficulty__opt');
    btns.forEach((b) => {
      const on = b.dataset.diff === name;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // ---- 매치 개시 / 카운트다운 ----

  beginMatch() {
    this._invalidate();
    this._matchOver = false;
    this._clearVictory();

    // 두 보드를 새 판으로(versus 수신 큐·예고는 onRestart 훅이 초기화).
    this.player.restart();
    this.ai.restart();
    this.ai.setAIDifficulty(this.difficulty);

    // 카운트다운 동안 얼려 둔다 — 보드/첫 피스는 보이되 진행은 멈춤.
    this.player.setPaused(true);
    this.ai.setPaused(true);

    this._runCountdown(() => this._go());
  }

  _runCountdown(onDone) {
    const seq = ['3', '2', '1', 'FIGHT!'];
    const gen = ++this._gen;
    this._clearTimer();
    this._setState(STATE.COUNTDOWN);

    let i = 0;
    const tick = () => {
      if (gen !== this._gen) return; // 무효화된 시퀀스
      if (i >= seq.length) {
        onDone();
        return;
      }
      const isFight = i === seq.length - 1;
      this._renderCountdown(seq[i], isFight);
      i += 1;
      this._timer = setTimeout(tick, isFight ? FIGHT_HOLD_MS : COUNT_STEP_MS);
    };
    tick();
  }

  _renderCountdown(text, isFight) {
    this.scene.replaceChildren();
    const num = el('span', `countdown__num${isFight ? ' countdown__num--go' : ''}`, text);
    // animation 재생을 위해 매 단계 새 요소를 넣는다(재구성 = 리트리거).
    this.scene.appendChild(num);
    if (this.onFlow) this.onFlow('count', { text, isFight });
  }

  _go() {
    // 카운트다운이 무효화됐다면(예: 메뉴로 이탈) 개시하지 않는다.
    this.player.setPaused(false);
    this.ai.setPaused(false);
    this._setState(STATE.PLAYING);
    // 플레이어 보드에 포커스(키 입력 수신).
    if (this.player.cfg.canvas) this.player.cfg.canvas.focus();
  }

  // ---- 키 위임(플레이어 키보드 위에서) ----

  handlePauseKey() {
    if (this.state === STATE.PLAYING) this.pause();
    else if (this.state === STATE.PAUSED) this.resume();
  }

  handleRestartKey() {
    // 시작/결과 화면에서 Enter/R → (재)개시. 플레이 중에는 오발 방지로 무시.
    if (this.state === STATE.TITLE || this.state === STATE.RESULT) this.beginMatch();
  }

  // ---- 일시정지 ----

  pause() {
    this._invalidate();
    this.player.setPaused(true);
    this.ai.setPaused(true);
    this._setState(STATE.PAUSED);
    this._renderPause();
  }

  resume() {
    // 공정성: 즉시 복귀 대신 짧은 카운트다운으로 재개.
    this._runCountdown(() => this._go());
  }

  _renderPause() {
    this.scene.replaceChildren();
    const card = el('div', 'scene-card scene-card--pause');
    card.appendChild(el('p', 'scene__status', 'PAUSED'));
    card.appendChild(el('p', 'scene__tagline scene__tagline--sm', 'TAKE A BREATH'));

    const actions = el('div', 'scene__actions');
    const resume = el('button', 'btn btn--primary', 'RESUME');
    resume.type = 'button';
    resume.addEventListener('click', () => this.resume());
    const quit = el('button', 'btn btn--ghost', 'QUIT TO MENU');
    quit.type = 'button';
    quit.addEventListener('click', () => this.showTitle());
    actions.appendChild(resume);
    actions.appendChild(quit);
    card.appendChild(actions);

    card.appendChild(el('p', 'scene__hint', CONTROLS_HINT));
    this.scene.appendChild(card);
    resume.focus();
  }

  // ---- 매치 종료 / 결과(KO) ----

  /** @param {boolean} playerWon  플레이어가 이겼는가(AI 탑아웃이면 true). */
  _endMatch(playerWon) {
    if (this._matchOver) return; // 동일 매치 중복 처리 방지
    if (this.state === STATE.TITLE) return; // 시작 화면 프리뷰 중 보호
    this._matchOver = true;
    this._invalidate();

    // 두 보드 정지(승자 보드는 아직 진행 중일 수 있다).
    this.player.setPaused(true);
    this.ai.setPaused(true);

    // 승자 보드 축하 글로우(패자 보드는 엔진 TOPOUT → effects.triggerKO가 이미 연출).
    const winner = playerWon ? this.player : this.ai;
    if (winner.cfg.surface) winner.cfg.surface.classList.add('fx-victory');

    this._setState(STATE.RESULT);
    // KO 사운드/연출 구독 훅(승패 정보 포함). _setState('result')보다 뒤에 알려
    // 오디오가 BGM 정지 후 KO 스팅어를 울릴 수 있게 한다.
    if (this.onFlow) this.onFlow('result', { playerWon });
    this._renderResult(playerWon);
  }

  _renderResult(playerWon) {
    this.scene.replaceChildren();
    const card = el('div', `scene-card scene-card--result ${playerWon ? 'is-win' : 'is-lose'}`);

    card.appendChild(el('span', 'result__ko', 'K.O.'));
    card.appendChild(
      el('p', 'result__verdict', playerWon ? 'VICTORY' : 'DEFEAT')
    );
    card.appendChild(
      el(
        'p',
        'scene__tagline scene__tagline--sm',
        playerWon ? 'RIVAL CIRCUITS FRIED' : 'THE MACHINE WINS THIS ROUND'
      )
    );

    // 최종 스탯(엔진 스냅샷 — 표시 전용).
    const ps = this.player.engine.snapshot();
    const as = this.ai.engine.snapshot();
    card.appendChild(this._buildScoreboard(ps, as));

    const actions = el('div', 'scene__actions');
    const again = el('button', 'btn btn--primary', 'REMATCH');
    again.type = 'button';
    again.addEventListener('click', () => this.beginMatch());
    const menu = el('button', 'btn btn--ghost', 'MAIN MENU');
    menu.type = 'button';
    menu.addEventListener('click', () => this.showTitle());
    actions.appendChild(again);
    actions.appendChild(menu);
    card.appendChild(actions);

    card.appendChild(el('p', 'scene__hint', 'PRESS ENTER FOR REMATCH'));
    this.scene.appendChild(card);
    again.focus();
  }

  /** 양 진영 최종 스탯 표(스코어/라인/레벨). 표시 전용. */
  _buildScoreboard(ps, as) {
    const score = (n) => String(n | 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const wrap = el('div', 'scoreboard');
    const rows = [
      ['SCORE', score(ps.score), score(as.score)],
      ['LINES', String(ps.lines), String(as.lines)],
      ['LEVEL', String(ps.level), String(as.level)],
    ];
    wrap.appendChild(el('span', 'scoreboard__head scoreboard__head--you', 'YOU'));
    wrap.appendChild(el('span', 'scoreboard__head', ''));
    wrap.appendChild(el('span', 'scoreboard__head scoreboard__head--ai', 'A.I.'));
    for (const [label, you, ai] of rows) {
      wrap.appendChild(el('span', 'scoreboard__val scoreboard__val--you', you));
      wrap.appendChild(el('span', 'scoreboard__label', label));
      wrap.appendChild(el('span', 'scoreboard__val scoreboard__val--ai', ai));
    }
    return wrap;
  }

  _clearVictory() {
    if (this.player.cfg.surface) this.player.cfg.surface.classList.remove('fx-victory');
    if (this.ai.cfg.surface) this.ai.cfg.surface.classList.remove('fx-victory');
  }
}

export { STATE };
