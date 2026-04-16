import express from 'express';
import Database from 'better-sqlite3';

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const SITE_TITLE = process.env.SITE_TITLE || '{{PROJECT_NAME}}';
const SITE_DESCRIPTION = process.env.SITE_DESCRIPTION || '{{PROJECT_DESCRIPTION}}';

// --- Database setup ---

const db = new Database('data.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    source TEXT DEFAULT 'landing',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// --- App ---

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Subscribe
app.post('/api/subscribe', (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const existing = db.prepare('SELECT id FROM subscribers WHERE email = ?').get(email);
  if (existing) {
    return res.json({ message: 'You are already on the list!', alreadySubscribed: true });
  }

  db.prepare('INSERT INTO subscribers (email) VALUES (?)').run(email);
  const count = db.prepare('SELECT COUNT(*) as count FROM subscribers').get().count;
  res.status(201).json({ message: 'Welcome aboard!', count });
});

// Subscriber count (public)
app.get('/api/subscribers/count', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM subscribers').get().count;
  res.json({ count });
});

// List subscribers (admin)
app.get('/api/subscribers', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const subscribers = db.prepare('SELECT * FROM subscribers ORDER BY created_at DESC').all();
  res.json({ subscribers, total: subscribers.length });
});

// Landing page
app.get('/', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM subscribers').get().count;
  res.send(landingPage(count));
});

function landingPage(subscriberCount) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${SITE_TITLE}</title>
  <meta name="description" content="${SITE_DESCRIPTION}">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-card: #16161f;
      --border: rgba(255,255,255,0.06);
      --text-primary: #f0f0f5;
      --text-secondary: #8888a0;
      --text-muted: #55556a;
      --accent: #6c5ce7;
      --accent-light: #a29bfe;
      --accent-glow: rgba(108,92,231,0.3);
      --gradient: linear-gradient(135deg, #6c5ce7, #a29bfe, #fd79a8);
      --gradient-subtle: linear-gradient(135deg, rgba(108,92,231,0.15), rgba(162,155,254,0.05));
    }

    html { scroll-behavior: smooth; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    /* --- Ambient background --- */
    .bg-glow {
      position: fixed; top: -40%; left: -20%; width: 140%; height: 140%;
      background: radial-gradient(ellipse at 30% 20%, rgba(108,92,231,0.08) 0%, transparent 50%),
                  radial-gradient(ellipse at 70% 60%, rgba(253,121,168,0.05) 0%, transparent 50%);
      pointer-events: none; z-index: 0;
    }

    .container { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; position: relative; z-index: 1; }

    /* --- Nav --- */
    nav {
      padding: 1.5rem 0;
      display: flex; align-items: center; justify-content: space-between;
    }
    .logo {
      font-size: 1.3rem; font-weight: 800; letter-spacing: -0.02em;
      background: var(--gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .nav-links a {
      color: var(--text-secondary); text-decoration: none; font-size: 0.9rem; margin-left: 2rem;
      transition: color 0.2s;
    }
    .nav-links a:hover { color: var(--text-primary); }

    /* --- Hero --- */
    .hero {
      text-align: center; padding: 8rem 0 5rem;
    }
    .hero-badge {
      display: inline-flex; align-items: center; gap: 0.5rem;
      padding: 0.4rem 1rem; border-radius: 100px;
      background: var(--gradient-subtle); border: 1px solid var(--border);
      font-size: 0.8rem; color: var(--accent-light); font-weight: 500;
      margin-bottom: 2rem;
    }
    .hero-badge .dot {
      width: 6px; height: 6px; border-radius: 50%; background: #00d26a;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    .hero h1 {
      font-size: clamp(2.5rem, 6vw, 4.2rem);
      font-weight: 800; line-height: 1.1; letter-spacing: -0.03em;
      margin-bottom: 1.5rem;
    }
    .hero h1 .gradient-text {
      background: var(--gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .hero p {
      font-size: 1.15rem; color: var(--text-secondary); max-width: 560px; margin: 0 auto 2.5rem;
      line-height: 1.7;
    }

    /* --- Email form --- */
    .signup-form {
      display: flex; gap: 0.75rem; max-width: 460px; margin: 0 auto;
      justify-content: center; flex-wrap: wrap;
    }
    .signup-form input[type="email"] {
      flex: 1; min-width: 240px; padding: 0.9rem 1.2rem;
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
      color: var(--text-primary); font-size: 0.95rem; outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .signup-form input[type="email"]:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }
    .signup-form input[type="email"]::placeholder { color: var(--text-muted); }
    .signup-form button {
      padding: 0.9rem 2rem; border: none; border-radius: 12px;
      background: var(--gradient); color: #fff; font-size: 0.95rem; font-weight: 600;
      cursor: pointer; transition: transform 0.15s, box-shadow 0.2s;
      white-space: nowrap;
    }
    .signup-form button:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 30px var(--accent-glow);
    }
    .signup-form button:active { transform: translateY(0); }
    .signup-form button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

    .form-message {
      text-align: center; margin-top: 1rem; font-size: 0.9rem; min-height: 1.4rem;
    }
    .form-message.success { color: #00d26a; }
    .form-message.error { color: #ff6b6b; }

    .social-proof {
      text-align: center; margin-top: 1.5rem; font-size: 0.85rem; color: var(--text-muted);
    }
    .social-proof strong { color: var(--text-secondary); }

    /* --- Features --- */
    .features { padding: 5rem 0; }
    .features-header { text-align: center; margin-bottom: 3.5rem; }
    .features-header h2 {
      font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.75rem;
    }
    .features-header p { color: var(--text-secondary); font-size: 1.05rem; }

    .features-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
    }
    .feature-card {
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px;
      padding: 2rem; transition: border-color 0.3s, transform 0.2s;
    }
    .feature-card:hover {
      border-color: rgba(108,92,231,0.3);
      transform: translateY(-2px);
    }
    .feature-icon {
      width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
      background: var(--gradient-subtle); margin-bottom: 1.25rem; font-size: 1.5rem;
    }
    .feature-card h3 {
      font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;
    }
    .feature-card p { color: var(--text-secondary); font-size: 0.92rem; line-height: 1.6; }

    /* --- CTA --- */
    .cta {
      text-align: center; padding: 5rem 0;
    }
    .cta-box {
      background: var(--gradient-subtle); border: 1px solid var(--border);
      border-radius: 24px; padding: 4rem 2rem;
    }
    .cta-box h2 {
      font-size: 2rem; font-weight: 700; margin-bottom: 0.75rem;
    }
    .cta-box p {
      color: var(--text-secondary); margin-bottom: 2rem; font-size: 1.05rem;
    }

    /* --- Footer --- */
    footer {
      padding: 3rem 0; border-top: 1px solid var(--border);
      display: flex; justify-content: space-between; align-items: center;
      flex-wrap: wrap; gap: 1rem;
    }
    footer .copyright { color: var(--text-muted); font-size: 0.85rem; }
    footer .links a {
      color: var(--text-muted); text-decoration: none; font-size: 0.85rem; margin-left: 1.5rem;
      transition: color 0.2s;
    }
    footer .links a:hover { color: var(--text-secondary); }

    /* --- Responsive --- */
    @media (max-width: 640px) {
      .hero { padding: 5rem 0 3rem; }
      .signup-form { flex-direction: column; }
      .signup-form input[type="email"] { min-width: unset; }
      .signup-form button { width: 100%; }
      nav { flex-direction: column; gap: 1rem; }
      .nav-links a { margin-left: 0; margin-right: 1.5rem; }
      footer { flex-direction: column; text-align: center; }
      footer .links a { margin: 0 0.75rem; }
    }
  </style>
</head>
<body>
  <div class="bg-glow"></div>

  <div class="container">
    <nav>
      <div class="logo">${SITE_TITLE}</div>
      <div class="nav-links">
        <a href="#features">Features</a>
        <a href="#signup">Get Early Access</a>
      </div>
    </nav>

    <section class="hero">
      <div class="hero-badge"><span class="dot"></span> Now accepting early access signups</div>
      <h1>Build something<br><span class="gradient-text">extraordinary</span></h1>
      <p>${SITE_DESCRIPTION || 'The next generation platform that helps you ship faster, scale effortlessly, and focus on what truly matters.'}</p>

      <form class="signup-form" id="signupForm">
        <input type="email" id="emailInput" placeholder="Enter your email" required>
        <button type="submit" id="submitBtn">Get Early Access</button>
      </form>
      <div class="form-message" id="formMessage"></div>
      <div class="social-proof" id="socialProof">
        ${subscriberCount > 0 ? `Join <strong>${subscriberCount.toLocaleString()}</strong> other${subscriberCount === 1 ? '' : 's'} on the waitlist` : 'Be the first to join the waitlist'}
      </div>
    </section>

    <section class="features" id="features">
      <div class="features-header">
        <h2>Everything you need</h2>
        <p>Powerful features designed to give you an unfair advantage.</p>
      </div>

      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">&#x26A1;</div>
          <h3>Lightning Fast</h3>
          <p>Built for speed from the ground up. Sub-second response times and optimized workflows that keep you in flow state.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">&#x1F512;</div>
          <h3>Secure by Default</h3>
          <p>Enterprise-grade security baked into every layer. Your data stays yours with end-to-end encryption and zero-knowledge architecture.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">&#x1F680;</div>
          <h3>Scale Without Limits</h3>
          <p>From prototype to production without changing a line of code. Auto-scaling infrastructure that grows with your ambitions.</p>
        </div>
      </div>
    </section>

    <section class="cta" id="signup">
      <div class="cta-box">
        <h2>Ready to get started?</h2>
        <p>Join the waitlist and be first in line when we launch.</p>
        <form class="signup-form" id="ctaForm">
          <input type="email" id="ctaEmailInput" placeholder="Enter your email" required>
          <button type="submit">Join Waitlist</button>
        </form>
        <div class="form-message" id="ctaFormMessage"></div>
      </div>
    </section>

    <footer>
      <div class="copyright">&copy; ${new Date().getFullYear()} ${SITE_TITLE}. All rights reserved.</div>
      <div class="links">
        <a href="#">Privacy</a>
        <a href="#">Terms</a>
        <a href="#">Contact</a>
      </div>
    </footer>
  </div>

  <script>
    function handleSubscribe(form, messageEl) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = form.querySelector('input[type="email"]');
        const btn = form.querySelector('button');
        const email = emailInput.value.trim();

        if (!email) return;

        btn.disabled = true;
        btn.textContent = 'Joining...';
        messageEl.textContent = '';
        messageEl.className = 'form-message';

        try {
          const res = await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          });
          const data = await res.json();

          if (res.ok) {
            messageEl.textContent = data.message;
            messageEl.className = 'form-message success';
            emailInput.value = '';
            if (data.count) {
              document.getElementById('socialProof').innerHTML =
                'Join <strong>' + data.count.toLocaleString() + '</strong> other' + (data.count === 1 ? '' : 's') + ' on the waitlist';
            }
          } else {
            messageEl.textContent = data.error || 'Something went wrong';
            messageEl.className = 'form-message error';
          }
        } catch {
          messageEl.textContent = 'Network error. Please try again.';
          messageEl.className = 'form-message error';
        } finally {
          btn.disabled = false;
          btn.textContent = form.id === 'ctaForm' ? 'Join Waitlist' : 'Get Early Access';
        }
      });
    }

    handleSubscribe(document.getElementById('signupForm'), document.getElementById('formMessage'));
    handleSubscribe(document.getElementById('ctaForm'), document.getElementById('ctaFormMessage'));
  </script>
</body>
</html>`;
}

// --- Error handling ---

app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start server ---

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Landing page server running on http://127.0.0.1:${PORT}`);
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
