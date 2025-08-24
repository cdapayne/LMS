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
    row.active = row.active === undefined || row.active === null ? true : !!row.active;
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
     'INSERT INTO mdtslms_users (name, username, email, role, status, salt, hash, active) VALUES (?,?,?,?,?,?,?,?)',
    [name, username, email, 'teacher', 'approved', salt, hash, 1]
  );
  return { id: result.insertId };
}

// Generate a unique six-digit student ID
async function generateStudentId() {
  const [rows] = await db.query('SELECT profile FROM mdtslms_users');
  let max = 99999;
  for (const row of rows) {
    if (!row.profile) continue;
    let parsed;
    try {
      parsed = JSON.parse(row.profile);
    } catch (_) {
      continue;
    }
    const num = Number(parsed.studentId);
    if (Number.isInteger(num) && String(num).length === 6 && num > max) {
      max = num;
    }
  }
  const next = Math.max(100000, max + 1);
  return String(next).padStart(6, '0');
}

async function createStudent({ username, name, email, password, studentId,
  firstName, lastName, suffix, address, city, state, zip, course, affiliateProgram,
  phones, ssn, emergencyContact, admissionDate, startDate, endDate, classTime, classDays,
  tuition, grievanceAck, financialAid, referralName, referralEmail }) {
  const { salt, hash } = hashPassword(password);
  const docNow = new Date().toISOString();
  const unsigned = { agreed: false, signedAt: null, signatureDataUrl: '' };
  const doc = (type, version, sig) => (
    sig
      ? { type, version, agreed: true, signedAt: docNow, signatureDataUrl: sig }
      : { type, version, ...unsigned }
  );


  const profile = {
    studentId,
    firstName, lastName, suffix: suffix || '',
    address: { line1: address, city, state, zip },
    phones: phones || {},
    ssn,
    emergencyContact: emergencyContact || {},
    program: { admissionDate, startDate, endDate, classTime, classDays },
    course,
    affiliateProgram,
    tuition: tuition || {},
    financialAidRequested: !!financialAid,
    grievanceAcknowledged: !!grievanceAck,
    uploads: [],
    documents: [
       doc('registration-agreement', 'v1.0', ''),
      doc('code-of-conduct', 'v1.0', ''),
      doc('cancellation-policy', 'v1.0', ''),
      doc('notice-to-buyer', 'v1.0', ''),
      doc('electronic-use-agreement', 'v1.0', ''),
      doc('contract-acceptance', 'v1.0', ''),
      { type: 'representatives-certification', version: 'v1.0', ...unsigned, requiredRole: 'admin' },
      { type: 'school-official', version: 'v1.0', ...unsigned, requiredRole: 'admin' }
    ]
  };
   if (referralName || referralEmail) {
    profile.referral = { name: referralName, email: referralEmail };
  }

  const [result] = await db.query(
    `INSERT INTO mdtslms_users (username, name, email, role, salt, hash, status, appliedAt, profile, active)
     VALUES (?, ?, ?, 'student', ?, ?, 'pending', ?, ?, ?)`,
    [username, name, email, salt, hash, docNow, JSON.stringify(profile), 1]
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

async function updateProfile(id, updates) {
  const user = await findById(id);
  if (!user) return null;
  const merge = (target, src) => {
    if (!src) return target;
    for (const key of Object.keys(src)) {
      const val = src[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        target[key] = merge(target[key] || {}, val);
      } else if (val !== undefined) {
        target[key] = val;
      }
    }
    return target;
  };
  user.profile = merge(user.profile || {}, updates);
  await db.query('UPDATE mdtslms_users SET profile=? WHERE id=?', [JSON.stringify(user.profile), id]);
  return user.profile;
}

async function signDocument(id, docType, signatureDataUrl) {
  const user = await findById(id);
  if (!user) return null;
  // Prevent signature updates once the student has been approved
  if (user.status === 'approved') return user;

  user.profile = user.profile || {};
  user.profile.documents = user.profile.documents || [];
  const doc = user.profile.documents.find(d => d.type === docType);
  if (!doc) return user;

  doc.signatureDataUrl = signatureDataUrl;
  doc.signedAt = new Date().toISOString();

  await db.query('UPDATE mdtslms_users SET profile=? WHERE id=?', [JSON.stringify(user.profile), id]);
  return user;
}
async function markApplicationComplete(id) {
  const user = await findById(id);
  if (!user) return null;
  user.profile = user.profile || {};
  user.profile.applicationCompleted = new Date().toISOString();
  await db.query('UPDATE mdtslms_users SET profile=? WHERE id=?', [JSON.stringify(user.profile), id]);
  return user;
}
async function setActive(id, active) {
  await db.query('UPDATE mdtslms_users SET active=? WHERE id=?', [active ? 1 : 0, id]);
  return findById(id);
}
async function findByEmail(email) {
  const [rows] = await db.query('SELECT * FROM mdtslms_users WHERE email = ?', [email]);
  return mapRow(rows[0]);
}


async function updatePassword(username, newPassword) {
  const { salt, hash } = hashPassword(newPassword);
  const [result] = await db.query('UPDATE mdtslms_users SET salt=?, hash=? WHERE username=?', [salt, hash, username]);
  return result.affectedRows > 0;
}

async function setResetToken(username, token, expires) {
  const user = await findByUsername(username);
  if (!user) return false;
  user.profile = user.profile || {};
  user.profile.resetToken = { token, expires };
  await db.query('UPDATE mdtslms_users SET profile=? WHERE id=?', [JSON.stringify(user.profile), user.id]);
  return true;
}

async function findByResetToken(token) {
  const [rows] = await db.query('SELECT * FROM mdtslms_users');
  for (const row of rows) {
    const user = mapRow(row);
    if (user.profile && user.profile.resetToken && user.profile.resetToken.token === token) {
      if (user.profile.resetToken.expires && user.profile.resetToken.expires < Date.now()) {
        return null;
      }
      return user;
    }
  }
  return null;
}

async function clearResetToken(id) {
  const user = await findById(id);
  if (!user) return false;
  if (user.profile && user.profile.resetToken) {
    delete user.profile.resetToken;
    await db.query('UPDATE mdtslms_users SET profile=? WHERE id=?', [JSON.stringify(user.profile), id]);
  }
  return true;
}

async function setStep2Token(id, token, expires) {
  const user = await findById(id);
  if (!user) return false;
  user.profile = user.profile || {};
  user.profile.step2Token = { token, expires };
  await db.query('UPDATE mdtslms_users SET profile=? WHERE id=?', [JSON.stringify(user.profile), id]);
  return true;
}

async function findByStep2Token(token) {
  const [rows] = await db.query('SELECT * FROM mdtslms_users');
  for (const row of rows) {
    const user = mapRow(row);
    if (user.profile && user.profile.step2Token && user.profile.step2Token.token === token) {
      if (user.profile.step2Token.expires && user.profile.step2Token.expires < Date.now()) {
        return null;
      }
      return user;
    }
  }
  return null;
}

async function clearStep2Token(id) {
  const user = await findById(id);
  if (!user) return false;
  if (user.profile && user.profile.step2Token) {
    delete user.profile.step2Token;
    await db.query('UPDATE mdtslms_users SET profile=? WHERE id=?', [JSON.stringify(user.profile), id]);
  }
  return true;
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

async function addLinks(id, links) {
  const user = await findById(id);
  if (!user) return null;
  user.profile = user.profile || {};
  user.profile.links = user.profile.links || [];
  user.profile.links.push(...links);
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
    findByEmail,

  findById,
    generateStudentId,

  createStudent,
  createTeacher,
  setStatus,
    setActive,
  addUploads,
  addLinks,
    signDocument,
        markApplicationComplete,

  updateProfile,

  updatePassword,
    setResetToken,
  findByResetToken,
  clearResetToken,
  setStep2Token,
  findByStep2Token,
  clearStep2Token,
  getAll,
  getByRole,
  deleteById
};
