const express = require('express');
const router = express.Router();

const classModel = require('../models/classModel');
const { generateQuestions } = require('../utils/questionGenerator');

router.use((req, res, next) => {
  if (!req.session || req.session.role !== 'student') return res.status(403).send('Forbidden');
  next();
});

router.get('/', async (req, res) => {
  const classes = await classModel.getAllClasses();
  const my = classes.filter(k => (k.studentIds || []).includes(req.session.user.id));
  res.render('student_dashboard', { user: req.session.user, classes: my });
});

router.get('/classes/:id', async (req, res) => {
  const id = Number(req.params.id);
  const klass = await classModel.findClassById(id);
  if (!klass) return res.status(404).send('Not found');
  res.render('view_class', { klass, studentView: true });
});

router.get('/classes/:id/tests/:testId', async (req, res) => {
  const id = Number(req.params.id);
  const testId = Number(req.params.testId);
  const klass = await classModel.findClassById(id);
  if (!klass) return res.status(404).send('Not found');
  const test = (klass.tests || []).find(t => t.id === testId);
  if (!test) return res.status(404).send('Test not found');
  res.render('take_test', { klass, test });
});

// study helper for custom material
router.get('/study', (req, res) => {
  res.render('study_test');
});

router.post('/study', (req, res) => {
  const { lecture, questionCount, optionCount } = req.body;
  const questions = generateQuestions(
    lecture || '',
    Number(questionCount) || 0,
    Number(optionCount) || 4,
    'Study'
  );
  res.render('study_test', { questions });
});


router.get('/', async (req, res) => {
  const classes = await classModel.getAllClasses();
  const my = classes.filter(k => (k.studentIds || []).includes(req.session.user.id));

  // Build calendar events for next 3 weeks
  const events = [];
  const now = new Date();
  const threeWeeksFromNow = new Date();
  threeWeeksFromNow.setDate(now.getDate() + 21);

my.forEach(klass => {
  (klass.schedule || []).forEach(s => {
    const dayIndex = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(s.day);
    let date = new Date(now);
    while (date <= threeWeeksFromNow) {
      if (date.getDay() === dayIndex) {
        events.push({
          title: klass.name + ' (Class)',
          start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), parseInt(s.time), 0),
          url: `/student/classes/${klass.id}` // NEW: link to class page
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
          url: `/student/classes/${klass.id}/tests/${test.id}` // NEW: link to take/view test
        });
      }
    }
  });
});

  res.render('student_dashboard', { user: req.session.user, classes: my, events });
});

router.post('/classes/:id/tests/:testId', async (req, res) => {
  const id = Number(req.params.id);
  const testId = Number(req.params.testId);
  const klass = await classModel.findClassById(id);
  if (!klass) return res.status(404).send('Not found');
  const test = (klass.tests || []).find(t => t.id === testId);
  if (!test) return res.status(404).send('Test not found');

  let score = 0;
  test.questions.forEach((q, i) => {
    const chosen = Number(req.body[`q_${i}`]);
    if (chosen === q.answer) score++;
  });
  const pct = Math.round((score / test.questions.length) * 100);
  await classModel.recordGrade(id, testId, req.session.user.id, pct);
  res.render('test_result', { klass, test, score: pct });
});

module.exports = router;
