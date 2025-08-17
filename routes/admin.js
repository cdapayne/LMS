const express = require('express');
const router = express.Router();

const classModel = require('../models/classModel');
const userModel = require('../models/userModel');

const nodemailer = require('nodemailer');

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
  if (!req.session || req.session.role !== 'admin') return res.status(403).send('Forbidden');
  next();
});

router.get('/', async (req, res) => {
 const users = await userModel.getAll();
  const classes = await classModel.getAllClasses();
  const teachers = users.filter(u => u.role === 'teacher');
  const students = users.filter(u => u.role === 'student');
  res.render('admin_dashboard', { user: req.session.user, classes, teachers, students });
});

async function renderPending(_req, res) {
  const users = await userModel.getAll();
  const pending = users.filter(u => u.role === 'student' && (u.status === 'pending' || !u.status));
  res.render('admin_pending', { pending });
}

router.get('/approvals', renderPending);
router.get('/students/pending', renderPending);
router.post('/approve/:id', async (req, res) => {
  const user = await userModel.setStatus(Number(req.params.id), 'approved');
  if (user && user.email) {
    const name = (user.profile && user.profile.firstName) || user.name || 'Student';
    try {
            const brand = req.app.locals.branding;

      await transporter.sendMail({
        from: 'no-reply@mdts-apps.com',
        to: user.email,
        subject: 'Application approved',
        text: `Hi ${name}, your registration has been approved. You can now log in.`,
        html: `
          <div style="font-family:Arial,sans-serif;text-align:center;">
            <img src="${brand.primaryLogo}" alt="Logo" style="max-height:80px;margin-bottom:10px;">
            <p>Hi ${name}, your registration has been approved. You can now log in.</p>
          </div>
        `      });
    } catch (e) {
      console.error('Error sending approval email', e);
    }
  }  res.redirect('/admin/students/pending');
});
router.post('/decline/:id', async (req, res) => {
  await userModel.setStatus(Number(req.params.id), 'declined');
  res.redirect('/admin/students/pending');
});

router.get('/students/:id', async (req, res) => {
  const student = await userModel.findById(Number(req.params.id));
  if (!student) return res.status(404).send('Not found');
  res.render('student_profile', { student });
});

router.get('/denied', async (_req, res) => {
  const users = await userModel.getAll();
  const denied = users.filter(u => u.role === 'student' && u.status === 'declined');
  res.render('admin_denied', { denied });
});


router.get('/students', async (_req, res) => {
  const users = await userModel.getAll();
  const accepted = users.filter(u => u.role === 'student' && u.status === 'approved');
  res.render('admin_accepted', { students: accepted });
});



// New class form
router.get('/classes/new', async (req, res) => {
  const users = await userModel.getAll();
  const teachers = users.filter(u => u.role === 'teacher');
  res.render('create_class', { teachers, error: null });
});
// GET form for creating teacher
router.get('/teachers/new', (req, res) => {
  res.render('create_teacher', { error: null });
});


// POST create teacher
router.post('/teachers', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password) {
      return res.status(400).render('create_teacher', { error: 'All fields are required.' });
    }
    await userModel.createTeacher({ name: name.trim(), username: username.trim(), email: email.trim(), password });
    res.redirect('/admin');
  } catch (e) {
    console.error(e);
    res.status(500).render('create_teacher', { error: 'Could not create teacher.' });
  }
});

// Create class handler
router.post('/classes', async (req, res) => {
  try {
     const schoolYear = (req.body.schoolYear || '').trim();
    const cohort = (req.body.cohort || '').trim();
    const name = (req.body.name || '').trim();
        const shortName = (req.body.shortName || '').trim();

    const description = (req.body.description || '').trim();
    const teacherId = Number(req.body.teacherId || 0);
        const weeks = Number(req.body.weeks || 0);

    if (!schoolYear || !cohort || !name || !shortName || !teacherId) {
      const teachers = await userModel.getByRole('teacher');
      return res.status(400).render('create_class', { teachers, error: 'School Year, Cohort, Name, Short Name and Teacher are required.' });
    }

    // schedule arrays (day[], time[])
    const days = Array.isArray(req.body.day) ? req.body.day : (req.body.day ? [req.body.day] : []);
    const times = Array.isArray(req.body.time) ? req.body.time : (req.body.time ? [req.body.time] : []);
    const schedule = [];
    for (let i = 0; i < Math.max(days.length, times.length); i++) {
      const d = (days[i] || '').trim();
      const t = (times[i] || '').trim();
 const h = req.body[`holiday${i}`] === 'on' || req.body[`holiday${i}`] === '1';
      if (d && t) schedule.push({ day: d, time: t, holiday: h });    }

        const klass = await classModel.createClass({ schoolYear, cohort, name,  weeks,shortName, description, teacherId, schedule });

    return res.redirect(`/admin/classes/${klass.id}`);
  } catch (e) {
    console.error(e);
     const teachers = await userModel.getByRole('teacher');

    return res.status(500).render('create_class', { teachers, error: 'Could not create class.' });
  }
});


router.get('/classes', async (_req, res) => {
  const classes = await classModel.getAllClasses();
  const users = await userModel.getAll();
  const teacherMap = Object.fromEntries(users.filter(u => u.role === 'teacher').map(u => [u.id, u.name]));
  res.render('class_list', { classes, teacherMap });
});

router.get('/classes/:id', async (req, res) => {
  const id = Number(req.params.id);
  const klass = await classModel.findClassById(id);
  if (!klass) return res.status(404).send('Not found');
  const users = await userModel.getAll();
    const students = users.filter(u => u.role === 'student' && u.status === 'approved');

  const classStudents = students.filter(s => (klass.studentIds||[]).includes(s.id));
  res.render('view_class', { klass, students, classStudents, studentView: false });
});

router.get('/reports/pending-students', async (_req, res) => {
  const users = await userModel.getAll();
  const pending = users.filter(u => u.role === 'student' && (u.status === 'pending' || !u.status));
  res.render('pending_students_report', { pending });
});

router.get('/reports/class/:id', async (req, res) => {
  const id = Number(req.params.id);
  const klass = await classModel.findClassById(id);
  if (!klass) return res.status(404).send('Not found');
  const users = await userModel.getAll();
  const students = users.filter(u => u.role === 'student' && (klass.studentIds || []).includes(u.id));
  res.render('class_report', { klass, students, scope: 'admin' });
});

router.post('/classes/:id/add-student', async (req, res) => {
  const id = Number(req.params.id);
  const studentId = Number(req.body.studentId);
    const student = await userModel.findById(studentId);
  if (!student || student.status !== 'approved') {
    return res.status(400).send('Student not approved');
  }
  await classModel.addStudent(id, studentId);
  res.redirect(`/admin/classes/${id}`);
});

// Teacher list
router.get('/teachers', async (req, res) => {
  const users = await userModel.getAll();
  const teachers = users.filter(u => u.role === 'teacher');
  res.render('teacher_list', { teachers });
});

router.post('/classes/:id/duplicate', async (req, res) => {
  const id = Number(req.params.id);
  const copy = await classModel.duplicateClass(id);
  if (!copy) return res.status(404).send('Not found');
  res.redirect(`/admin/classes/${copy.id}`);
});

// Delete teacher
router.post('/teachers/:id/delete', async (req, res) => {
  const id = Number(req.params.id);
  await userModel.deleteById(id);
  users = users.filter(u => !(u.role === 'teacher' && u.id === id));
  await store.saveUsers(users);
  res.redirect('/admin/teachers');
});

// Edit teacher (placeholder)
router.get('/teachers/:id/edit', async (req, res) => {
 const teacher = (await userModel.getAll()).find(u => u.role === 'teacher' && u.id === Number(req.params.id));  if (!teacher) return res.status(404).send('Not found');
  // For now, just send back JSON — you can later make an edit form view
  res.json(teacher);
});


router.get('/reports', async (_req, res) => {
const classes = await classModel.getAllClasses();
  const users = await userModel.getAll();
  const studentMap = Object.fromEntries(users.filter(u => u.role === 'student').map(u => [u.id, u]));
  const teacherMap = Object.fromEntries(users.filter(u => u.role === 'teacher').map(u => [u.id, u]));

  const report = classes.map(k => ({
    classId: k.id,
    className: k.name,
    teacher: (teacherMap[k.teacherId] || {}).name || 'Unknown',
    students: (k.studentIds || []).map(id => studentMap[id]?.name || `Student#${id}`).join(', '),
    tests: (k.tests || []).length,
    grades: (k.grades || []).length
  }));
  res.render('reports', { report, scope: 'admin' });
});

// Events dashboard for analytics
router.get('/events', async (req, res) => {
  const classes = await classModel.getAllClasses();
  const events = [];
  const now = new Date();
  const threeWeeksFromNow = new Date();
  threeWeeksFromNow.setDate(now.getDate() + 21);
  let classCount = 0;
  let testCount = 0;

  classes.forEach(klass => {
    (klass.schedule || []).forEach(s => {
      const dayIndex = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(s.day);
      let date = new Date(now);
      while (date <= threeWeeksFromNow) {
        if (date.getDay() === dayIndex) {
          events.push({
            title: klass.name + ' (Class)',
            start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), parseInt(s.time), 0),
            type: 'Class',
            className: klass.name
          });
          classCount++;
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
            type: 'Test Due',
            className: klass.name
          });
          testCount++;
        }
      }
    });
  });

  events.sort((a, b) => a.start - b.start);

  res.render('events_dashboard', {
    user: req.session.user,
    events: events.map(e => ({
      ...e,
      date: e.start.toISOString().slice(0, 10),
      time: e.start.toTimeString().slice(0, 5)
    })),
    classCount,
    testCount
  });
});


module.exports = router;
