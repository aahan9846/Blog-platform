// server.js
// Express backend for the blog: JWT auth, post CRUD (owner-only edit/
// delete), and comments on posts.
//
// Run locally:  npm install && npm run seed && npm start
// Then visit:   http://localhost:3000

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('./db');
const { requireAuth, JWT_SECRET } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}

function excerpt(content, len = 160) {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > len ? flat.slice(0, len).trim() + '…' : flat;
}

// ===================== Auth =====================

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name, email.toLowerCase(), password_hash);

  const user = { id: info.lastInsertRowid, name, email: email.toLowerCase() };
  res.status(201).json({ token: signToken(user), user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const user = { id: row.id, name: row.name, email: row.email };
  res.json({ token: signToken(user), user });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ===================== Posts =====================
// Reads are public (it's a blog); writes require auth, and edit/delete
// are restricted to the post's own author.

app.get('/api/posts', (req, res) => {
  const rows = db
    .prepare(`
      SELECT posts.id, posts.title, posts.content, posts.created_at, posts.updated_at,
             users.id AS author_id, users.name AS author_name,
             (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) AS comment_count
      FROM posts JOIN users ON users.id = posts.author_id
      ORDER BY posts.id DESC
    `)
    .all();

  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      excerpt: excerpt(r.content),
      created_at: r.created_at,
      updated_at: r.updated_at,
      author: { id: r.author_id, name: r.author_name },
      comment_count: r.comment_count
    }))
  );
});

app.get('/api/posts/:id', (req, res) => {
  const post = db
    .prepare(`
      SELECT posts.*, users.name AS author_name
      FROM posts JOIN users ON users.id = posts.author_id
      WHERE posts.id = ?
    `)
    .get(req.params.id);

  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const comments = db
    .prepare(`
      SELECT comments.id, comments.content, comments.created_at,
             users.id AS author_id, users.name AS author_name
      FROM comments JOIN users ON users.id = comments.author_id
      WHERE comments.post_id = ?
      ORDER BY comments.id ASC
    `)
    .all(post.id);

  res.json({
    id: post.id,
    title: post.title,
    content: post.content,
    created_at: post.created_at,
    updated_at: post.updated_at,
    author: { id: post.author_id, name: post.author_name },
    comments: comments.map((c) => ({
      id: c.id,
      content: c.content,
      created_at: c.created_at,
      author: { id: c.author_id, name: c.author_name }
    }))
  });
});

app.post('/api/posts', requireAuth, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required.' });
  }
  const info = db.prepare('INSERT INTO posts (author_id, title, content) VALUES (?, ?, ?)').run(req.user.id, title, content);
  const created = db.prepare('SELECT * FROM posts WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...created, author: { id: req.user.id, name: req.user.name }, comments: [] });
});

app.put('/api/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.author_id !== req.user.id) return res.status(403).json({ error: 'You can only edit your own posts.' });

  const title = req.body.title ?? post.title;
  const content = req.body.content ?? post.content;

  db.prepare("UPDATE posts SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?").run(title, content, post.id);
  const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id);
  res.json({ ...updated, author: { id: req.user.id, name: req.user.name } });
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.author_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own posts.' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  res.status(204).end();
});

// ===================== Comments =====================

app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment content is required.' });

  const info = db
    .prepare('INSERT INTO comments (post_id, author_id, content) VALUES (?, ?, ?)')
    .run(post.id, req.user.id, content.trim());

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...comment, author: { id: req.user.id, name: req.user.name } });
});

app.delete('/api/comments/:id', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });
  if (comment.author_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own comments.' });

  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  res.status(204).end();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Blog server running at http://localhost:${PORT}`);
});
