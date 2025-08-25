const express = require('express');
const router = express.Router();
const announcementModel = require('../models/announcementModel');

const classModel = require('../models/classModel');
const { generateQuestions } = require('../utils/questionGenerator');
const testModel = require('../models/testModel');

const discussionModel = require('../models/discussionModel');
const userModel = require('../models/userModel');
const nodemailer = require('nodemailer');
const messageModel = require('../models/messageModel');
const emailTemplates = require('../utils/emailTemplates');
const multer = require('multer');
const path = require('path');

const fs = require('fs');
const CONFIG_PATH = path.join(__dirname, '..', 'data', 'signature-docs.json');

let signatureDocsConfig = {};
function loadSignatureDocsConfig() {
  try {
    signatureDocsConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error('Failed to load signature-docs.json:', err.message);
    signatureDocsConfig = {};
  }
}
loadSignatureDocsConfig();

const transporter = nodemailer.createTransport({
  host: 'mdts-apps.com',
  port: 465,
  secure: true,
  auth: {
     user: 'noreply@mdts-apps.com',
    pass: 'c@r,5ysPI@&s'
  }
});


router.use((req, res, next) => {
  if (!req.session || req.session.role !== 'student') return res.status(403).send('Forbidden');
  next();
});
router.get('/profile', async (req, res) => {
  const student = await userModel.findById(req.session.user.id);
  if (!student) return res.status(404).send('Not found');
  res.render('student_profile', { student, role: 'student', signatureDocsConfig });
});

router.post('/profile/complete', (req, res) => {
  upload(req, res, async (err) => {
    const student = await userModel.findById(req.session.user.id);
    if (!student) return res.status(404).send('Not found');
    if (err) return res.status(400).render('student_profile', { student, role: 'student', step2Error: err.message,  signatureDocsConfig   });
    const { ssn: rawSSN, emergencyName, emergencyRelation, emergencyPhone, agree, grievanceAck } = req.body;
    const ssn = rawSSN ? String(rawSSN).replace(/\D/g, '') : undefined;
    if (!agree) {
      return res.status(400).render('student_profile', { student, role: 'student', step2Error: 'You must agree to the registration agreement.',signatureDocsConfig });
    }
    try {
      const docs = (student.profile && student.profile.documents) || [];
      const reg = docs.find(d => d.type === 'registration-agreement');
      if (reg) reg.agreed = true;
      await userModel.updateProfile(student.id, {
        ssn,
        emergencyContact: { name: emergencyName, relation: emergencyRelation, phone: emergencyPhone },
        grievanceAcknowledged: !!grievanceAck,
        documents: docs
      });
      if (req.files) {
        const collected = [];
        if (Array.isArray(req.files.gedDoc)) collected.push(...req.files.gedDoc);
        if (Array.isArray(req.files.govIdDoc)) collected.push(...req.files.govIdDoc);
        if (collected.length) {
          const uploads = collected.map(f => ({
            originalName: f.originalname,
            mimeType: f.mimetype,
            size: f.size,
            url: `/docs/stxd/${f.filename}`
          }));
          await userModel.addUploads(student.id, uploads);
        }
      }
      res.redirect('/student/profile');
    } catch (e) {
      console.error('student complete', e);
      res.status(500).render('student_profile', { student, role: 'student', step2Error: 'Failed to update profile.' });
    }
  });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../docs/stxd')),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Invalid file type'));
  }
}).fields([
  { name: 'gedDoc', maxCount: 1 },
  { name: 'govIdDoc', maxCount: 1 }
]);

router.post('/sign-doc', async (req, res) => {
  const { docType, signatureDataUrl } = req.body;
  if (docType && signatureDataUrl) {
    try {
      const user = await userModel.signDocument(req.session.user.id, docType, signatureDataUrl);
      const docs = (user.profile && user.profile.documents) || [];
      const pending = docs.filter(d => !d.requiredRole && !d.signatureDataUrl);
      if (!pending.length) {
        try { await userModel.markApplicationComplete(req.session.user.id); } catch (err) { console.error('complete mark', err); }
      }
    } catch (e) { console.error('student sign', e); }
  }
  res.redirect('/student/profile');
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

router.get('/simplify', (req, res) => {
  res.render('topic_helper', { user: { role: 'student' }, result: null, topic: '' });
});

router.post('/simplify', async (req, res) => {
  const { topic } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;
  let result = '';
  if (!apiKey) result = 'Missing OpenAI API key';
  if (!topic) result = 'Topic is required';
  if (!result) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: `Explain the following in simple terms for a 5th grade student: ${topic}` }]
        })
      });
      const data = await response.json();
      result = data.choices?.[0]?.message?.content || 'No summary generated';
    } catch (e) {
      console.error('OpenAI error', e);
      result = 'Error generating summary';
    }
  }
  res.render('topic_helper', { user: { role: 'student' }, result, topic });
});

router.post('/mailbox', async (req, res) => {
  const recipientId = Number(req.body.to);
  const { subject, body } = req.body;
  if (recipientId && body) {
    await messageModel.sendMessage(req.session.user.id, recipientId, subject || '', body);
  }
  res.redirect('/student/mailbox');
});

router.get('/powerpoint', (req, res) => {
  const { url, title } = req.query;
  if (!url) return res.status(400).send('Missing URL');
  res.render('powerpoint', { url, title: title || 'PowerPoint' });
});



router.get('/classes/:id', async (req, res) => {
  const id = Number(req.params.id);
  const klass = await classModel.findClassById(id);
  if (!klass) return res.status(404).send('Not found');
  const teacher = await userModel.findById(klass.teacherId);
  const discussions = await discussionModel.getByClass(id);
  const testGrades = {};
  const assignmentGrades = {};
  if (klass.grades && req.session.user) {
    klass.grades
      .filter(g => g.studentId === req.session.user.id)
      .forEach(g => {
        if (g.testId) {
          testGrades[g.testId] = Math.max(testGrades[g.testId] || 0, g.score || 0);
        }
        if (g.assignmentId) {
          assignmentGrades[g.assignmentId] = Math.max(assignmentGrades[g.assignmentId] || 0, g.score || 0);
        }
      });
  }
  res.render('view_class', { klass, studentView: true, discussions, teacher, testGrades, assignmentGrades });
});

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

router.get('/teachers/:id', async (req, res) => {
  const teacher = await userModel.findById(Number(req.params.id));
  if (!teacher || teacher.role !== 'teacher') return res.status(404).send('Not found');
  res.render('teacher_profile', { teacher, role: 'student' });
});

router.get('/classes/:id/tests/:testId', async (req, res) => {
  const id = Number(req.params.id);
  const testId = Number(req.params.testId);
  console.log('Student test page', { classId: id, testId, userId: req.session.user.id });
  const klass = await classModel.findClassById(id);
  if (!klass) {
    console.log('Class not found', id);
    return res.status(404).send('Not found');
  }
  const test = (klass.tests || []).find(t => t.id === testId);
  if (!test) {
    console.log('Test not found', { classId: id, testId });
    return res.status(404).send('Test not found');
  }
  test.questions = await testModel.getQuestionsByTest(test.title);
  const existing = (klass.grades || []).find(g => g.testId === testId && g.studentId === req.session.user.id);
  const attempts = existing ? existing.attempt || 0 : 0;
  if (attempts >= 5) return res.status(403).send('No attempts remaining');
  res.render('take_test', {
    klass,
    test,
    attempts,
    user: req.session.user,
    action: `/student/classes/${id}/tests/${testId}`
  });
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
  const studentGrades = (klass.grades || []).filter(
      g => g.studentId === req.session.user.id && g.testId !== undefined
    );
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
        const [sh, sm] = String(s.start || '0:0').split(':').map(Number);
        events.push({
            title: klass.name + ' (Class)',
            start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), sh, sm || 0),
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

router.post('/announcements/:id/delete', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isNaN(id)) {
    await announcementModel.remove(id);
  }
  res.redirect('/student');
});

// study mode for existing tests
router.get('/classes/:id/tests/:testId/study', async (req, res) => {
  const classId = Number(req.params.id);
  const testId = Number(req.params.testId);
  const klass = await classModel.findClassById(classId);
  if (!klass) return res.status(404).send('Not found');
  const test = (klass.tests || []).find(t => t.id === testId);
  if (!test) return res.status(404).send('Test not found');
  test.questions = await testModel.getQuestionsByTest(test.title);

  if (!req.session.study) req.session.study = {};
  if (!req.session.study[testId]) {
    req.session.study[testId] = { index: 0, correct: 0, start: Date.now() };
  }
  const progress = req.session.study[testId];
  const total = test.questions.length;

  if (progress.index >= total) {
    const score = Math.round((progress.correct / total) * 100);
    delete req.session.study[testId];
    return res.render('test_result', { klass, test, score, student: req.session.user, user: req.session.user });
  }

  const question = test.questions[progress.index];
  const totalSeconds = (test.timeLimit || 90) * total;
  const elapsed = Math.floor((Date.now() - progress.start) / 1000);
  const remaining = Math.max(totalSeconds - elapsed, 0);

  res.render('study_mode', {
    klass,
    test,
    question,
    index: progress.index,
    correct: progress.correct,
    total,
    answered: progress.index,
    remaining
  });
});

router.post('/classes/:id/tests/:testId/study', async (req, res) => {
  const classId = Number(req.params.id);
  const testId = Number(req.params.testId);
  const klass = await classModel.findClassById(classId);
  if (!klass) return res.status(404).send('Not found');
  const test = (klass.tests || []).find(t => t.id === testId);
  if (!test) return res.status(404).send('Test not found');
   test.questions = await testModel.getQuestionsByTest(test.title);

  if (!req.session.study || !req.session.study[testId]) {
    return res.redirect(`/student/classes/${classId}/tests/${testId}/study`);
  }
  const progress = req.session.study[testId];
  const total = test.questions.length;
  const question = test.questions[progress.index];
  const chosen = Number(req.body.choice);
  const correct = Number(question.answer) === chosen;
  if (correct) progress.correct++;
  progress.index++;
  const totalSeconds = (test.timeLimit || 90) * total;
  const elapsed = Math.floor((Date.now() - progress.start) / 1000);
  const remaining = Math.max(totalSeconds - elapsed, 0);

  res.render('study_mode', {
    klass,
    test,
    question,
    index: progress.index - 1,
    correct: progress.correct,
    total,
    answered: progress.index,
    remaining,
    feedback: { chosen, correct },
    isLast: progress.index >= total
  });
});

router.post('/classes/:id/tests/:testId', async (req, res) => {
  const id = Number(req.params.id);
  const testId = Number(req.params.testId);
  console.log('Student submit test', { classId: id, testId, userId: req.session.user.id });
  const klass = await classModel.findClassById(id);
  if (!klass) return res.status(404).send('Not found');
  const test = (klass.tests || []).find(t => t.id === testId);
  if (!test) return res.status(404).send('Test not found');
  test.questions = await testModel.getQuestionsByTest(test.title);

  let score = 0;
  test.questions.forEach((q, i) => {
    const chosen = Number(req.body[`q_${i}`]);
   const correct = Number(q.answer);
    if (!Number.isNaN(chosen) && chosen === correct) score++;  });
  const pct = Math.round((score / test.questions.length) * 100);
  await classModel.recordGrade(id, testId, req.session.user.id, pct);
  console.log('Grade recorded', { classId: id, testId, userId: req.session.user.id, score: pct });
  res.render('test_result', { klass, test, score: pct, student: req.session.user, user: req.session.user });
});

module.exports = router;
