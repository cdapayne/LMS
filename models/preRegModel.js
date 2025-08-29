const db = require('./db');

async function create({
  name,
  email,
  phone,
  phoneCarrier,
  address,
  zip,
  state,
  serving,
  branch,
  course,
  applicantType,
  referral,
  referralEmail,
  consent
}) {
  const [result] = await db.query(
    'INSERT INTO mdtslms_pre_registrations (name, email, phone, phoneCarrier, address, zip, state, serving, branch, course, applicantType, referral, referralEmail, consent, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ?, NOW())',
    [
      name,
      email || null,
      phone,
      phoneCarrier || null,
      address || null,
      zip,
      state,
      serving ? 1 : 0,
      branch || null,
      course,
      applicantType,
      referral || null,
      referralEmail || null,
      consent ? 1 : 0
    ]
  );
  return { id: result.insertId };
}

async function getAll() {
  const [rows] = await db.query('SELECT * FROM mdtslms_pre_registrations ORDER BY createdAt DESC');
  return rows;
}

let ensuredPreLastContacted = false;
async function ensurePreLastContactedColumn() {
  if (ensuredPreLastContacted) return;
  try {
    await db.query('ALTER TABLE mdtslms_pre_registrations ADD COLUMN IF NOT EXISTS lastContacted DATETIME NULL');
  } catch (e) {
    // ignore if exists
  } finally {
    ensuredPreLastContacted = true;
  }
}

async function setLastContacted(id, when = new Date()) {
  await ensurePreLastContactedColumn();
  const ts = new Date(when).toISOString().slice(0, 19).replace('T', ' ');
  try {
    await db.query('UPDATE mdtslms_pre_registrations SET lastContacted=? WHERE id=?', [ts, id]);
  } catch (e) {
    try {
      await db.query('ALTER TABLE mdtslms_pre_registrations ADD COLUMN lastContacted DATETIME NULL');
    } catch (_) {}
    await db.query('UPDATE mdtslms_pre_registrations SET lastContacted=? WHERE id=?', [ts, id]);
  }
  return true;
}

module.exports = { create, getAll, setLastContacted };
