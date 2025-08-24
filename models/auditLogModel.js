const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, '../data/audit_logs.json');

function load() {
  try {
    const data = fs.readFileSync(logPath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function save(logs) {
  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
}

async function record(userId, action, details) {
  const logs = load();
  logs.push({ timestamp: new Date().toISOString(), userId, action, details });
  save(logs);
}

module.exports = { record };
