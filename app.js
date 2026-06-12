/* ===== 상태 관리 ===== */
const STORAGE_KEY = 'free-board-posts';

function loadPosts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function savePosts(posts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

let posts = loadPosts();
let currentPostId = null;

/* ===== 유틸리티 ===== */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const ANONYMOUS_NAMES = [
  '익명의 고양이', '익명의 강아지', '익명의 판다',
  '익명의 여우', '익명의 토끼', '익명의 곰', '익명의 다람쥐'
];

function randomName() {
  return ANONYMOUS_NAMES[Math.floor(Math.random() * ANONYMOUS_NAMES.length)];
}

function relativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금 전';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(timestamp).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ===== DOM 참조 ===== */
const backBtn = document.getElementById('backBtn');
const headerTitle = document.getElementById('headerTitle');
const writeActionBtn = document.getElementById('writeActionBtn');
const listView = document.getElementById('listView');
const writeView = document.getElementById('writeView');
const detailView = document.getElementById('detailView');
const postList = document.getElementById('postList');
const emptyState = document.getElementById('emptyState');
const writeForm = document.getElementById('writeForm');
const titleInput = document.getElementById('titleInput');
const contentInput = document.getElementById('contentInput');
const charCount = document.getElementById('charCount');
const postDetail = document.getElementById('postDetail');
const commentList = document.getElementById('commentList');
const commentCountEl = document.getElementById('commentCount');
const commentForm = document.getElementById('commentForm');
const commentInput = document.getElementById('commentInput');

/* ===== 뷰 전환 ===== */
const views = { list: listView, write: writeView, detail: detailView };

function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'list') {
    headerTitle.textContent = '자유게시판';
    backBtn.classList.remove('visible');
    writeActionBtn.classList.remove('hidden');
  } else if (name === 'write') {
    headerTitle.textContent = '글쓰기';
    backBtn.classList.add('visible');
    writeActionBtn.classList.add('hidden');
    titleInput.focus();
  } else if (name === 'detail') {
    headerTitle.textContent = '게시글';
    backBtn.classList.add('visible');
    writeActionBtn.classList.add('hidden');
  }
}

/* ===== PostCard 렌더링 ===== */
function renderPostCard(post) {
  const commentCnt = (post.comments || []).length;
  return `
    <article class="post-card" data-id="${post.id}" role="button" tabindex="0" aria-label="${escapeHtml(post.title)} 게시글">
      <h2 class="post-card-title">${escapeHtml(post.title)}</h2>
      ${post.content ? `<p class="post-card-preview">${escapeHtml(post.content)}</p>` : ''}
      <div class="post-card-meta">
        <span class="post-card-author">${escapeHtml(post.author)}</span>
        <span class="post-card-dot"></span>
        <span class="post-card-time">${relativeTime(post.createdAt)}</span>
        ${commentCnt > 0 ? `
          <span class="post-card-comment">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            ${commentCnt}
          </span>
        ` : ''}
      </div>
    </article>
  `;
}

function renderPostList() {
  if (posts.length === 0) {
    postList.innerHTML = '';
    emptyState.classList.add('visible');
  } else {
    emptyState.classList.remove('visible');
    postList.innerHTML = [...posts].reverse().map(renderPostCard).join('');
    postList.querySelectorAll('.post-card').forEach(card => {
      card.addEventListener('click', () => openPost(card.dataset.id));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') openPost(card.dataset.id);
      });
    });
  }
}

/* ===== PostDetail 렌더링 ===== */
function renderPostDetail(post) {
  postDetail.innerHTML = `
    <h1 class="post-detail-title">${escapeHtml(post.title)}</h1>
    <div class="post-detail-meta">
      <span class="post-detail-author">${escapeHtml(post.author)}</span>
      <span class="post-detail-dot"></span>
      <span class="post-detail-time">${relativeTime(post.createdAt)}</span>
    </div>
    <p class="post-detail-body">${escapeHtml(post.content)}</p>
  `;
}

/* ===== CommentItem 렌더링 ===== */
function renderComments(post) {
  const comments = post.comments || [];
  commentCountEl.textContent = `댓글 ${comments.length}`;

  if (comments.length === 0) {
    commentList.innerHTML = `
      <p style="padding: var(--space-xl) 0; text-align: center; color: var(--text-tertiary); font-size: var(--size-sm);">
        아직 댓글이 없어요
      </p>
    `;
    return;
  }

  commentList.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div class="comment-item-header">
        <span class="comment-author">${escapeHtml(c.author)}</span>
        <span class="comment-dot"></span>
        <span class="comment-time">${relativeTime(c.createdAt)}</span>
      </div>
      <p class="comment-body">${escapeHtml(c.content)}</p>
    </div>
  `).join('');
}

/* ===== 액션 ===== */
function openPost(id) {
  const post = posts.find(p => p.id === id);
  if (!post) return;
  currentPostId = id;
  renderPostDetail(post);
  renderComments(post);
  showView('detail');
}

function submitPost(e) {
  e.preventDefault();
  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !content) return;

  const newPost = {
    id: generateId(),
    title,
    content,
    author: randomName(),
    createdAt: Date.now(),
    comments: []
  };

  posts.push(newPost);
  savePosts(posts);
  writeForm.reset();
  charCount.textContent = '0 / 2000';
  renderPostList();
  showView('list');
}

function submitComment(e) {
  e.preventDefault();
  const content = commentInput.value.trim();
  if (!content || !currentPostId) return;

  const post = posts.find(p => p.id === currentPostId);
  if (!post) return;

  if (!post.comments) post.comments = [];
  post.comments.push({
    id: generateId(),
    content,
    author: randomName(),
    createdAt: Date.now()
  });

  savePosts(posts);
  commentInput.value = '';
  renderComments(post);
  renderPostList();
}

/* ===== 이벤트 바인딩 ===== */
backBtn.addEventListener('click', () => {
  if (writeView.classList.contains('active')) {
    showView('list');
  } else if (detailView.classList.contains('active')) {
    currentPostId = null;
    showView('list');
  }
});

writeActionBtn.addEventListener('click', () => showView('write'));
writeForm.addEventListener('submit', submitPost);
commentForm.addEventListener('submit', submitComment);

contentInput.addEventListener('input', () => {
  charCount.textContent = `${contentInput.value.length} / 2000`;
});

/* ===== 초기 렌더링 ===== */
renderPostList();
showView('list');
