import express from 'express';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const SITE_TITLE = process.env.SITE_TITLE || '{{PROJECT_NAME}}';

// --- Database setup ---

const db = new Database('data.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content_md TEXT DEFAULT '',
    content_html TEXT DEFAULT '',
    published INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// --- Markdown to HTML (simple regex-based) ---

function markdownToHtml(md) {
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headers
    .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr>')
    // Blockquote
    .replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>')
    // Unordered list items
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // Images
    .replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1">')
    // Line breaks into paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Wrap list items
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

  return `<p>${html}</p>`;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// --- Admin auth middleware ---

function adminAuth(req, res, next) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/admin_token=([^;]+)/);
  if (match && match[1] === Buffer.from(ADMIN_PASSWORD).toString('base64')) {
    return next();
  }
  // Check body for login
  if (req.body && req.body.password === ADMIN_PASSWORD) {
    res.setHeader('Set-Cookie', `admin_token=${Buffer.from(ADMIN_PASSWORD).toString('base64')}; Path=/admin; HttpOnly; SameSite=Strict`);
    return next();
  }
  return res.status(401).send(adminLoginPage());
}

// --- HTML templates ---

function layout(title, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${SITE_TITLE}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: #333; background: #fafafa; max-width: 720px; margin: 0 auto; padding: 2rem 1rem; }
    header { margin-bottom: 3rem; padding-bottom: 1rem; border-bottom: 2px solid #eee; }
    header h1 a { color: #111; text-decoration: none; }
    header nav { margin-top: 0.5rem; }
    header nav a { color: #666; text-decoration: none; margin-right: 1rem; font-size: 0.9rem; }
    header nav a:hover { color: #111; }
    article { margin-bottom: 2.5rem; }
    article h2 a { color: #111; text-decoration: none; }
    article h2 a:hover { color: #0066cc; }
    article .meta { color: #999; font-size: 0.85rem; margin: 0.3rem 0 1rem; }
    article .content { line-height: 1.8; }
    article .content h1, article .content h2, article .content h3 { margin: 1.5rem 0 0.5rem; }
    article .content p { margin-bottom: 1rem; }
    article .content code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
    article .content blockquote { border-left: 3px solid #ddd; padding-left: 1rem; color: #666; margin: 1rem 0; }
    article .content ul { margin: 1rem 0; padding-left: 2rem; }
    article .content img { max-width: 100%; height: auto; }
    article .content a { color: #0066cc; }
    .read-more { color: #0066cc; text-decoration: none; font-size: 0.9rem; }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #eee; color: #999; font-size: 0.8rem; }
    footer a { color: #999; }
  </style>
</head>
<body>
  <header>
    <h1><a href="/">${SITE_TITLE}</a></h1>
    <nav><a href="/">Home</a><a href="/feed.xml">RSS</a></nav>
  </header>
  <main>${content}</main>
  <footer>&copy; ${new Date().getFullYear()} ${SITE_TITLE} &middot; <a href="/feed.xml">RSS Feed</a></footer>
</body>
</html>`;
}

function adminLoginPage() {
  return layout('Login', `
    <h2>Admin Login</h2>
    <form method="POST" action="/admin" style="margin-top:1rem;">
      <input type="password" name="password" placeholder="Password" style="padding:0.5rem;border:1px solid #ddd;border-radius:4px;width:100%;max-width:300px;margin-bottom:0.5rem;" required>
      <br><button type="submit" style="padding:0.5rem 1.5rem;background:#111;color:#fff;border:none;border-radius:4px;cursor:pointer;">Login</button>
    </form>
  `);
}

// --- App ---

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Home - list published posts
app.get('/', (req, res) => {
  const posts = db.prepare('SELECT * FROM posts WHERE published = 1 ORDER BY created_at DESC').all();
  let content = '';
  if (posts.length === 0) {
    content = '<p style="color:#999;">No posts yet. Check back soon!</p>';
  } else {
    for (const post of posts) {
      const date = new Date(post.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const excerpt = post.content_md.slice(0, 200).replace(/[#*`\[\]]/g, '') + (post.content_md.length > 200 ? '...' : '');
      content += `<article>
        <h2><a href="/post/${post.slug}">${post.title}</a></h2>
        <div class="meta">${date}</div>
        <p>${excerpt}</p>
        <a href="/post/${post.slug}" class="read-more">Read more &rarr;</a>
      </article>`;
    }
  }
  res.send(layout('Home', content));
});

// Single post
app.get('/post/:slug', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!post) return res.status(404).send(layout('Not Found', '<h2>Post not found</h2>'));

  const date = new Date(post.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const content = `<article>
    <h2>${post.title}</h2>
    <div class="meta">${date}</div>
    <div class="content">${post.content_html}</div>
  </article>
  <a href="/" class="read-more">&larr; Back to all posts</a>`;
  res.send(layout(post.title, content));
});

// RSS feed
app.get('/feed.xml', (req, res) => {
  const posts = db.prepare('SELECT * FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT 20').all();
  const items = posts.map(p => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>/post/${p.slug}</link>
      <description><![CDATA[${p.content_html}]]></description>
      <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>
      <guid>/post/${p.slug}</guid>
    </item>`).join('');

  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${SITE_TITLE}</title>
    <description>Posts from ${SITE_TITLE}</description>
    <link>/</link>
    ${items}
  </channel>
</rss>`);
});

// Admin panel
app.get('/admin', adminAuth, (req, res) => {
  const posts = db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all();
  let rows = '';
  for (const p of posts) {
    const status = p.published ? '<span style="color:green;">Published</span>' : '<span style="color:orange;">Draft</span>';
    rows += `<tr>
      <td><a href="/admin/edit/${p.id}">${p.title}</a></td>
      <td>${status}</td>
      <td>${new Date(p.created_at).toLocaleDateString()}</td>
      <td><a href="/admin/edit/${p.id}">Edit</a> | <a href="/admin/delete/${p.id}" onclick="return confirm('Delete?')">Delete</a></td>
    </tr>`;
  }
  const content = `
    <h2>Admin Panel</h2>
    <a href="/admin/new" style="display:inline-block;margin:1rem 0;padding:0.5rem 1rem;background:#111;color:#fff;text-decoration:none;border-radius:4px;">+ New Post</a>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="border-bottom:2px solid #ddd;text-align:left;">
        <th style="padding:0.5rem;">Title</th><th>Status</th><th>Date</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="padding:1rem;color:#999;">No posts yet</td></tr>'}</tbody>
    </table>`;
  res.send(layout('Admin', content));
});

app.post('/admin', adminAuth, (req, res) => {
  res.redirect('/admin');
});

// New post form
app.get('/admin/new', adminAuth, (req, res) => {
  res.send(layout('New Post', postForm()));
});

// Edit post form
app.get('/admin/edit/:id', adminAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).send(layout('Not Found', '<h2>Post not found</h2>'));
  res.send(layout('Edit Post', postForm(post)));
});

function postForm(post = null) {
  return `
    <h2>${post ? 'Edit' : 'New'} Post</h2>
    <form method="POST" action="/admin/posts" style="margin-top:1rem;">
      ${post ? `<input type="hidden" name="id" value="${post.id}">` : ''}
      <div style="margin-bottom:1rem;">
        <label style="display:block;font-weight:bold;margin-bottom:0.3rem;">Title</label>
        <input type="text" name="title" value="${post ? post.title : ''}" style="width:100%;padding:0.5rem;border:1px solid #ddd;border-radius:4px;" required>
      </div>
      <div style="margin-bottom:1rem;">
        <label style="display:block;font-weight:bold;margin-bottom:0.3rem;">Content (Markdown)</label>
        <textarea name="content_md" rows="15" style="width:100%;padding:0.5rem;border:1px solid #ddd;border-radius:4px;font-family:monospace;">${post ? post.content_md : ''}</textarea>
      </div>
      <div style="margin-bottom:1rem;">
        <label><input type="checkbox" name="published" value="1" ${post && post.published ? 'checked' : ''}> Published</label>
      </div>
      <button type="submit" style="padding:0.5rem 1.5rem;background:#111;color:#fff;border:none;border-radius:4px;cursor:pointer;">Save</button>
      <a href="/admin" style="margin-left:1rem;color:#666;">Cancel</a>
    </form>`;
}

// Create/update post
app.post('/admin/posts', adminAuth, (req, res) => {
  const { id, title, content_md, published } = req.body;
  const slug = slugify(title);
  const contentHtml = markdownToHtml(content_md || '');
  const isPublished = published === '1' ? 1 : 0;

  if (id) {
    db.prepare(`UPDATE posts SET title = ?, slug = ?, content_md = ?, content_html = ?, published = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(title, slug, content_md || '', contentHtml, isPublished, id);
  } else {
    const newId = uuidv4();
    db.prepare('INSERT INTO posts (id, title, slug, content_md, content_html, published) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId, title, slug, content_md || '', contentHtml, isPublished);
  }

  res.redirect('/admin');
});

// Delete post
app.get('/admin/delete/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// --- Error handling ---

app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).send(layout('Error', '<h2>Something went wrong</h2>'));
});

// --- Start server ---

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Blog server running on http://127.0.0.1:${PORT}`);
});

// --- Graceful shutdown ---

function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    db.close();
    console.log('Server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
