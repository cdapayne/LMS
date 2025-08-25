const db = require('./db');

function map(row) {
  if (!row) return row;
  return { ...row, createdAt: row.createdAt ? new Date(row.createdAt) : undefined };
}

async function create({ authorId, audience, message, classId }) {
  const [result] = await db.query(
    'INSERT INTO mdtslms_announcements (authorId, audience, message, classId, createdAt) VALUES (?,?,?,?,?)',
    [authorId, audience, message, classId || null, new Date().toISOString()]
  );
  return findById(result.insertId);
}

async function findById(id) {
  const [rows] = await db.query('SELECT * FROM mdtslms_announcements WHERE id=?', [id]);
  return map(rows[0]);
}

async function forAdmin() {
  const [rows] = await db.query('SELECT * FROM mdtslms_announcements ORDER BY createdAt DESC');
  return rows.map(map);
}

async function forTeacher(teacherId) {
  const [classRows] = await db.query('SELECT id FROM mdtslms_classes WHERE teacherId = ?', [teacherId]);
  const classIds = classRows.map(r => r.id);
  const placeholders = classIds.length ? classIds.map(() => '?').join(',') : 'NULL';
  const sql = `SELECT * FROM mdtslms_announcements WHERE audience IN ('all','teachers') OR (audience='class' AND classId IN (${placeholders})) ORDER BY createdAt DESC`;
  const [rows] = await db.query(sql, classIds);
  return rows.map(map);
}

async function forStudent(studentId) {
  const [classRows] = await db.query('SELECT id, studentIds FROM mdtslms_classes');
  const classIds = classRows.filter(r => {
    try {
      const ids = JSON.parse(r.studentIds || '[]');
      return Array.isArray(ids) && ids.includes(studentId);
    } catch (e) {
      return false;
    }
  }).map(r => r.id);
  const placeholders = classIds.length ? classIds.map(() => '?').join(',') : 'NULL';
  const sql = `SELECT * FROM mdtslms_announcements WHERE audience IN ('all','students') OR (audience='class' AND classId IN (${placeholders})) ORDER BY createdAt DESC`;
  const [rows] = await db.query(sql, classIds);
  return rows.map(map);
}

async function remove(id) {
  await db.query('DELETE FROM mdtslms_announcements WHERE id=?', [id]);
}

module.exports = {
  create,
  forAdmin,
  forTeacher,
  forStudent,
  remove
};