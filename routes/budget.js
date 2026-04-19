const express = require('express');
const { getDB } = require('../db/database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// GET /api/budget?month=YYYY-MM
router.get('/', requireAuth, (req, res) => {
  const db = getDB();
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const budget = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND month = ?').get(req.session.userId, month);
  res.json({ budget: budget || null });
});

// POST /api/budget — set or update budget for a month
router.post('/', requireAuth, (req, res) => {
  const { amount, month } = req.body;
  const targetMonth = month || new Date().toISOString().slice(0, 7);

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0)
    return res.status(400).json({ error: 'A valid budget amount is required.' });

  try {
    const db = getDB();
    // INSERT OR REPLACE handles both create and update
    db.prepare(`
      INSERT INTO budgets (user_id, amount, month) VALUES (?, ?, ?)
      ON CONFLICT(user_id, month) DO UPDATE SET amount = excluded.amount
    `).run(req.session.userId, parseFloat(amount), targetMonth);

    const budget = db.prepare('SELECT * FROM budgets WHERE user_id = ? AND month = ?').get(req.session.userId, targetMonth);
    res.json({ budget });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save budget.' });
  }
});

module.exports = router;