const db = require('./db');

// ensure table exists
(async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS mdtslms_discussions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    classId INT NOT NULL,
    userId INT NOT NULL,
    message TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
})();

async function getByClass(classId) {
  const [rows] = await db.query(
    `SELECT d.*, u.name, u.role FROM mdtslms_discussions d JOIN mdtslms_users u ON d.userId = u.id WHERE d.classId = ? ORDER BY d.createdAt ASC`,
    [classId]
  );
  return rows;
}

async function addMessage(classId, userId, message) {
  const [result] = await db.query(
    'INSERT INTO mdtslms_discussions (classId, userId, message) VALUES (?,?,?)',
    [classId, userId, message]
  );
  return { id: result.insertId };
}

module.exports = { getByClass, addMessage };