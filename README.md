# Blog Platform with Comments

A full-stack blogging platform: user registration/login, post CRUD
(create, edit, delete — restricted to the post's own author), and a
comment section on every post, all over a REST API with a SQLite
database. Visitors can browse and read without an account; posting and
commenting require login.

```
blog-project/
├── public/                 frontend (served as static files)
│   ├── index.html           auth, feed, post detail + comments, editor
│   ├── style.css
│   └── script.js
├── middleware/
│   └── auth.js               JWT verification middleware
├── server.js                 Express app + REST API
├── db.js                     SQLite connection + schema
├── seed.js                   demo author with sample posts + a comment
├── package.json
└── .env.example
```

## 1. Run it locally

Requires Node.js 18+.

```bash
npm install
cp .env.example .env      # then edit JWT_SECRET to your own secret
npm run seed                # loads a demo author + a couple of posts
npm start
```

Visit **http://localhost:3000**.

- Click "Browse posts without an account" to read as a guest.
- Sign up (or log in as the seeded demo author —
  **writer@example.com / writer12345**) to write posts and leave comments.

For auto-restart on file changes during development:

```bash
npm run dev
```

## 2. How the pieces fit together

- **Frontend** (`public/`) is plain HTML/CSS/JS — no build step. It
  supports a logged-out "guest" mode (reading only) and a logged-in mode
  (writing posts, commenting, editing/deleting your own content).
- **Backend** (`server.js`) is an Express app serving the frontend and a
  JSON REST API under `/api/*`.
- **Auth**: passwords are hashed with `bcryptjs`; login/register return a
  JWT, sent as `Authorization: Bearer <token>` on every write request.
- **Ownership, not roles**: there's no admin role here — instead, every
  post and comment remembers its `author_id`, and the server checks that
  the logged-in user owns a post/comment before allowing an edit or
  delete (`403 Forbidden` otherwise).
- **Database** (`db.js`) is SQLite via `better-sqlite3`: `users`,
  `posts`, and `comments` (comments cascade-delete when their post is
  deleted).

## 3. API reference

| Method | Route                       | Auth        | Description                            |
|--------|------------------------------|-------------|------------------------------------------|
| POST   | `/api/auth/register`         | —           | Create an account                        |
| POST   | `/api/auth/login`             | —           | Log in, returns a token                  |
| GET    | `/api/auth/me`                | token       | Get the current user                     |
| GET    | `/api/posts`                  | —           | List posts (title, excerpt, author, comment count) |
| GET    | `/api/posts/:id`              | —           | Get one post with its full comment thread|
| POST   | `/api/posts`                  | token       | Create a post                            |
| PUT    | `/api/posts/:id`              | owner       | Update a post                            |
| DELETE | `/api/posts/:id`              | owner       | Delete a post (and its comments)         |
| POST   | `/api/posts/:id/comments`     | token       | Add a comment to a post                  |
| DELETE | `/api/comments/:id`           | owner       | Delete your own comment                  |
| GET    | `/api/health`                 | —           | Health check (used by hosts)             |

Example — create a post, then comment on it:

```bash
POST_ID=$(curl -s -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Hello, world","content":"First post."}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).id")

curl -X POST http://localhost:3000/api/posts/$POST_ID/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content":"Nice first post!"}'
```

## 4. Deploying

This app needs a **persistent Node process** (not a static host), because
it runs Express and reads/writes a SQLite file.

### Option A — Render (recommended, simplest)
1. Push this project to a GitHub repo.
2. On [render.com](https://render.com), create a **New Web Service** from
   that repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add an environment variable `JWT_SECRET` with your own secret. Run
   `npm run seed` once via Render's shell if you want the demo content.
5. Deploy. Render gives you a live URL.

### Option B — Railway
Same idea: connect the repo, set `JWT_SECRET`, it detects `npm start`
automatically.

### Netlify / Vercel note
These platforms are built for static sites and serverless functions, not
a long-running Express server with a local SQLite file. To deploy there,
deploy `public/` as the static site and rewrite `server.js`'s routes as
serverless functions backed by a hosted database (Postgres via Neon or
Supabase, or MongoDB Atlas) instead of SQLite.

## 5. Swapping the database

All database access is isolated in `db.js`, and every query in
`server.js` goes through it. To move to PostgreSQL, MySQL, or MongoDB:
1. Replace `db.js` with a client for that database, keeping the same
   three tables/collections (`users`, `posts`, `comments`).
2. Update the queries in `server.js`'s route handlers to match — route
   paths, request/response shapes, and the frontend don't need to change.
