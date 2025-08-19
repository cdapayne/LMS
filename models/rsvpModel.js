const db = require('./db');

// Ensure RSVP table exists
async function init() {
  await db.query(`CREATE TABLE IF NOT EXISTS mdtslms_event_rsvps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    eventId INT,
    fullName VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    branch VARCHAR(100),
    program VARCHAR(100)
  )`);
}
init().catch(console.error);

async function createRSVP(data) {
  const { eventId, fullName, email, phone, address, city, state, zip, branch, program } = data;
  await db.query(
    'INSERT INTO mdtslms_event_rsvps (eventId, fullName, email, phone, address, city, state, zip, branch, program) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [eventId, fullName, email, phone, address, city, state, zip, branch, program]
  );
}

async function getAllRSVPs() {
  const [rows] = await db.query(
    'SELECT r.*, e.name AS eventName FROM mdtslms_event_rsvps r LEFT JOIN mdtslms_events e ON r.eventId = e.id ORDER BY r.id DESC'
  );
  return rows;
}

module.exports = {
  createRSVP,
  getAllRSVPs
};