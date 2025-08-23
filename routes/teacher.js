const express = require('express');
const router = express.Router();
const classModel = require('../models/classModel');
const userModel = require('../models/userModel');
const db = require('../models/db');
const { generateQuestions } = require('../utils/questionGenerator');
const announcementModel = require('../models/announcementModel');
const discussionModel = require('../models/discussionModel');
const messageModel = require('../models/messageModel');
const emailTemplates = require('../utils/emailTemplates');
const testModel = require('../models/testModel');

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
  host: 'mdts-apps.com',
  port: 465,
  secure: true,
  auth: {
    user: 'noreply@mdts-apps.com',
    pass: 'c@r,5ysPI@&s'
  }
});
const multer = require('multer');
const upload = multer();

// Storage for test media uploads
const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const mediaUpload = multer({ storage: mediaStorage });

router.use((req, res, next) => {
  if (!req.session || req.session.role !== 'teacher') return res.status(403).send('Forbidden');
  next();
});

router.get('/profile', async (req, res) => {
  const teacher = await userModel.findById(req.session.user.id);
  res.render('teacher_profile', { teacher, role: 'teacher', saved: req.query.saved });
});

router.post('/profile', mediaUpload.single('photo'), async (req, res) => {
  const id = req.session.user.id;
  if (req.file) {
    await userModel.updateProfile(id, {
      photo: {
        url: `/uploads/${req.file.filename}`,
        originalName: req.file.originalname
      }
    });
  }
  res.redirect('/teacher/profile?saved=1');
});


// Dashboard with weekly schedule and announcements
router.get('/', async (req, res) => {
  const classes = await classModel.byTeacher(req.session.user.id);
  const users = await userModel.getAll();
  const students = users.filter(u => u.role === 'student');
  const pendingStudents = students.filter(u => u.status === 'pending' || !u.status);
  const approvedStudents = students.filter(u => u.status === 'approved');
  const classSizes = classes.map(c => ({ name: c.name, size: (c.studentIds || []).length }));
  const weekly = { Monday:[], Tuesday:[], Wednesday:[], Thursday:[], Friday:[], Saturday:[], Sunday:[] };
  classes.forEach(k => (k.schedule||[]).forEach(s => {
    if (weekly[s.day]) weekly[s.day].push({ className: k.name, start: s.start, end: s.end });
  }));
  const announcements = await announcementModel.forTeacher(req.session.user.id);
    res.render('teacher_dashboard', {
    teacher: req.session.user,
    classes,
    weekly,
    pendingCount: pendingStudents.length,
    approvedCount: approvedStudents.length,
    classSizes,
    announcements
  });
});

router.get('/simplify', (req, res) => {
  res.render('topic_helper', { user: { role: 'teacher' }, result: null, topic: '' });
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
  res.render('topic_helper', { user: { role: 'teacher' }, result, topic });
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
  const students = allUsers.filter(u => u.role === 'student');
  res.render('mailbox', { messages: formatted, users: students, user: req.session.user });
});

router.post('/mailbox', async (req, res) => {
  const recipientId = Number(req.body.to);
  const { subject, body } = req.body;
  if (recipientId && body) {
    await messageModel.sendMessage(req.session.user.id, recipientId, subject || '', body);
  }
  res.redirect('/teacher/mailbox');
});

router.post('/announcements', async (req, res) => {
  const { message, classId } = req.body;
  if (message && classId) {
    await announcementModel.create({ authorId: req.session.user.id, audience: 'class', classId: Number(classId), message });
  }
  res.redirect('/teacher');
});

// Class view + roster + tests
router.get('/classes/:id', async (req, res) => {
  const klass = await classModel.findClassById(Number(req.params.id));
  if (!klass) return res.status(404).send('Not found');
  const users = await userModel.getAll();
  const students = users.filter(u => u.role === 'student' && (klass.studentIds || []).includes(u.id));
 const today = new Date().toISOString().slice(0,10);
  const attendanceToday = (klass.attendance || []).find(a => a.date === today) || { present: [] };
  const discussions = await discussionModel.getByClass(klass.id);
  res.render('teacher_view_class', { klass, students, today, attendanceToday, discussions });
});

// add discussion message
router.post('/classes/:id/discussion', async (req, res) => {
  const classId = Number(req.params.id);
  const { message } = req.body;
  if (message && message.trim()) {
    await discussionModel.addMessage(classId, req.session.user.id, message.trim());
    const klass = await classModel.findClassById(classId);
    const teacher = await userModel.findById(klass.teacherId);
    if (teacher && teacher.email) {
      try {
        const { subject, html, text } = emailTemplates.render('discussionNotification', {
          klassName: klass.name,
          message: message.trim()
        });
        await transporter.sendMail({
          to: teacher.email,
          from: process.env.SMTP_USER,
          subject,
          html,
          text
        });
      } catch (e) {
        console.error('Email send failed', e);
      }
    }
  }
  res.redirect(`/teacher/classes/${classId}#discussion`);
});
router.post('/classes/:id/checklist', async (req, res) => {
  const classId = Number(req.params.id);
  const items = Array.isArray(req.body.item) ? req.body.item : (req.body.item ? [req.body.item] : []);
  const done = Array.isArray(req.body.done) ? req.body.done.map(Number) : (req.body.done ? [Number(req.body.done)] : []);
  const checklist = items.map((text, idx) => ({ text, done: done.includes(idx) }));
  await classModel.updateChecklist(classId, checklist);
  res.redirect(`/teacher/classes/${classId}`);
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
  const { title, lecture, questionCount, optionCount, timeLimit } = req.body;
  const questions = generateQuestions(
    lecture || '',
    Number(questionCount) || 0,
    Number(optionCount) || 4,
    title || ''
  );
  await testModel.replaceTestQuestions(title, questions);
  await classModel.addTest(classId, { title, timeLimit: Number(timeLimit) || 90 });
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

router.post('/classes/:id/lectures', mediaUpload.single('ppt'), async (req, res) => {
  const classId = Number(req.params.id);
  const { title, url, isPowerPoint } = req.body;
  let finalUrl = url && url.trim();
  if (isPowerPoint && req.file) {
    finalUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  }
  if (title && finalUrl) {
    await classModel.addLecture(classId, {
      title: title.trim(),
      url: finalUrl,
      isPowerPoint: !!isPowerPoint
    });
  }
  res.redirect(`/teacher/classes/${classId}#lectures`);
});

router.post('/classes/:id/assignments', async (req, res) => {
  const classId = Number(req.params.id);
  const { title, url } = req.body;
  if (title && url) {
    await classModel.addAssignment(classId, { title: title.trim(), url: url.trim() });
  }
  res.redirect(`/teacher/classes/${classId}#assignments`);
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
      const timeLimit = Number(req.body.timeLimit) || 90;

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
      await testModel.replaceTestQuestions(title, questions);
      await classModel.addTest(classId, { title, timeLimit });
    }
    res.redirect(`/teacher/classes/${classId}#tests`);
  });

// Upload media assets for tests
router.post('/classes/:id/tests/media', mediaUpload.single('media'), (req, res) => {
  const classId = Number(req.params.id);
  if (!req.file) return res.status(400).send('No file uploaded');
  res.redirect(`/teacher/classes/${classId}#tests`);
});


router.post('/classes/:id/tests/generate', async (req, res) => {
  const classId = Number(req.params.id);
  const { title, prompt, timeLimit } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).send('Missing OpenAI API key');

  try {
    // 1) Call OpenAI – ask for JSON **only**
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo', // swap to a current model in your env if needed
        messages: [
          {
            role: 'system',
            content:
              'You are a data generator. Respond with ONLY a JSON array, no prose, no code fences.'
          },
          {
            role: 'user',
            content:
              `Create a JSON array of questions for: ${prompt}.
Each array item must be an object with the EXACT keys:
"Question","Answer","Explanation","Picture",
"OptionA","OptionB","OptionC","OptionD","OptionE","OptionF","OptionG",
"Test","Content Type","Title","Item Type","Path".
Do not include any extra keys. Do not include backticks or code fences.`
          }
        ],
        temperature: 0.2
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('OpenAI error payload:', data);
      return res.status(502).send('AI generation failed');
    }

    let raw = data?.choices?.[0]?.message?.content || '';
    // 2) Strip code fences if the model still included them
    raw = raw.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();

    // 3) Parse and validate
    let items;
    try {
      items = JSON.parse(raw);
    } catch (e) {
      console.error('JSON parse error. Raw content:', raw);
      items = [];
    }
    if (!Array.isArray(items)) {
      console.error('Model did not return an array. Content:', raw);
      items = [];
    }

    const testTitle = title || 'AI Generated Test';

    // 4) Prepare SQL and insert
    const sql = `
      INSERT INTO mdtsapps_myclass.LMSTest5
      (Question, Answer, Explanation, Picture,
       OptionA, OptionB, OptionC, OptionD, OptionE, OptionF, OptionG,
       Test, \`Content Type\`, Title, \`Item Type\`, Path)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    // If you're using mysql2/promise:
    // const [stmt] = await db.prepare(sql);  // if you use prepare()
    // We'll just execute per-row here:
    let inserted = 0;
    for (const obj of items) {
      // 5) Defensive access (normalize keys in case of casing drift)
      const get = (k) => obj?.[k] ?? '';

      const values = [
        get('Question'),
        get('Answer'),
        get('Explanation'),
        get('Picture'),
        get('OptionA'),
        get('OptionB'),
        get('OptionC'),
        get('OptionD'),
        get('OptionE'),
        get('OptionF'),
        get('OptionG'),
        get('Test') || testTitle,
        get('Content Type'),
        get('Title'),
        get('Item Type'),
        get('Path')
      ];

      try {
        // mysql2/promise:
        // await db.execute(sql, values);
        await db.query(sql, values); // works if your helper wires to execute internally
        inserted++;
      } catch (dbErr) {
        console.error('DB insert error for values:', values, dbErr);
      }
    }

    // 6) Record the test on the class regardless of per-row failures
    try {
      await classModel.addTest(classId, {
        title: testTitle,
        timeLimit: Number(timeLimit) || 90
      });
    } catch (e) {
      console.error('classModel.addTest failed:', e);
    }

    console.log(`Inserted ${inserted} question rows into LMSTest5.`);
    res.redirect(`/teacher/classes/${classId}#tests`);
  } catch (e) {
    console.error('Route error', e);
    res.status(500).send('Unexpected error');
  }
});
// Grade submission (upsert)
router.post('/classes/:id/grades', async (req, res) => {
  const classId = Number(req.params.id);
  const klass = await classModel.findClassById(classId);
  if (!klass) return res.status(404).send('Not found');
  // Test grades (if any were submitted)
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

  // Assignment grades
  for (const studentId of klass.studentIds || []) {
    for (const a of klass.assignments || []) {
      const key = `asg_${studentId}_${a.id}`;
      const val = req.body[key];
      if (val === undefined || val === '') continue;
      let score = Number(val);
      if (Number.isNaN(score)) continue;
      if (score < 0) score = 0;
      if (score > 100) score = 100;
      await classModel.upsertAssignmentGrade(classId, a.id, Number(studentId), score);
    }
    for (const l of klass.simulations || []) {
      const key = `lab_${studentId}_${l.id}`;
      const passed = !!req.body[key];
      await classModel.upsertLabStatus(classId, l.id, Number(studentId), passed);
    }
  }

  res.redirect(`/teacher/classes/${classId}#grades`);
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
      const { subject, html, text } = emailTemplates.render('passwordReset', {
        name: user.name || 'User',
        newPassword
      });
      await transporter.sendMail({
        from: 'no-reply@mdts-apps.com',
        to: user.email,
        subject,
        html,
        text
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
        const [sh, sm] = String(s.start || '0:0').split(':').map(Number);
        events.push({
          title: klass.name + ' (Class)',
          start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), sh, sm || 0),
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
