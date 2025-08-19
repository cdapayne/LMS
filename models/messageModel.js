const db = require('./db');

async function sendMessage(senderId, recipientId, subject, body) {
  const sentAt = new Date().toISOString();
  const [result] = await db.query(
    'INSERT INTO mdtslms_messages (senderId, recipientId, subject, body, sentAt) VALUES (?,?,?,?,?)',
    [senderId, recipientId, subject, body, sentAt]
  );
  return { id: result.insertId, senderId, recipientId, subject, body, sentAt };
}

async function getMailbox(userId) {
  const [rows] = await db.query(
    'SELECT * FROM mdtslms_messages WHERE senderId = ? OR recipientId = ? ORDER BY sentAt DESC',
    [userId, userId]
  );
  return rows;
}

module.exports = { sendMessage, getMailbox };