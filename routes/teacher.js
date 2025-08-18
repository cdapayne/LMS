const express = require('express');
const router = express.Router();

const classModel = require('../models/classModel');
const userModel = require('../models/userModel');
const { generateQuestions } = require('../utils/questionGenerator');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
  host: 'mdts-apps.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});
const multer = require('multer');
const upload = multer();

router.use((req, res, next) => {
  if (!req.session || req.session.role !== 'teacher') return res.status(403).send('Forbidden');
  next();
});

// Dashboard with weekly schedule
router.get('/', async (req, res) => {
  const classes = await classModel.byTeacher(req.session.user.id);
  const weekly = { Monday:[], Tuesday:[], Wednesday:[], Thursday:[], Friday:[], Saturday:[], Sunday:[] };
  classes.forEach(k => (k.schedule||[]).forEach(s => {
    if (weekly[s.day]) weekly[s.day].push({ className: k.name, time: s.time });
  }));
  res.render('teacher_dashboard', { teacher: req.session.user, classes, weekly });
});

// Class view + roster + tests
router.get('/classes/:id', async (req, res) => {
  const klass = await classModel.findClassById(Number(req.params.id));
  if (!klass) return res.status(404).send('Not found');
  const users = await userModel.getAll();
  const students = users.filter(u => u.role === 'student' && (klass.studentIds || []).includes(u.id));
 const today = new Date().toISOString().slice(0,10);
  const attendanceToday = (klass.attendance || []).find(a => a.date === today) || { present: [] };
  res.render('teacher_view_class', { klass, students, today, attendanceToday });
});

// new test creation form
router.get('/classes/:id/tests/new', async (req, res) => {
  const klass = await classModel.findClassById(Number(req.params.id));
  if (!klass) return res.status(404).send('Not found');
  res.render('create_test', { klass });
});

// generate and save a test
router.post('/classes/:id/tests', async (req, res) => {
  const classId = Number(req.params.id);
  const { title, lecture, questionCount, optionCount } = req.body;
  const questions = generateQuestions(
    lecture || '',
    Number(questionCount) || 0,
    Number(optionCount) || 4,
    title || ''
  );
  await classModel.addTest(classId, { title, questions });
  const lines = questions.map(q => {
    const optionCells = [];
    for (let i = 0; i < 7; i++) optionCells.push(q.options[i] || '');
    return [
      q.question,
      q.options[q.answer] || '',
      q.explanation || '',
      q.picture || '',
      ...optionCells,
      title,
      q.contentType,
      q.title,
      q.itemType,
      q.path
    ].join('\t');
  }).join('\n');
  const outDir = path.join(__dirname, '..', 'data', 'tests');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${title.replace(/\s+/g, '_')}.tsv`), lines, 'utf8');
  res.redirect(`/teacher/classes/${classId}`);
});

router.post('/classes/:id/lectures', async (req, res) => {
  const classId = Number(req.params.id);
  const { title, url } = req.body;
  if (title && url) {
    await classModel.addLecture(classId, { title: title.trim(), url: url.trim() });
  }
  res.redirect(`/teacher/classes/${classId}#lectures`);
});

router.post('/classes/:id/simulations', async (req, res) => {
  const classId = Number(req.params.id);
  const { title, url } = req.body;
  if (title && url) {
    await classModel.addSimulation(classId, { title: title.trim(), url: url.trim() });
  }
  res.redirect(`/teacher/classes/${classId}#simulations`);
});

router.post('/classes/:id/tests/upload', upload.single('csv'), async (req, res) => {
  const classId = Number(req.params.id);
  const title = (req.body.title || 'Uploaded Test').trim();
  const csv = req.file && req.file.buffer.toString('utf-8');
  if (csv) {
    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    const [, ...rows] = lines; // skip header
    const questions = rows.map(line => {
      const cols = line.split(',');
      return {
        question: cols[0],
        answer: cols[1],
        explanation: cols[2],
        picture: cols[3],
        options: cols.slice(4, 11).filter(Boolean),
        test: cols[11],
        contentType: cols[12],
        title: cols[13],
        itemType: cols[14],
        path: cols[15]
      };
    });
    await classModel.addTest(classId, { title, questions });
  }
  res.redirect(`/teacher/classes/${classId}#tests`);
});

router.post('/classes/:id/tests/generate', async (req, res) => {
  const classId = Number(req.params.id);
  const { title, prompt } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).send('Missing OpenAI API key');
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: `Create a JSON array of questions for ${prompt}. Each item should contain fields: Question, Answer, Explanation, Picture, OptionA, OptionB, OptionC, OptionD, OptionE, OptionF, OptionG, Test, Content Type, Title, Item Type, Path.` }]
      })
    });
    const data = await response.json();
    let items = [];
    try { items = JSON.parse(data.choices[0].message.content); } catch (_) { items = []; }
    const questions = items.map(q => ({
      question: q.Question,
      answer: q.Answer,
      explanation: q.Explanation,
      picture: q.Picture,
      options: [q.OptionA, q.OptionB, q.OptionC, q.OptionD, q.OptionE, q.OptionF, q.OptionG].filter(Boolean),
      test: q.Test,
      contentType: q['Content Type'],
      title: q.Title,
      itemType: q['Item Type'],
      path: q.Path
    }));
    await classModel.addTest(classId, { title: title || 'AI Generated Test', questions });
  } catch (e) {
    console.error('OpenAI error', e);
  }
  res.redirect(`/teacher/classes/${classId}#tests`);
});
// Grade submission (upsert)
router.post('/classes/:id/grades', async (req, res) => {
  const classId = Number(req.params.id);
  const klass = await classModel.findClassById(classId);
  if (!klass) return res.status(404).send('Not found');
  for (const key of Object.keys(req.body)) {
    const m = key.match(/^grade_(\d+)_(\d+)$/);
    if (!m) continue;
    const studentId = Number(m[1]);
    const testId = Number(m[2]);
    const val = req.body[key];
    if (val === '') continue;
    let score = Number(val);
    if (Number.isNaN(score)) continue;
    if (score < 0) score = 0;
    if (score > 100) score = 100;
    await classModel.upsertGrade(classId, testId, studentId, score);
  }
  res.redirect(`/teacher/classes/${classId}`);
});

// View student profile
router.get('/students/:id', async (req, res) => {
  const student = await userModel.findById(Number(req.params.id));
  if (!student) return res.status(404).send('Not found');
  res.render('student_profile', { student, role: 'teacher', reset: req.query.reset });
});

router.post('/students/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  const user = await userModel.findById(id);
  if (!user) return res.status(404).send('Not found');
  const newPassword = crypto.randomBytes(4).toString('hex');
  await userModel.updatePassword(user.username, newPassword);
  if (user.email) {
    try {
      const brand = req.app.locals.branding;
      await transporter.sendMail({
        from: 'no-reply@mdts-apps.com',
        to: user.email,
        subject: 'Password reset',
        text: `Hi ${user.name || 'User'}, your password has been reset. Your new password is: ${newPassword}`,
        html: `
          <div style="font-family:Arial,sans-serif;text-align:center;">
            <img src="${brand.primaryLogo}" alt="Logo" style="max-height:80px;margin-bottom:10px;">
            <p>Hi ${user.name || 'User'}, your password has been reset.</p>
            <p>Your new password is: <strong>${newPassword}</strong></p>
          </div>
        `
      });
    } catch (e) {
      console.error('Error sending reset email', e);
    }
  }
  res.redirect(`/teacher/students/${id}?reset=1`);});

router.get('/', async (req, res) => {
  const classes = await classModel.byTeacher(req.session.user.id);
  const weekly = { Monday:[], Tuesday:[], Wednesday:[], Thursday:[], Friday:[], Saturday:[], Sunday:[] };

  const events = [];
  const now = new Date();
  const threeWeeksFromNow = new Date();
  threeWeeksFromNow.setDate(now.getDate() + 21);

classes.forEach(klass => {
  (klass.schedule || []).forEach(s => {
    const dayIndex = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(s.day);
    let date = new Date(now);
    while (date <= threeWeeksFromNow) {
      if (date.getDay() === dayIndex) {
        events.push({
          title: klass.name + ' (Class)',
          start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), parseInt(s.time), 0),
          url: `/teacher/classes/${klass.id}` // NEW: link to teacher's class view
        });
      }
      date.setDate(date.getDate() + 1);
    }
  });

  (klass.tests || []).forEach(test => {
    if (test.dueDate) {
      const due = new Date(test.dueDate);
      if (due >= now && due <= threeWeeksFromNow) {
        events.push({
          title: klass.name + ' - ' + test.title + ' (Due)',
          start: due,
          url: `/teacher/classes/${klass.id}` // Could link to grade view or test edit
        });
      }
    }
  });
});


  res.render('teacher_dashboard', { teacher: req.session.user, classes, weekly, events });
});
// Attendance submission
router.post('/classes/:id/attendance', async (req, res) => {
  const classId = Number(req.params.id);
  const date = req.body.date || new Date().toISOString().slice(0,10);
  const presentIds = Object.keys(req.body)
    .filter(k => k.startsWith('present_'))
    .map(k => Number(k.replace('present_', '')));
  await classModel.recordAttendance(classId, date, presentIds);
  res.redirect(`/teacher/classes/${classId}`);
});

// Attendance report for a class
router.get('/classes/:id/attendance', async (req, res) => {
  const klass = await classModel.findClassById(Number(req.params.id));
  if (!klass) return res.status(404).send('Not found');
  const users = await userModel.getAll();
  const students = users.filter(u => u.role === 'student' && (klass.studentIds || []).includes(u.id));
  res.render('attendance_report', { klass, students });
});

router.get('/reports/class/:id', async (req, res) => {
  const id = Number(req.params.id);
  const klass = await classModel.findClassById(id);
  if (!klass || klass.teacherId !== req.session.user.id) return res.status(404).send('Not found');
  const users = await userModel.getAll();
  const students = users.filter(u => u.role === 'student' && (klass.studentIds || []).includes(u.id));
  res.render('class_report', { klass, students, scope: 'teacher' });
});

// Reports
router.get('/reports', async (req, res) => {
  const classes = await classModel.byTeacher(req.session.user.id);
  const users = await userModel.getAll();
  const studentMap = Object.fromEntries(users.filter(u => u.role === 'student').map(u => [u.id, u]));
  const report = classes.map(k => ({
    classId: k.id,
    className: k.name,
    students: (k.studentIds || []).map(id => studentMap[id]?.name || `Student#${id}`).join(', '),
    tests: (k.tests || []).length,
    grades: (k.grades || []).length
  }));
  res.render('reports', { report, scope: 'teacher' });
});

module.exports = router;
