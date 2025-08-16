const express = require('express');
const router = express.Router();

const classModel = require('../models/classModel');
const userModel = require('../models/userModel');
const store = require('../models/dataStore');

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
  const users = await store.loadUsers();
  const students = users.filter(u => u.role === 'student' && (klass.studentIds || []).includes(u.id));
  res.render('teacher_view_class', { klass, students });
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
  res.render('student_profile', { student });
});

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


// Reports
router.get('/reports', async (req, res) => {
  const classes = await classModel.byTeacher(req.session.user.id);
  const users = await store.loadUsers();
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
