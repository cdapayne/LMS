const fs = require('fs');
const path = require('path');

const templatesPath = path.join(__dirname, '../data/emailTemplates.json');
let templates = {};

function load() {
  try {
    const data = fs.readFileSync(templatesPath, 'utf8');
    templates = JSON.parse(data);
  } catch (e) {
    templates = {};
  }
}

function saveTemplate(key, tpl) {
  templates[key] = tpl;
  fs.writeFileSync(templatesPath, JSON.stringify(templates, null, 2));
}

function render(key, vars = {}) {
  if (!Object.keys(templates).length) load();
  const tpl = templates[key] || { subject: '', html: '' };
  let subject = tpl.subject || '';
  let html = tpl.html || '';
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`{{${k}}}`, 'g');
    subject = subject.replace(re, v);
    html = html.replace(re, v);
  }
  const text = html.replace(/<[^>]*>/g, '');
  return { subject, html, text };
}

load();

module.exports = { render, saveTemplate, load, templates };