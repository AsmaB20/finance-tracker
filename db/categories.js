const DEFAULT_CATEGORIES = [
  { name: 'Groceries', icon: '🛒', color: '#34D399' },
  { name: 'Food', icon: '🍕', color: '#FF6B6B' },
  { name: 'Rent', icon: '🏠', color: '#4ECDC4' },
  { name: 'Transport', icon: '🚗', color: '#45B7D1' },
  { name: 'Shopping', icon: '🛍️', color: '#F7DC6F' },
  { name: 'Subscriptions', icon: '📱', color: '#BB8FCE' },
  { name: 'Going Out', icon: '🎉', color: '#F0A500' },
  { name: 'Health', icon: '💊', color: '#58D68D' },
  { name: 'Other', icon: '📦', color: '#AEB6BF' },
];

function ensureDefaultCategories(db, userId) {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO categories (user_id, name, icon, color) VALUES (?, ?, ?, ?)'
  );
  const insertMany = db.transaction((items) => {
    for (const c of items) insert.run(userId, c.name, c.icon, c.color);
  });
  insertMany(DEFAULT_CATEGORIES);
}

function getCategories(db, userId) {
  return db
    // Order by insertion (defaults first, then custom ones).
    .prepare('SELECT id, name, icon, color FROM categories WHERE user_id = ? ORDER BY id ASC')
    .all(userId);
}

function categoryExists(db, userId, name) {
  return !!db
    .prepare('SELECT 1 FROM categories WHERE user_id = ? AND name = ?')
    .get(userId, name);
}

module.exports = {
  DEFAULT_CATEGORIES,
  ensureDefaultCategories,
  getCategories,
  categoryExists,
};
