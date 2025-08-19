const express = require('express');
const router = express.Router();
const announcementModel = require('../models/announcementModel');

const classModel = require('../models/classModel');
const { generateQuestions } = require('../utils/questionGenerator');

const discussionModel = require('../models/discussionModel');
const userModel = require('../models/userModel');
const nodemailer = require('nodemailer');
const messageModel = require('../models/messageModel');

const transporter = nodemailer.createTransport({
  host: 'mdts-apps.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

router.use((req, res, next) => {
  if (!req.session || req.session.role !== 'student') return res.status(403).send('Forbidden');
  next();
});

router.get('/mailbox', async (req, res) => {
  const messages = await messageModel.getMailbox(req.session.user.id);
  const allUsers = await userModel.getAll();
  const userMap = new Map(allUsers.map(u => [u.id, u]));
  const formatted = messages.map(m => ({
    ...m,
    fromName: userMap.get(m.senderId)?.name || `User ${m.senderId}`,
    toName: userMap.get(m.recipientId)?.name || `User ${m.recipientId}`
  }));
  const teachers = allUsers.filter(u => u.role === 'teacher');
  res.render('mailbox', { messages: formatted, users: teachers, user: req.session.user });
});

router.post('/mailbox', async (req, res) => {
  const recipientId = Number(req.body.to);
  const { subject, body } = req.body;
  if (recipientId && body) {
    await messageModel.sendMessage(req.session.user.id, recipientId, subject || '', body);
  }
  res.redirect('/student/mailbox');
});





router.get('/classes/:id', async (req, res) => {
  const id = Number(req.params.id);
  const klass = await classModel.findClassById(id);
  if (!klass) return res.status(404).send('Not found');
 const discussions = await discussionModel.getByClass(id);
  res.render('view_class', { klass, studentView: true, discussions });});

  router.post('/classes/:id/discussion', async (req, res) => {
  const classId = Number(req.params.id);
  const { message } = req.body;
  if (message && message.trim()) {
    await discussionModel.addMessage(classId, req.session.user.id, message.trim());
    const klass = await classModel.findClassById(classId);
    const teacher = await userModel.findById(klass.teacherId);
    if (teacher && teacher.email) {
      try {
        await transporter.sendMail({
          to: teacher.email,
          from: process.env.SMTP_USER,
          subject: `New discussion message for ${klass.name}`,
          text: message.trim()
        });
      } catch (e) {
        console.error('Email send failed', e);
      }
    }
  }
  res.redirect(`/student/classes/${classId}#discussion`);
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

  // Latest grades, current grade per class, and pending tasks/homework
  const latestGrades = [];
    const currentGrades = {};

  const tasks = [];

  my.forEach(klass => {
    const studentGrades = (klass.grades || []).filter(g => g.studentId === req.session.user.id);

    if (studentGrades.length) {
          // current average grade for this class
      const avg = Math.round(studentGrades.reduce((sum, g) => sum + g.score, 0) / studentGrades.length);
      currentGrades[klass.id] = avg;

      // latest graded test info
      studentGrades.sort((a, b) => new Date(b.gradedAt) - new Date(a.gradedAt));
      const latest = studentGrades[0];
      const testInfo = (klass.tests || []).find(t => t.id === latest.testId);
      latestGrades.push({
        className: klass.name,
        testTitle: testInfo ? testInfo.title : `Test ${latest.testId}`,
        score: latest.score,
        gradedAt: latest.gradedAt
      });
    }

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

        const graded = studentGrades.some(g => g.testId === test.id);
        if (due >= now && !graded) {
          tasks.push({
            className: klass.name,
            title: test.title,
            dueDate: test.dueDate,
            classId: klass.id,
            testId: test.id
          });
        }
      }
    });
  });
   const announcements = await announcementModel.forStudent(req.session.user.id);

  res.render('student_dashboard', {
    user: req.session.user,
    classes: my,
    events,
    latestGrades,
   tasks,
    currentGrades,
        announcements
  });
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
