const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

async function load(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function save(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  return true;
}

async function loadUsers() { return load('users.json'); }
async function saveUsers(data) { return save('users.json', data); }
async function loadClasses() { return load('classes.json'); }
async function saveClasses(data) { return save('classes.json', data); }

module.exports = {
  loadUsers, saveUsers,
  loadClasses, saveClasses
};
