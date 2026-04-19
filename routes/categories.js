const express = require('express');
const { getDB } = require('../db/database');
const { ensureDefaultCategories, getCategories } = require('../db/categories');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function normalizeCategoryName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ');
}

// GET /api/categories
router.get('/', requireAuth, (req, res) => {
  const db = getDB();
  ensureDefaultCategories(db, req.session.userId);
  const categories = getCategories(db, req.session.userId);
  res.json({ categories });
});

// POST /api/categories { name }
router.post('/', requireAuth, (req, res) => {
  const rawName = req.body?.name;
  const name = normalizeCategoryName(rawName);

  if (!name) return res.status(400).json({ error: 'Category name is required.' });
  if (name.length > 24) return res.status(400).json({ error: 'Category name must be 24 characters or less.' });
  if (name.toLowerCase() === 'all') return res.status(400).json({ error: 'Category name cannot be "All".' });

  try {
    const db = getDB();
    ensureDefaultCategories(db, req.session.userId);

    db.prepare('INSERT INTO categories (user_id, name) VALUES (?, ?)').run(req.session.userId, name);
    const categories = getCategories(db, req.session.userId);
    res.status(201).json({ categories });
  } catch (err) {
    if (err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT')) {
      return res.status(400).json({ error: 'That category already exists.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Could not create category.' });
  }
});

module.exports = router;
