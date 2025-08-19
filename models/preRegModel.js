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

module.exports = { create, getAll };