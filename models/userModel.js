const crypto = require('crypto');
const db = require('./db');

function hashPassword(plainPassword, existingSalt) {
  const pwd = String(plainPassword);
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pwd, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function mapRow(row) {
  if (!row) return row;
  if (row.profile && typeof row.profile === 'string') {
    try { row.profile = JSON.parse(row.profile); } catch (_) { row.profile = null; }
  }
  return row;
}


async function findByUsername(username) {
  const [rows] = await db.query('SELECT * FROM mdtslms_users WHERE username = ?', [username]);
  return mapRow(rows[0]);
}

async function findById(id) {
  const [rows] = await db.query('SELECT * FROM mdtslms_users WHERE id = ?', [id]);
  return mapRow(rows[0]);
}

function verifyPassword(user, candidatePassword) {
  if (!user || !user.salt || !user.hash) return false;
  const { hash } = hashPassword(candidatePassword, user.salt);
  return hash === user.hash;
}
async function createTeacher({ name, username, email, password }) {
   const { salt, hash } = hashPassword(password);
  const [result] = await db.query(
    'INSERT INTO mdtslms_users (name, username, email, role, status, salt, hash) VALUES (?,?,?,?,?,?,?)',
    [name, username, email, 'teacher', 'approved', salt, hash]
  );
  return { id: result.insertId };
}

async function createStudent({ username, name, email, password, studentId, signatureDataUrl, agreedDocVersion,
  firstName, lastName, suffix, address, city, state, zip, course, affiliateProgram,
  grievanceAck, codeConductSig, cancellationSig, noticeSig, contractSig, contractSigDate,
  financialAid }) {
  const { salt, hash } = hashPassword(password);

  const docNow = new Date().toISOString();
   const profile = {
    studentId,
    firstName, lastName, suffix: suffix || '',
    address: { line1: address, city, state, zip },
    course,
    affiliateProgram,
    financialAidRequested: !!financialAid,
    grievanceAcknowledged: !!grievanceAck,
    uploads: [],
    documents: [
      { type: 'registration-agreement', version: agreedDocVersion, agreed: true, signedAt: docNow, signatureDataUrl },
      { type: 'code-of-conduct', version: 'v1.0', agreed: true, signedAt: docNow, signatureDataUrl: codeConductSig || '' },
      { type: 'cancellation-policy', version: 'v1.0', agreed: true, signedAt: docNow, signatureDataUrl: cancellationSig || '' },
      { type: 'notice-to-buyer', version: 'v1.0', agreed: true, signedAt: docNow, signatureDataUrl: noticeSig || '' },
      { type: 'contract-acceptance', version: 'v1.0', agreed: true, signedAt: contractSigDate || docNow, signatureDataUrl: contractSig || '' }
    ]
  };

  const [result] = await db.query(
    `INSERT INTO mdtslms_users (username, name, email, role, salt, hash, status, appliedAt, profile)
     VALUES (?, ?, ?, 'student', ?, ?, 'pending', ?, ?)`,
    [username, name, email, salt, hash, docNow, JSON.stringify(profile)]
  );
   return mapRow({
    id: result.insertId,
    username,
    name,
    email,
    role: 'student',
    status: 'pending',
    profile
  });
}

async function updatePassword(username, newPassword) {
  const { salt, hash } = hashPassword(newPassword);
  const [result] = await db.query('UPDATE mdtslms_users SET salt=?, hash=? WHERE username=?', [salt, hash, username]);
  return result.affectedRows > 0;
}


async function addUploads(id, uploads) {
 const user = await findById(id);
  if (!user) return null;
  user.profile = user.profile || {};
  user.profile.uploads = user.profile.uploads || [];
  user.profile.uploads.push(...uploads);
  await db.query('UPDATE mdtslms_users SET profile=? WHERE id=?', [JSON.stringify(user.profile), id]);
  return user;
}

async function setStatus(id, status) {
  const finishedAt = (status === 'approved' || status === 'declined') ? new Date().toISOString() : null;
  await db.query('UPDATE mdtslms_users SET status=?, finishedAt=? WHERE id=?', [status, finishedAt, id]);
  return findById(id);
}

async function getAll() {
  const [rows] = await db.query('SELECT * FROM mdtslms_users');
  return rows.map(mapRow);
}

async function getByRole(role) {
  const [rows] = await db.query('SELECT * FROM mdtslms_users WHERE role = ?', [role]);
  return rows.map(mapRow);
}

async function deleteById(id) {
  const [result] = await db.query('DELETE FROM mdtslms_users WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = {
  hashPassword,
  verifyPassword,
  findByUsername,
  findById,
  createStudent,
  createTeacher,
  setStatus,
  addUploads,
   updatePassword,
  getAll,
  getByRole,
  deleteById
};
