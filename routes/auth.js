const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../db/database');
const { ensureDefaultCategories } = require('../db/categories');

const router = express.Router();

const ALLOWED_CURRENCIES = new Set(['QAR', 'SAR', 'AED', 'EGP', 'USD', 'EUR', 'GBP']);
function normalizeCurrency(currency) {
  return ALLOWED_CURRENCIES.has(currency) ? currency : 'QAR';
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, currency } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email, and password are required.' });

  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  try {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });

    const hashed = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (name, email, password, currency) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), email.toLowerCase(), hashed, normalizeCurrency(currency));

    ensureDefaultCategories(db, result.lastInsertRowid);

    req.session.regenerate((regenErr) => {
      if (regenErr) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      req.session.userId = result.lastInsertRowid;
      const user = db.prepare('SELECT id, name, email, currency FROM users WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ user });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });

  try {
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    ensureDefaultCategories(db, user.id);

    req.session.regenerate((regenErr) => {
      if (regenErr) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      req.session.userId = user.id;
      res.json({ user: { id: user.id, name: user.name, email: user.email, currency: user.currency } });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// GET /api/auth/me — check current session
router.get('/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });

  try {
    const db = getDB();
    const user = db.prepare('SELECT id, name, email, currency FROM users WHERE id = ?').get(req.session.userId);
    res.json({ user: user || null });
  } catch (err) {
    res.json({ user: null });
  }
});

// PUT /api/auth/profile — update name or currency
router.put('/profile', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { name, currency } = req.body;
  try {
    const db = getDB();
    db.prepare('UPDATE users SET name = ?, currency = ? WHERE id = ?')
      .run(name?.trim() || 'User', normalizeCurrency(currency), req.session.userId);
    const user = db.prepare('SELECT id, name, email, currency FROM users WHERE id = ?').get(req.session.userId);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Could not update profile.' });
  }
});

module.exports = router;
