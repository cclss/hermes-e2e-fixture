/* =====================================================
 * TODO LIST APP — Vanilla JS SPA
 * grain-3: CRUD + localStorage + 마이크로 인터랙션
 * grain-1(하드닝): storageAvailable(), save() try-catch, 저장 불가 배너
 *
 * 패턴: 이벤트 위임(event delegation)
 * 의존성: 없음 (순수 Vanilla JS ES2015+)
 * ===================================================== */

'use strict';

// ── 상수 ──────────────────────────────────────────────
const STORAGE_KEY = 'todo-list-items';

// ── DOM 참조 ──────────────────────────────────────────
const form       = document.getElementById('todo-form');
const input      = document.getElementById('todo-input');
const list       = document.getElementById('todo-list');
const emptyState = document.getElementById('empty-state');

// ── 상태 ──────────────────────────────────────────────
let todos = [];

// ── 영속성 ────────────────────────────────────────────

/**
 * localStorage 접근 가능 여부를 테스트-쓰기 후 삭제로 확인한다.
 * Private Browsing(사파리 등) 또는 QuotaExceededError 발생 시 false 반환.
 * @returns {boolean}
 */
function storageAvailable() {
  try {
    const testKey = '__todo_storage_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/** localStorage → 파싱 실패 시 [] 반환 */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** todos 배열 전체를 localStorage에 직렬화 저장. 저장 실패 시 메모리 상태는 유지된다 */
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (e) {
    // Private Browsing / QuotaExceededError — 메모리 상태는 유지되며 저장만 실패
    console.warn('[todo] localStorage 저장 실패:', e);
  }
}

/**
 * 저장 불가 배너를 화면 상단에 한 번만 표시한다.
 * 이미 표시된 경우(hidden이 false) 재호출해도 무시한다.
 */
function showStorageBanner() {
  const banner = document.getElementById('storage-banner');
  if (!banner || !banner.hidden) return;
  banner.hidden = false;
}

// ── XSS 방어 ──────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ── 렌더링 ────────────────────────────────────────────

/**
 * todo 객체 → <li class="todo-item [done]"> 생성
 * @param {{ id: string, text: string, done: boolean }} todo
 * @returns {HTMLLIElement}
 */
function createTodoElement(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item' + (todo.done ? ' done' : '');
  li.dataset.id = todo.id;

  const toggleLabel = todo.done ? '완료 해제' : '완료 표시';
  li.innerHTML =
    `<button class="btn-toggle" type="button" aria-label="${toggleLabel}">✓</button>` +
    `<span class="todo-item__text">${escapeHtml(todo.text)}</span>` +
    `<button class="btn-delete" type="button" aria-label="삭제">✕</button>`;

  return li;
}

/** todos 배열 전체를 list 에 다시 그린다 */
function renderAll() {
  list.innerHTML = '';
  todos.forEach(todo => list.appendChild(createTodoElement(todo)));
  syncEmptyState();
}

/** 빈 상태 메시지 표시 여부 동기화 */
function syncEmptyState() {
  emptyState.hidden = todos.length > 0;
}

// ── CRUD ──────────────────────────────────────────────

/**
 * 새 항목 추가 + slide-in 애니메이션
 * @param {string} text 이미 trim() 된 문자열
 */
function addTodo(text) {
  const todo = {
    id:   String(Date.now()),   // 단조 증가 ID (SPA 단일 탭 기준으로 충분)
    text: text,
    done: false,
  };
  todos.push(todo);
  save();

  const li = createTodoElement(todo);
  li.classList.add('todo-item--entering');
  list.appendChild(li);
  syncEmptyState();

  // 애니메이션 클래스 정리 (한 번만 실행)
  li.addEventListener('animationend', () => {
    li.classList.remove('todo-item--entering');
  }, { once: true });
}

/**
 * 완료 상태 토글 — .done 클래스 즉시 반영 + 저장
 * @param {string} id
 */
function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;

  todo.done = !todo.done;
  save();

  const li = list.querySelector(`[data-id="${id}"]`);
  if (!li) return;

  li.classList.toggle('done', todo.done);

  const btn = li.querySelector('.btn-toggle');
  if (btn) btn.setAttribute('aria-label', todo.done ? '완료 해제' : '완료 표시');
}

/**
 * 항목 삭제 — fade-out 애니메이션 후 DOM·state 제거
 * @param {string} id
 */
function deleteTodo(id) {
  const li = list.querySelector(`[data-id="${id}"]`);
  if (!li) return;

  li.classList.add('todo-item--removing');

  li.addEventListener('animationend', () => {
    todos = todos.filter(t => t.id !== id);
    save();
    li.remove();
    syncEmptyState();
  }, { once: true });
}

// ── 이벤트 위임 ───────────────────────────────────────

/** 목록 내 버튼 클릭을 단일 핸들러로 처리 */
list.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;

  const li = btn.closest('.todo-item');
  if (!li) return;

  const id = li.dataset.id;

  if (btn.classList.contains('btn-toggle')) {
    toggleTodo(id);
  } else if (btn.classList.contains('btn-delete')) {
    deleteTodo(id);
  }
});

/** 폼 제출 — 빈 값 방어 + trim */
form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;          // 빈 값 → 추가하지 않음
  addTodo(text);
  input.value = '';
  input.focus();
});

// ── 초기화 ────────────────────────────────────────────

/** localStorage → 파싱 → 전체 렌더. 저장 불가 환경이면 배너를 먼저 표시한다 */
function init() {
  if (!storageAvailable()) {
    showStorageBanner();
  }
  todos = load();
  renderAll();
}

init();
