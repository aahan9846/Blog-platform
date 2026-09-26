// script.js — auth (with guest browsing), post feed/detail, editor, comments.

const el = (id) => document.getElementById(id);

let token = localStorage.getItem('token');
let currentUser = null;
let currentPost = null; // full post + comments currently shown in the detail view

// ===================== Boot =====================

(async function init() {
  if (token) {
    const ok = await fetchMe();
    if (ok) {
      showApp(true);
      switchView('feed');
      return;
    }
  }
  showAuthScreen();
})();

// ===================== API helper =====================

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ===================== Auth =====================

el('auth-toggle').addEventListener('click', () => {
  const showingLogin = !el('login-form').classList.contains('hidden');
  el('login-form').classList.toggle('hidden', showingLogin);
  el('register-form').classList.toggle('hidden', !showingLogin);
  el('auth-title').textContent = showingLogin ? 'Create your account' : 'Welcome back';
  el('auth-toggle').textContent = showingLogin ? 'Already have an account? Log in' : 'Need an account? Sign up';
});

el('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('login-error').textContent = '';
  try {
    const res = await api('/api/auth/login', 'POST', {
      email: el('login-email').value.trim(),
      password: el('login-password').value
    });
    onAuthed(res);
  } catch (err) {
    el('login-error').textContent = err.message;
  }
});

el('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('register-error').textContent = '';
  try {
    const res = await api('/api/auth/register', 'POST', {
      name: el('register-name').value.trim(),
      email: el('register-email').value.trim(),
      password: el('register-password').value
    });
    onAuthed(res);
  } catch (err) {
    el('register-error').textContent = err.message;
  }
});

el('browse-btn').addEventListener('click', () => {
  showApp(false);
  switchView('feed');
});

el('show-login-btn').addEventListener('click', showAuthScreen);
el('comment-login-btn').addEventListener('click', showAuthScreen);

el('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('token');
  token = null;
  currentUser = null;
  showApp(false);
  switchView('feed');
});

function onAuthed({ token: t, user }) {
  token = t;
  currentUser = user;
  localStorage.setItem('token', t);
  showApp(true);
  switchView('feed');
}

async function fetchMe() {
  try {
    const res = await api('/api/auth/me');
    currentUser = res.user;
    return true;
  } catch {
    localStorage.removeItem('token');
    token = null;
    return false;
  }
}

function showAuthScreen() {
  el('auth-screen').classList.remove('hidden');
  el('app-screen').classList.add('hidden');
}

function showApp(loggedIn) {
  el('auth-screen').classList.add('hidden');
  el('app-screen').classList.remove('hidden');
  el('topbar-user').classList.toggle('hidden', !loggedIn);
  el('topbar-guest').classList.toggle('hidden', loggedIn);
  el('user-name').textContent = loggedIn && currentUser ? currentUser.name : '';
}

el('home-link').addEventListener('click', (e) => {
  e.preventDefault();
  switchView('feed');
});

// ===================== View switching =====================

function switchView(view) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  el(`view-${view}`).classList.remove('hidden');
  if (view === 'feed') loadFeed();
}

el('back-to-feed-btn').addEventListener('click', () => switchView('feed'));

// ===================== Feed =====================

async function loadFeed() {
  const feed = el('post-feed');
  feed.innerHTML = '<p class="loading">Loading posts…</p>';
  try {
    const posts = await api('/api/posts');
    if (posts.length === 0) {
      feed.innerHTML = '<p class="loading">No posts yet.</p>';
      return;
    }
    feed.innerHTML = posts.map(renderFeedEntry).join('');
    feed.querySelectorAll('.post-entry').forEach((entry) => {
      entry.addEventListener('click', () => openPost(Number(entry.dataset.id)));
    });
  } catch (err) {
    feed.innerHTML = '<p class="loading">Couldn\'t load posts right now.</p>';
  }
}

function renderFeedEntry(p) {
  return `
    <article class="post-entry" data-id="${p.id}">
      <h2>${escapeHtml(p.title)}</h2>
      <p class="post-excerpt">${escapeHtml(p.excerpt)}</p>
      <div class="post-meta">
        <span class="author">${escapeHtml(p.author.name)}</span>
        <span class="tag">${formatDate(p.created_at)}</span>
        <span class="tag">${p.comment_count} comment${p.comment_count === 1 ? '' : 's'}</span>
      </div>
    </article>
  `;
}

// ===================== Post detail =====================

async function openPost(id) {
  switchViewOnly('post');
  el('post-detail').innerHTML = '<p class="loading">Loading…</p>';
  try {
    currentPost = await api(`/api/posts/${id}`);
    renderPostDetail();
    renderComments();
  } catch (err) {
    el('post-detail').innerHTML = '<p class="loading">Couldn\'t load this post.</p>';
  }
}

// Like switchView, but doesn't trigger loadFeed (used when navigating into the post view).
function switchViewOnly(view) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  el(`view-${view}`).classList.remove('hidden');
}

function renderPostDetail() {
  const p = currentPost;
  const isOwner = currentUser && currentUser.id === p.author.id;
  el('post-detail').innerHTML = `
    <h1>${escapeHtml(p.title)}</h1>
    <div class="post-meta">
      <span class="author">${escapeHtml(p.author.name)}</span>
      <span class="tag">${formatDate(p.created_at)}</span>
    </div>
    <div class="post-body">${escapeHtml(p.content)}</div>
    ${
      isOwner
        ? `<div class="post-owner-actions">
             <button id="edit-post-btn" class="link-btn">Edit post</button>
             <button id="delete-post-inline-btn" class="link-btn" style="color:var(--red)">Delete post</button>
           </div>`
        : ''
    }
  `;
  if (isOwner) {
    el('edit-post-btn').addEventListener('click', () => openEditor(p));
    el('delete-post-inline-btn').addEventListener('click', () => deletePost(p.id));
  }
}

function renderComments() {
  const p = currentPost;
  el('comments-heading').textContent = `Comments (${p.comments.length})`;
  el('comments-list').innerHTML =
    p.comments.length === 0
      ? '<p class="loading">No comments yet.</p>'
      : p.comments.map(renderComment).join('');

  el('comments-list').querySelectorAll('.comment-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteComment(Number(btn.dataset.id)));
  });

  el('comment-form').classList.toggle('hidden', !currentUser);
  el('comment-login-hint').classList.toggle('hidden', !!currentUser);
}

function renderComment(c) {
  const isOwner = currentUser && currentUser.id === c.author.id;
  return `
    <div class="comment">
      <div class="comment-head">
        <span class="comment-author">${escapeHtml(c.author.name)}</span>
        <span class="comment-date">${formatDate(c.created_at)}</span>
      </div>
      <p class="comment-body">${escapeHtml(c.content)}</p>
      ${isOwner ? `<button class="comment-delete" data-id="${c.id}">Delete</button>` : ''}
    </div>
  `;
}

el('comment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const textarea = el('comment-content');
  const content = textarea.value.trim();
  if (!content) return;
  try {
    const comment = await api(`/api/posts/${currentPost.id}/comments`, 'POST', { content });
    currentPost.comments.push(comment);
    renderComments();
    textarea.value = '';
  } catch (err) {
    alert(err.message);
  }
});

async function deleteComment(id) {
  if (!confirm('Delete this comment?')) return;
  try {
    await api(`/api/comments/${id}`, 'DELETE');
    currentPost.comments = currentPost.comments.filter((c) => c.id !== id);
    renderComments();
  } catch (err) {
    alert(err.message);
  }
}

async function deletePost(id) {
  if (!confirm('Delete this post? This cannot be undone.')) return;
  try {
    await api(`/api/posts/${id}`, 'DELETE');
    switchView('feed');
  } catch (err) {
    alert(err.message);
  }
}

// ===================== Editor =====================

el('new-post-btn').addEventListener('click', () => openEditor(null));
el('cancel-post-btn').addEventListener('click', () => {
  if (currentPost) {
    switchViewOnly('post');
  } else {
    switchView('feed');
  }
});

function openEditor(post) {
  el('editor-heading').textContent = post ? 'Edit post' : 'New post';
  el('post-id').value = post ? post.id : '';
  el('post-title').value = post ? post.title : '';
  el('post-content').value = post ? post.content : '';
  el('delete-post-btn').classList.toggle('hidden', !post);
  switchViewOnly('editor');
  el('post-title').focus();
}

el('post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = el('post-id').value;
  const payload = {
    title: el('post-title').value.trim(),
    content: el('post-content').value.trim()
  };
  try {
    const saved = id ? await api(`/api/posts/${id}`, 'PUT', payload) : await api('/api/posts', 'POST', payload);
    await openPost(saved.id);
  } catch (err) {
    alert(err.message);
  }
});

el('delete-post-btn').addEventListener('click', () => {
  const id = el('post-id').value;
  if (id) deletePost(Number(id));
});

// ===================== Helpers =====================

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
