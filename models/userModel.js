const crypto = require('crypto');
const store = require('./dataStore');

function hashPassword(plainPassword, existingSalt) {
  const pwd = plainPassword; // login route ensures string
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pwd, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

async function findByUsername(username) {
  const users = await store.loadUsers();
  return users.find(u => u.username === username);
}

async function findById(id) {
  const users = await store.loadUsers();
  return users.find(u => u.id === id);
}

function verifyPassword(user, candidatePassword) {
  if (!user || !user.salt || !user.hash) return false;
  const { hash } = hashPassword(candidatePassword, user.salt);
  return hash === user.hash;
}
async function createTeacher({ name, username, email, password }) {
  const users = await store.loadUsers();
  const id = users.length ? Math.max(...users.map(u => u.id)) + 1 : 1;
  const hashed = hashPassword(password);
  users.push({
    id,
    name,
    username,
    email,
    password: hashed,
    role: 'teacher',
    status: 'approved'
  });
  await store.saveUsers(users);
  return { id };
}

async function createStudent({ username, name, email, password, studentId, signatureDataUrl, agreedDocVersion,
  firstName, lastName, suffix, address, city, state, zip, course, affiliateProgram,
  grievanceAck, codeConductSig, cancellationSig, noticeSig, contractSig, contractSigDate
}) {
  const users = await store.loadUsers();
  const nextId = (users.reduce((m,u)=>Math.max(m,u.id), 0) || 0) + 1;
  const { salt, hash } = hashPassword(password);

  const fullName = `${firstName} ${lastName}${suffix ? ' ' + suffix : ''}`.trim();

  const docNow = new Date().toISOString();
  const newUser = {
    id: nextId,
    username,
    name: fullName,
    email,
    role: 'student',
    salt,
    hash,
    status: 'pending',
    profile: {
      studentId,
      firstName, lastName, suffix: suffix || '',
      address: { line1: address, city, state, zip },
      course,
      affiliateProgram,
      grievanceAcknowledged: !!grievanceAck,
      uploads: [],
      documents: [
        { type: 'registration-agreement', version: agreedDocVersion, agreed: true, signedAt: docNow, signatureDataUrl },
        { type: 'code-of-conduct', version: 'v1.0', agreed: true, signedAt: docNow, signatureDataUrl: codeConductSig || '' },
        { type: 'cancellation-policy', version: 'v1.0', agreed: true, signedAt: docNow, signatureDataUrl: cancellationSig || '' },
        { type: 'notice-to-buyer', version: 'v1.0', agreed: true, signedAt: docNow, signatureDataUrl: noticeSig || '' },
        { type: 'contract-acceptance', version: 'v1.0', agreed: true, signedAt: contractSigDate || docNow, signatureDataUrl: contractSig || '' }
      ]
    }
  };

  users.push(newUser);
  await store.saveUsers(users);
  return newUser;
}

async function addUploads(id, uploads) {
  const users = await store.loadUsers();
  const u = users.find(x => x.id === id);
  if (!u) return null;
  if (!u.profile) u.profile = {};
  if (!Array.isArray(u.profile.uploads)) u.profile.uploads = [];
  u.profile.uploads.push(...uploads);
  await store.saveUsers(users);
  return u;
}

async function setStatus(id, status) {
  const users = await store.loadUsers();
  const u = users.find(x => x.id === id);
  if (!u) return null;
  u.status = status;
  await store.saveUsers(users);
  return u;
}

module.exports = {
  hashPassword,
  verifyPassword,
  findByUsername,
  findById,
  createStudent,
  createTeacher,
  setStatus
};
