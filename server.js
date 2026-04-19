require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDB } = require('./db/database');

const authRoutes = require('./routes/auth');
const expensesRoutes = require('./routes/expenses');
const budgetRoutes = require('./routes/budget');
const categoriesRoutes = require('./routes/categories');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

function currentMonthLocal() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
}

// Initialize the database
initDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

if (IS_PROD && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required in production');
}

// If running behind a proxy (common on hosts), secure cookies need this.
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET || 'spendwise-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: IS_PROD,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/categories', categoriesRoutes);

// Summary route — spending overview for a given month
app.get('/api/summary', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    const { getDB } = require('./db/database');
    const db = getDB();

    const month = req.query.month || currentMonthLocal(); // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Invalid month format.' });

    const expenses = db.prepare(`
    SELECT category, SUM(amount) as total, COUNT(*) as count
    FROM expenses
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    GROUP BY category
  `).all(req.session.userId, month);

    const totalSpent = expenses.reduce((sum, e) => sum + e.total, 0);

    const budget = db.prepare(`
    SELECT amount FROM budgets WHERE user_id = ? AND month = ?
  `).get(req.session.userId, month);

    const recentExpenses = db.prepare(`
    SELECT * FROM expenses
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    ORDER BY date DESC, created_at DESC
    LIMIT 5
  `).all(req.session.userId, month);

    res.json({
        month,
        totalSpent,
        budget: budget ? budget.amount : null,
        remaining: budget ? budget.amount - totalSpent : null,
        byCategory: expenses,
        recentExpenses
    });
});

// Catch-all: serve frontend for any non-API route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n💸 SpendWise running at http://localhost:${PORT}`);
    console.log(`   Press Ctrl+C to stop\n`);
});
