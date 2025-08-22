const db = require('./db');

// Ensure events table exists
async function init() {
  await db.query(`CREATE TABLE IF NOT EXISTS mdtslms_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    eventDate DATE NOT NULL,
    description TEXT
  )`);
}
init().catch(console.error);

async function createEvent({ name, eventDate, description }) {
  const [result] = await db.query(
    'INSERT INTO mdtslms_events (name, eventDate, description) VALUES (?,?,?)',
    [name, eventDate, description]
  );
  return { id: result.insertId, name, eventDate, description };
}

async function getAllEvents() {
  const [rows] = await db.query('SELECT * FROM mdtslms_events ORDER BY eventDate ASC');
  return rows;
}

async function getEventById(id) {
  const [rows] = await db.query('SELECT * FROM mdtslms_events WHERE id = ?', [id]);
  return rows[0];
}

module.exports = {
  createEvent,
  getAllEvents,
  getEventById
};