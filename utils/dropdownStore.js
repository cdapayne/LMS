const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../data/dropdowns.json');
let cache = { courses: [], affiliatePrograms: [] };

function load() {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    cache = JSON.parse(data);
  } catch (e) {
    cache = { courses: [], affiliatePrograms: [] };
  }
}

function save() {
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
}

function getAll() {
  if (!cache.courses.length && !cache.affiliatePrograms.length) load();
  return cache;
}

function add(type, value) {
  if (!value || !type) return;
  if (!Array.isArray(cache[type])) cache[type] = [];
  if (!cache[type].includes(value)) {
    cache[type].push(value);
    save();
  }
}

function remove(type, value) {
  if (!Array.isArray(cache[type])) return;
  cache[type] = cache[type].filter(v => v !== value);
  save();
}

load();

module.exports = { getAll, add, remove };