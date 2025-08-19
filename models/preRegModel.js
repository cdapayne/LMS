const db = require('./db');

async function create({ name, phone, email, branch, region, course, referral, consent }) {
  const [result] = await db.query(
    'INSERT INTO mdtslms_pre_registrations (name, phone, email, branch, region, course, referral, consent, createdAt) VALUES (?,?,?,?,?,?,?, ?, NOW())',
    [name, phone, email || null, branch, region, course, referral, consent ? 1 : 0]
  );
  return { id: result.insertId };
}

async function getAll() {
  const [rows] = await db.query('SELECT * FROM mdtslms_pre_registrations ORDER BY createdAt DESC');
  return rows;
}

module.exports = { create, getAll };