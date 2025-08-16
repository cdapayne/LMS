const express = require('express');
const router = express.Router();

const classModel = require('../models/classModel');
const userModel = require('../models/userModel');
const store = require('../models/dataStore');

router.use((req, res, next) => {
  if (!req.session || req.session.role !== 'admin') return res.status(403).send('Forbidden');
  next();
});

router.get('/', async (req, res) => {
  const users = await store.loadUsers();
  const classes = await store.loadClasses();
  const teachers = users.filter(u => u.role === 'teacher');
  const students = users.filter(u => u.role === 'student');
  res.render('admin_dashboard', { user: req.session.user, classes, teachers, students });
});

router.get('/approvals', async (_req, res) => {
  const users = await store.loadUsers();
  const pending = users.filter(u => u.role === 'student' && (u.status === 'pending' || !u.status));
  res.render('admin_pending', { pending });
});
router.post('/approve/:id', async (req, res) => {
  await userModel.setStatus(Number(req.params.id), 'approved');
  res.redirect('/admin/approvals');
});
router.post('/decline/:id', async (req, res) => {
  await userModel.setStatus(Number(req.params.id), 'declined');
  res.redirect('/admin/approvals');
});

router.get('/students/:id', async (req, res) => {
  const student = await userModel.findById(Number(req.params.id));
  if (!student) return res.status(404).send('Not found');
  res.render('student_profile', { student });
});


// New class form
router.get('/classes/new', async (req, res) => {
  const users = await store.loadUsers();
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
    const name = (req.body.name || '').trim();
    const description = (req.body.description || '').trim();
    const teacherId = Number(req.body.teacherId || 0);
    if (!name || !teacherId) {
      const users = await store.loadUsers();
      const teachers = users.filter(u => u.role === 'teacher');
      return res.status(400).render('create_class', { teachers, error: 'Name and Teacher are required.' });
    }

    // schedule arrays (day[], time[])
    const days = Array.isArray(req.body.day) ? req.body.day : (req.body.day ? [req.body.day] : []);
    const times = Array.isArray(req.body.time) ? req.body.time : (req.body.time ? [req.body.time] : []);
    const schedule = [];
    for (let i = 0; i < Math.max(days.length, times.length); i++) {
      const d = (days[i] || '').trim();
      const t = (times[i] || '').trim();
      if (d && t) schedule.push({ day: d, time: t });
    }

    const klass = await classModel.createClass({ name, description, teacherId, schedule });
    return res.redirect(`/admin/classes/${klass.id}`);
  } catch (e) {
    console.error(e);
    const users = await store.loadUsers();
    const teachers = users.filter(u => u.role === 'teacher');
    return res.status(500).render('create_class', { teachers, error: 'Could not create class.' });
  }
});


router.get('/classes', async (_req, res) => {
  const classes = await classModel.getAllClasses();
  const users = await store.loadUsers();
  const teacherMap = Object.fromEntries(users.filter(u => u.role === 'teacher').map(u => [u.id, u.name]));
  res.render('class_list', { classes, teacherMap });
});

router.get('/classes/:id', async (req, res) => {
  const id = Number(req.params.id);
  const klass = await classModel.findClassById(id);
  if (!klass) return res.status(404).send('Not found');
  const users = await store.loadUsers();
  const students = users.filter(u => u.role === 'student');
  const classStudents = students.filter(s => (klass.studentIds||[]).includes(s.id));
  res.render('view_class', { klass, students, classStudents, studentView: false });
});

router.post('/classes/:id/add-student', async (req, res) => {
  const id = Number(req.params.id);
  const studentId = Number(req.body.studentId);
  await classModel.addStudent(id, studentId);
  res.redirect(`/admin/classes/${id}`);
});

// Teacher list
router.get('/teachers', async (req, res) => {
  const users = await store.loadUsers();
  const teachers = users.filter(u => u.role === 'teacher');
  res.render('teacher_list', { teachers });
});

// Delete teacher
router.post('/teachers/:id/delete', async (req, res) => {
  const id = Number(req.params.id);
  let users = await store.loadUsers();
  users = users.filter(u => !(u.role === 'teacher' && u.id === id));
  await store.saveUsers(users);
  res.redirect('/admin/teachers');
});

// Edit teacher (placeholder)
router.get('/teachers/:id/edit', async (req, res) => {
  const teacher = (await store.loadUsers()).find(u => u.role === 'teacher' && u.id === Number(req.params.id));
  if (!teacher) return res.status(404).send('Not found');
  // For now, just send back JSON — you can later make an edit form view
  res.json(teacher);
});


router.post('/classes/:id/add-test', async (req, res) => {
  const id = Number(req.params.id);
  const title = (req.body.title || 'Untitled Test');
  const dueDate = req.body.dueDate || null;

  const questions = [];
  // Expect inputs like q0, o0_0..o0_3, a0
  for (let i=0;i<10;i++) {
    const q = req.body[`q${i}`];
    if (!q) continue;
    const opts = [0,1,2,3].map(ix => req.body[`o${i}_${ix}`]).filter(Boolean);
    const ans = parseInt(req.body[`a${i}`] ?? 0, 10);
    questions.push({ question: q, options: opts, answer: ans });
  }
 await classModel.addTest(id, { title, questions, dueDate });
  res.redirect(`/admin/classes/${id}`);
});

router.get('/reports', async (_req, res) => {
  const classes = await store.loadClasses();
  const users = await store.loadUsers();
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

module.exports = router;
