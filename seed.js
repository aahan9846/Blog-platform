// seed.js
// Populates a demo author with a couple of posts and comments so the
// platform isn't empty on first run. Run with: npm run seed

const bcrypt = require('bcryptjs');
const db = require('./db');

const demoEmail = 'writer@example.com';
let author = db.prepare('SELECT * FROM users WHERE email = ?').get(demoEmail);

if (!author) {
  const password_hash = bcrypt.hashSync('writer12345', 10);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run('Sam Writer', demoEmail, password_hash);
  author = { id: info.lastInsertRowid };
  console.log(`Seeded demo account — email: ${demoEmail}  password: writer12345`);
}

const postCount = db.prepare('SELECT COUNT(*) AS c FROM posts').get().c;

if (postCount === 0) {
  const insertPost = db.prepare('INSERT INTO posts (author_id, title, content) VALUES (?, ?, ?)');

  const posts = [
    {
      title: 'Starting this blog',
      content:
        'This is the first post on a small blogging platform built with an Express API, a SQLite database, and a plain HTML/CSS/JS frontend.\n\nPosts support basic paragraphs, and readers can leave comments below once they create an account.'
    },
    {
      title: 'Notes on building in public',
      content:
        'One nice thing about a small side project is that you can ship something rough and keep shaping it.\n\nThis post exists mostly to have a second item in the feed, and to give the comment section something to attach to.'
    }
  ];

  const insertMany = db.transaction((rows) => {
    for (const row of rows) insertPost.run(author.id, row.title, row.content);
  });
  insertMany(posts);
  console.log(`Seeded ${posts.length} posts.`);

  const firstPostId = db.prepare('SELECT id FROM posts ORDER BY id ASC LIMIT 1').get().id;
  db.prepare('INSERT INTO comments (post_id, author_id, content) VALUES (?, ?, ?)').run(
    firstPostId,
    author.id,
    'Welcome! Feel free to leave a comment on any post.'
  );
  console.log('Seeded 1 comment.');
}

console.log('Seed complete.');
