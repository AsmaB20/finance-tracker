const express = require('express');
const { getDB } = require('../db/database');
const { ensureDefaultCategories, categoryExists } = require('../db/categories');

const router = express.Router();

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidMonth(month) {
  return typeof month === 'string' && MONTH_RE.test(month);
}

function isValidDate(date) {
  return typeof date === 'string' && DATE_RE.test(date);
}

function getCanonicalCategoryName(db, userId, name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  const row = db
    .prepare('SELECT name FROM categories WHERE user_id = ? AND LOWER(name) = LOWER(?)')
    .get(userId, name.trim());
  return row?.name || null;
}

// Auth guard middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// GET /api/expenses — list expenses, optionally filter by month and/or category
router.get('/', requireAuth, (req, res) => {
  const db = getDB();
  const { month, category } = req.query; // month = YYYY-MM

  ensureDefaultCategories(db, req.session.userId);

  let query = 'SELECT * FROM expenses WHERE user_id = ?';
  const params = [req.session.userId];

  if (month) {
    if (!isValidMonth(month)) return res.status(400).json({ error: 'Invalid month format.' });
    query += ` AND strftime('%Y-%m', date) = ?`;
    params.push(month);
  }
  if (category && category !== 'all') {
    const canonical = getCanonicalCategoryName(db, req.session.userId, category);
    if (!canonical) {
      return res.status(400).json({ error: 'Invalid category.' });
    }
    query += ' AND category = ?';
    params.push(canonical);
  }

  query += ' ORDER BY date DESC, created_at DESC';

  const expenses = db.prepare(query).all(...params);
  res.json({ expenses });
});

// POST /api/expenses — add a new expense
router.post('/', requireAuth, (req, res) => {
  const { amount, category, note, date } = req.body;

  if (!amount || !category || !date)
    return res.status(400).json({ error: 'Amount, category, and date are required.' });

  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0)
    return res.status(400).json({ error: 'Amount must be a positive number.' });

  try {
    const db = getDB();
    ensureDefaultCategories(db, req.session.userId);
    const canonical = getCanonicalCategoryName(db, req.session.userId, category);
    if (!canonical) return res.status(400).json({ error: 'Invalid category.' });

    if (!isValidDate(date))
      return res.status(400).json({ error: 'Invalid date format.' });

    const result = db.prepare(
      'INSERT INTO expenses (user_id, amount, category, note, date) VALUES (?, ?, ?, ?, ?)'
    ).run(req.session.userId, parseFloat(amount), canonical, note?.trim() || null, date);

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ expense });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save expense.' });
  }
});

// PUT /api/expenses/:id — update an expense
router.put('/:id', requireAuth, (req, res) => {
  const { amount, category, note, date } = req.body;
  const { id } = req.params;

  try {
    const db = getDB();
    ensureDefaultCategories(db, req.session.userId);
    const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(id, req.session.userId);
    if (!existing) return res.status(404).json({ error: 'Expense not found.' });

    let nextAmount = existing.amount;
    if (amount !== undefined) {
      const parsed = parseFloat(amount);
      if (isNaN(parsed) || parsed <= 0) return res.status(400).json({ error: 'Amount must be a positive number.' });
      nextAmount = parsed;
    }

    let nextCategory = existing.category;
    if (category !== undefined) {
      const canonical = getCanonicalCategoryName(db, req.session.userId, category);
      if (!canonical) return res.status(400).json({ error: 'Invalid category.' });
      nextCategory = canonical;
    }

    let nextDate = existing.date;
    if (date !== undefined) {
      if (!isValidDate(date)) return res.status(400).json({ error: 'Invalid date format.' });
      nextDate = date;
    }

    let nextNote = existing.note;
    if (note !== undefined) {
      const trimmed = String(note).trim();
      nextNote = trimmed ? trimmed : null;
    }

    db.prepare(
      'UPDATE expenses SET amount = ?, category = ?, note = ?, date = ? WHERE id = ?'
    ).run(
      nextAmount,
      nextCategory,
      nextNote,
      nextDate,
      id
    );

    const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    res.json({ expense: updated });
  } catch (err) {
    res.status(500).json({ error: 'Could not update expense.' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDB();
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!expense) return res.status(404).json({ error: 'Expense not found.' });

  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
