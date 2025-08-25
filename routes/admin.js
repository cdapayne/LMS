const express = require('express');
const router = express.Router();

const classModel = require('../models/classModel');
const userModel = require('../models/userModel');
const db = require('../models/db');
const discussionModel = require('../models/discussionModel');
const preRegModel = require('../models/preRegModel');

const eventModel = require('../models/eventModel');
const rsvpModel = require('../models/rsvpModel');
const emailTemplates = require('../utils/emailTemplates');
const marketingTemplates = require('../data/marketingTemplates.json');
const marketingSubjects = Object.fromEntries(
  Object.entries(marketingTemplates).map(([k, v]) => [k, { subject: v.subject }])
);
const announcementModel = require('../models/announcementModel');
const testModel = require('../models/testModel');
const dripCampaign = require('../utils/dripCampaign');
const dropdowns = require('../utils/dropdownStore');

const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const upload = multer();

const fs = require('fs');
const branding = require('../branding.json');
const brandingPath = path.join(__dirname, '..', 'branding.json');

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
const brandingStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, 'logo-' + Date.now() + path.extname(file.originalname));
  }
});
const brandingUpload = multer({ storage: brandingStorage });
const nodemailer = require('nodemailer');
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
  if (!req.session || req.session.role !== 'admin') return res.status(403).send('Forbidden');
  next();
});

router.use(express.json());

router.get('/chart/meta', async (_req, res) => {
  const [tables] = await db.query('SHOW TABLES');
  const tableNames = tables.map(t => Object.values(t)[0]);
  const out = {};
  for (const name of tableNames) {
    const [cols] = await db.query('SHOW COLUMNS FROM ??', [name]);
    out[name] = cols.map(c => c.Field);
  }
  res.json({ tables: out });
});

// ----- dropdown options -----
router.get('/dropdowns', (req, res) => {
  const data = dropdowns.getAll();
  res.render('admin_dropdowns', { user: req.session.user, dropdowns: data, saved: req.query.saved });
});

router.post('/dropdowns/add', (req, res) => {
  const { type, value } = req.body;
  dropdowns.add(type, value && value.trim());
  res.redirect('/admin/dropdowns?saved=1');
});

router.post('/dropdowns/delete', (req, res) => {
  const { type, value } = req.body;
  dropdowns.remove(type, value);
  res.redirect('/admin/dropdowns?saved=1');
});

router.get('/branding', (req, res) => {
  res.render('admin_branding', {
    user: req.session.user,
    branding,
    saved: req.query.saved
  });
});

router.post('/branding', brandingUpload.single('primaryLogo'), (req, res) => {
  const { primaryColor, secondaryColor } = req.body;
  if (req.file) {
    branding.primaryLogo = '/uploads/' + req.file.filename;
  }
  if (primaryColor) branding.primaryColor = primaryColor;
  if (secondaryColor) branding.secondaryColor = secondaryColor;
  fs.writeFileSync(brandingPath, JSON.stringify(branding, null, 2));
  req.app.locals.branding = branding;
  res.redirect('/admin/branding?saved=1');
});

router.get('/email-templates', (req, res) => {
  emailTemplates.load();
  const key = req.query.key || Object.keys(emailTemplates.templates)[0];
  const template = key ? emailTemplates.templates[key] : { subject: '', html: '' };
  res.render('admin_email_templates', {
    user: req.session.user,
    templates: emailTemplates.templates,
    selectedKey: key,
    template,
    saved: req.query.saved
  });
});

router.post('/email-templates/save', (req, res) => {
  const { key, subject, html } = req.body;
  if (key) emailTemplates.saveTemplate(key, { subject, html });
  res.redirect(`/admin/email-templates?key=${encodeURIComponent(key)}&saved=1`);
});

router.post('/email-templates/ai', async (req, res) => {
  const { prompt } = req.body || {};
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'Missing API key' });
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You generate personalized HTML email templates that use {{name}} placeholders.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    const data = await response.json();
    const html = data.choices?.[0]?.message?.content?.trim() || '';
    res.json({ html });
  } catch (e) {
    console.error('AI error', e);
    res.status(500).json({ error: 'AI request failed' });
  }
});

router.get('/drip-campaigns', (req, res) => {
  const campaigns = dripCampaign.loadCampaigns();
  const historyEmail = req.query.email;
  const historyCampaign = historyEmail ? campaigns.find(c => c.email === historyEmail) : null;
  res.render('admin_drip_campaigns', {
    user: req.session.user,
    campaigns,
    created: req.query.created,
    historyEmail,
    historyCampaign
  });
});

router.post('/drip-campaigns', (req, res) => {
  const { email, phone, name, segment, program, enrollmentStatus } = req.body;
  if (email) dripCampaign.addCampaign({ email, phone, name, segment, program, enrollmentStatus });
  res.redirect('/admin/drip-campaigns?created=1');
});

router.get('/', async (req, res) => {
  const users = await userModel.getAll();
  const classes = await classModel.getAllClasses();
  const teachers = users.filter(u => u.role === 'teacher');
  const students = users.filter(u => u.role === 'student');
  const pendingStudents = students.filter(u => u.status === 'pending' || !u.status);
  const approvedStudents = students.filter(u => u.status === 'approved');
  const announcements = await announcementModel.forAdmin();

  // ----- course counts -----
  const courseCountsMap = students.reduce((acc, s) => {
    const course = (s.profile && s.profile.course) || 'Unknown';
    acc[course] = (acc[course] || 0) + 1;
    return acc;
  }, {});
  const courseCounts = Object.entries(courseCountsMap).map(([course, count]) => ({ course, count }));

  // ----- state counts -----
  const stateCounts = {};
  students.forEach(s => {
    const state = s.profile && s.profile.address && s.profile.address.state;
    if (state) stateCounts[state] = (stateCounts[state] || 0) + 1;
  });
  const studentsByState = Object.entries(stateCounts).map(([state, count]) => ({ state, count }));

  // ----- affiliate counts -----
  const affiliateCounts = students.reduce((acc, s) => {
    const program = (s.profile && s.profile.affiliateProgram) || 'Unspecified';
    acc[program] = (acc[program] || 0) + 1;
    return acc;
  }, {});


const signupsLast7Days  = buildDailySeries(students, 7);    // day-by-day for past 7 days
const signupsLast30Days = buildDailySeries(students, 30);   // optional
const signupsLast365    = buildDailySeries(students, 365);  // optional

  // const sum = a => a.reduce((n, x) => n + x.count, 0);
  // const signupsTotals = {
  //   week:  sum(signupsDailyWeek),
  //   month: sum(signupsDailyMonth),
  //   year:  sum(signupsDailyYear)
  // };

  const classSizes = classes.map(c => ({ name: c.name, size: (c.studentIds || []).length }));

  // (optional) logging
  console.log("course counts:", JSON.stringify(courseCounts));
  console.log("student by state:", JSON.stringify(studentsByState));
  console.log("affiliate counts:", JSON.stringify(affiliateCounts));
  console.log("signups totals:", JSON.stringify(signupsLast7Days));
    console.log("signups totals:", JSON.stringify(signupsLast30Days));
      console.log("signups totals:", JSON.stringify(signupsLast365));



  res.render('admin_dashboard', {
    user: req.session.user,
    classes,
    teachers,
    students,
    announcements,
    pendingCount: pendingStudents.length,
    approvedCount: approvedStudents.length,
    classSizes,
    courseCounts,
    studentsByState,
    affiliateCounts,
    signupsLast7Days,
    signupsLast30Days,
    signupsLast365
  });
});

async function renderPending(_req, res) {
  const users = await userModel.getAll();
  const pending = users.filter(u => u.role === 'student' && (u.status === 'pending' || !u.status));
  res.render('admin_pending', { pending });
}

function buildDailySeries(people, days, tz = 'America/New_York') {
  const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fmtDow = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });

  const todayUTC = new Date();
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayUTC);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(d);
  }

  const counts = Object.fromEntries(keys.map(d => [fmtDay.format(d), 0]));

  for (const s of people) {
    if (!s.appliedAt) continue;
    const bucket = fmtDay.format(new Date(s.appliedAt));
    if (bucket in counts) counts[bucket] += 1;
  }

  return keys.map(d => {
    const date = fmtDay.format(d);           // YYYY-MM-DD
    const dow  = fmtDow.format(d);           // Mon/Tue/...
    return { date, dow, count: counts[date] };
  });
}

router.get('/approvals', renderPending);
router.get('/students/pending', renderPending);
router.post('/approve/:id', async (req, res) => {
  const user = await userModel.setStatus(Number(req.params.id), 'approved');
  if (user && user.email) {
    const name = (user.profile && user.profile.firstName) || user.name || 'Student';
    try {
      const { subject, html, text } = emailTemplates.render('studentApproved', { name });
      await transporter.sendMail({
        from: 'no-reply@mdts-apps.com',
        to: user.email,
        subject,
        html,
        text
      });
    } catch (e) {
      console.error('Error sending approval email', e);
    }
  }
  res.redirect('/admin/students/pending');
});


// Render form to create a new event
router.get('/create-event', (req, res) => {
  res.render('create_event', { user: req.session.user });
});

// Handle event creation
router.post('/create-event', mediaUpload.single('attachment'), async (req, res) => {
  const { name, date, description } = req.body;
  const attachment = req.file ? `/uploads/${req.file.filename}` : null;
  await eventModel.createEvent({ name, eventDate: date, description, attachment });
  res.redirect('/admin');
});

// View RSVPs for events
router.get('/event-rsvps', async (req, res) => {
  const rsvps = await rsvpModel.getAllRSVPs();
  res.render('event_rsvps', { user: req.session.user, rsvps });
});


router.get('/pre-registrations', async (req, res) => {
  const preregs = await preRegModel.getAll();
  res.render('admin_pre_registered', { preregs, user: req.session.user });
});


router.post('/announcements', async (req, res) => {
  const { message, audience } = req.body;
  if (message && audience) {
    await announcementModel.create({ authorId: req.session.user.id, audience, message });
  }
  res.redirect('/admin');
});

router.post('/classes/:id/tests/media', mediaUpload.single('media'), (req, res) => {
  const classId = Number(req.params.id);
  if (!req.file) return res.status(400).send('No file uploaded');
  res.redirect(`/admin/classes/${classId}#tests`);
});


router.post('/decline/:id', async (req, res) => {
  await userModel.setStatus(Number(req.params.id), 'declined');
  res.redirect('/admin/students/pending');
});

router.get('/students/:id', async (req, res) => {
  const student = await userModel.findById(Number(req.params.id));
  if (!student) return res.status(404).send('Not found');
res.render('student_profile', { student, role: 'admin', reset: req.query.reset,signatureDocsConfig });
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
  res.redirect(`/admin/students/${id}?reset=1`);});

router.post('/students/:id/sign-doc', async (req, res) => {
  const id = Number(req.params.id);
  const { docType, signatureDataUrl } = req.body;
  if (!docType || !signatureDataUrl) return res.redirect(`/admin/students/${id}`);
  try {
    await userModel.signDocument(id, docType, signatureDataUrl);
    const user = await userModel.findById(id);
    const docs = (user.profile && user.profile.documents) || [];
    const pending = docs.filter(d => d.requiredRole === 'admin' && !d.signatureDataUrl);
    if (!pending.length && user.email) {
      try {
        const { subject, html, text } = emailTemplates.render('registrationComplete', { name: user.name });
        await transporter.sendMail({
          from: 'no-reply@mdts-apps.com',
          to: user.email,
          subject,
          html,
          text
        });
      } catch (e) {
        console.error('Error sending completion email', e);
      }
    }
  } catch (e) {
    console.error('Error signing document', e);
  }
  res.redirect(`/admin/students/${id}`);
});

router.post('/students/:id/step2', async (req, res) => {
  const id = Number(req.params.id);
  const {
    startDate,
    endDate,
    classTime,
    classDays,
    tuitionTuition,
    tuitionRegistrationFee,
    tuitionBooks,
    tuitionEquipment,
    tuitionMiscFees,
    tuitionTotal
  } = req.body;
  try {
    await userModel.updateProfile(id, {
      program: { startDate, endDate, classTime, classDays },
      tuition: {
        tuition: tuitionTuition,
        registrationFee: tuitionRegistrationFee,
        books: tuitionBooks,
        equipment: tuitionEquipment,
        miscFees: tuitionMiscFees,
        totalCost: tuitionTotal
      }
    });
    const student = await userModel.findById(id);
    if (student && student.email) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + 1000 * 60 * 60 * 24;
      await userModel.setStep2Token(id, token, expires);
      const link = `${req.protocol}://${req.get('host')}/step2?token=${token}`;
      const { subject, html, text } = emailTemplates.render('enrollmentStep2', { name: student.name, link });
      await transporter.sendMail({
        from: 'no-reply@mdts-apps.com',
        to: student.email,
        subject,
        html,
        text
      });
    }
  } catch (e) {
    console.error('Error in step2', e);
  }
  res.redirect(`/admin/students/${id}`);
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

// Marketing email constants
const marketingTypes = ['recruitment', 'retention', 'approval', 'events', 'information'];
const marketingPrefaces = {
  recruitment: 'Join the MD Technical School family!',
  retention: 'We value your continued learning with MDTS.',
  approval: 'Congratulations on your approval!',
  events: 'Upcoming opportunities await you at MDTS.',
  information: 'Here is an important update from MDTS.'
};

// Marketing email form
router.get('/marketing', async (req, res) => {
  const students = await userModel.getByRole('student');
  const preregs = await preRegModel.getAll();
  const rsvps = await rsvpModel.getAllRSVPs();
  res.render('admin_marketing', {
    students,
    preregs,
    rsvps,
    templates: marketingSubjects,
    user: req.session.user,
    sent: req.query.sent,
    error: null
  });
});

// Preview marketing email with OpenAI
router.post('/marketing/preview', mediaUpload.single('image'), async (req, res) => {
  const { type, message, subject } = req.body;
  const imageUrl = req.file ? `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` : null;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing OpenAI API key' });
  if (!marketingTypes.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  try {
    const preface = marketingPrefaces[type] || '';
    const prompt = `${preface}\n\n${message || ''}`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: `Write a professional marketing email to students using the following context:\n${prompt}` }]
      })
    });
    const data = await response.json();
    const generated = data.choices?.[0]?.message?.content?.trim() || '';
    const tpl = marketingTemplates[type];
    const subj = subject && subject.trim() ? subject.trim() : tpl.subject;
    const html = tpl.html
      .replace(/{{imageTag}}/g, imageUrl ? `<img src="${imageUrl}" alt="" style="width:100%;height:auto;display:block;">` : '')
      .replace(/{{subject}}/g, subj)
      .replace(/{{message}}/g, generated)
      .replace(/{{year}}/g, new Date().getFullYear());
    res.json({ html });
  } catch (e) {
    console.error('OpenAI preview error', e);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Send marketing email
router.post('/marketing', mediaUpload.single('image'), async (req, res) => {
  const students = await userModel.getByRole('student');
  const preregs = await preRegModel.getAll();
  const rsvps = await rsvpModel.getAllRSVPs();
  const { recipients, type, subject, message } = req.body;
  const imageUrl = req.file ? `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` : null;
  const attachments = req.file
    ? [{ filename: req.file.originalname, path: req.file.path }]
    : [];
  const ids = Array.isArray(recipients) ? recipients : [recipients].filter(Boolean);
  if (!ids.length || !marketingTypes.includes(type)) {
    return res.status(400).render('admin_marketing', {
      students,
      preregs,
      rsvps,
      templates: marketingSubjects,
      user: req.session.user,
      sent: null,
      error: 'Invalid form submission.'
    });
  }
  try {
    const tpl = marketingTemplates[type];
    const subj = (subject && subject.trim()) || tpl.subject;
    const preface = marketingPrefaces[type] || '';
    let bodyText = `${preface}\n\n${message || ''}`;
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: `Write a professional marketing email to students using the following context:\n${bodyText}` }]
          })
        });
        const data = await response.json();
        bodyText = data.choices?.[0]?.message?.content?.trim() || bodyText;
      } catch (e) {
        console.error('OpenAI error', e);
      }
    }

    const html = tpl.html
      .replace(/{{imageTag}}/g, imageUrl ? `<img src="${imageUrl}" alt="" style="width:100%;height:auto;display:block;">` : '')
      .replace(/{{subject}}/g, subj)
      .replace(/{{message}}/g, bodyText)
      .replace(/{{year}}/g, new Date().getFullYear());

    for (const id of ids) {
      const [kind, actualId] = String(id).split('-');
      let recipient;
      if (kind === 'student') {
        recipient = await userModel.findById(Number(actualId));
      } else if (kind === 'pre') {
        recipient = preregs.find(p => p.id === Number(actualId));
      } else if (kind === 'rsvp') {
        recipient = rsvps.find(r => r.id === Number(actualId));
      }
      if (!recipient || !recipient.email) continue;
      await transporter.sendMail({
        from: 'no-reply@mdts-apps.com',
        to: recipient.email,
        subject: subj,
        html,
        text: bodyText,
        attachments
      });
    }

    res.redirect('/admin/marketing?sent=1');
  } catch (e) {
    console.error('Error sending marketing email', e);
    res.status(500).render('admin_marketing', {
      students,
      preregs,
      rsvps,
      templates: marketingSubjects,
      user: req.session.user,
      sent: null,
      error: 'Failed to send email.'
    });
  }
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
    const startDate = (req.body.startDate || '').trim();
    const endDate = (req.body.endDate || '').trim();

    if (!schoolYear || !cohort || !name || !shortName || !teacherId || !startDate || !endDate) {
      const teachers = await userModel.getByRole('teacher');
      return res.status(400).render('create_class', { teachers, error: 'School Year, Cohort, Name, Short Name, Teacher and Dates are required.' });
    }

    // schedule arrays (day[], start[], end[])
    const days = Array.isArray(req.body.day) ? req.body.day : (req.body.day ? [req.body.day] : []);
    const starts = Array.isArray(req.body.start) ? req.body.start : (req.body.start ? [req.body.start] : []);
    const ends = Array.isArray(req.body.end) ? req.body.end : (req.body.end ? [req.body.end] : []);
    const schedule = [];
    for (let i = 0; i < Math.max(days.length, starts.length, ends.length); i++) {
      const d = (days[i] || '').trim();
      const st = (starts[i] || '').trim();
      const en = (ends[i] || '').trim();
      const h = req.body[`holiday${i}`] === 'on' || req.body[`holiday${i}`] === '1';
      if (d && st && en) schedule.push({ day: d, start: st, end: en, holiday: h });
    }

  const klass = await classModel.createClass({ schoolYear, cohort, name, weeks, shortName, description, teacherId, schedule, startDate, endDate });
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

router.get('/chart/NewSignups', async (req, res) => {
      const users = await userModel.getAll();
  const classes = await classModel.getAllClasses();
  const teachers = users.filter(u => u.role === 'teacher');
  const students = users.filter(u => u.role === 'student');
  const pendingStudents = students.filter(u => u.status === 'pending' || !u.status);
  const approvedStudents = students.filter(u => u.status === 'approved');
  const announcements = await announcementModel.forAdmin();

  // ----- course counts -----
  const courseCountsMap = students.reduce((acc, s) => {
    const course = (s.profile && s.profile.course) || 'Unknown';
    acc[course] = (acc[course] || 0) + 1;
    return acc;
  }, {});
  const courseCounts = Object.entries(courseCountsMap).map(([course, count]) => ({ course, count }));

  // ----- state counts -----
  const stateCounts = {};
  students.forEach(s => {
    const state = s.profile && s.profile.address && s.profile.address.state;
    if (state) stateCounts[state] = (stateCounts[state] || 0) + 1;
  });
  const studentsByState = Object.entries(stateCounts).map(([state, count]) => ({ state, count }));

  // ----- affiliate counts -----
  const affiliateCounts = students.reduce((acc, s) => {
    const program = (s.profile && s.profile.affiliateProgram) || 'Unspecified';
    acc[program] = (acc[program] || 0) + 1;
    return acc;
  }, {});


const signupsLast7Days  = buildDailySeries(students, 7);    // day-by-day for past 7 days
const signupsLast30Days = buildDailySeries(students, 30);   // optional
const signupsLast365    = buildDailySeries(students, 365);  // optional

  // const sum = a => a.reduce((n, x) => n + x.count, 0);
  // const signupsTotals = {
  //   week:  sum(signupsDailyWeek),
  //   month: sum(signupsDailyMonth),
  //   year:  sum(signupsDailyYear)
  // };

  const classSizes = classes.map(c => ({ name: c.name, size: (c.studentIds || []).length }));

  // (optional) logging
  console.log("course counts:", JSON.stringify(courseCounts));
  console.log("student by state:", JSON.stringify(studentsByState));
  console.log("affiliate counts:", JSON.stringify(affiliateCounts));
  console.log("signups totals:", JSON.stringify(signupsLast7Days));
    console.log("signups totals:", JSON.stringify(signupsLast30Days));
      console.log("signups totals:", JSON.stringify(signupsLast365));


res.json(signupsLast7Days);
  // res.render('admin_dashboard', {
  //   user: req.session.user,
  //   classes,
  //   teachers,
  //   students,
  //   announcements,
  //   pendingCount: pendingStudents.length,
  //   approvedCount: approvedStudents.length,
  //   classSizes,
  //   courseCounts,
  //   studentsByState,
  //   affiliateCounts,
  //   signupsLast7Days,
  //   signupsLast30Days,
  //   signupsLast365
  // });
});

router.get('/chart/CourseCounts', async (req, res) => {
      const users = await userModel.getAll();
  const classes = await classModel.getAllClasses();
  const teachers = users.filter(u => u.role === 'teacher');
  const students = users.filter(u => u.role === 'student');
  const pendingStudents = students.filter(u => u.status === 'pending' || !u.status);
  const approvedStudents = students.filter(u => u.status === 'approved');
  const announcements = await announcementModel.forAdmin();

  // ----- course counts -----
  const courseCountsMap = students.reduce((acc, s) => {
    const course = (s.profile && s.profile.course) || 'Unknown';
    acc[course] = (acc[course] || 0) + 1;
    return acc;
  }, {});
  const courseCounts = Object.entries(courseCountsMap).map(([course, count]) => ({ course, count }));

  // ----- state counts -----
  const stateCounts = {};
  students.forEach(s => {
    const state = s.profile && s.profile.address && s.profile.address.state;
    if (state) stateCounts[state] = (stateCounts[state] || 0) + 1;
  });
  const studentsByState = Object.entries(stateCounts).map(([state, count]) => ({ state, count }));

  // ----- affiliate counts -----
  const affiliateCounts = students.reduce((acc, s) => {
    const program = (s.profile && s.profile.affiliateProgram) || 'Unspecified';
    acc[program] = (acc[program] || 0) + 1;
    return acc;
  }, {});


const signupsLast7Days  = buildDailySeries(students, 7);    // day-by-day for past 7 days
const signupsLast30Days = buildDailySeries(students, 30);   // optional
const signupsLast365    = buildDailySeries(students, 365);  // optional

  // const sum = a => a.reduce((n, x) => n + x.count, 0);
  // const signupsTotals = {
  //   week:  sum(signupsDailyWeek),
  //   month: sum(signupsDailyMonth),
  //   year:  sum(signupsDailyYear)
  // };

  const classSizes = classes.map(c => ({ name: c.name, size: (c.studentIds || []).length }));

  // (optional) logging
  console.log("course counts:", JSON.stringify(courseCounts));
  console.log("student by state:", JSON.stringify(studentsByState));
  console.log("affiliate counts:", JSON.stringify(affiliateCounts));
  console.log("signups totals:", JSON.stringify(signupsLast7Days));
    console.log("signups totals:", JSON.stringify(signupsLast30Days));
      console.log("signups totals:", JSON.stringify(signupsLast365));


res.json(courseCounts);
  // res.render('admin_dashboard', {
  //   user: req.session.user,
  //   classes,
  //   teachers,
  //   students,
  //   announcements,
  //   pendingCount: pendingStudents.length,
  //   approvedCount: approvedStudents.length,
  //   classSizes,
  //   courseCounts,
  //   studentsByState,
  //   affiliateCounts,
  //   signupsLast7Days,
  //   signupsLast30Days,
  //   signupsLast365
  // });
});

router.get('/chart/AffCounts', async (req, res) => {
      const users = await userModel.getAll();
  const classes = await classModel.getAllClasses();
  const teachers = users.filter(u => u.role === 'teacher');
  const students = users.filter(u => u.role === 'student');
  const pendingStudents = students.filter(u => u.status === 'pending' || !u.status);
  const approvedStudents = students.filter(u => u.status === 'approved');
  const announcements = await announcementModel.forAdmin();

  // ----- course counts -----
  const courseCountsMap = students.reduce((acc, s) => {
    const course = (s.profile && s.profile.course) || 'Unknown';
    acc[course] = (acc[course] || 0) + 1;
    return acc;
  }, {});
  const courseCounts = Object.entries(courseCountsMap).map(([course, count]) => ({ course, count }));

  // ----- state counts -----
  const stateCounts = {};
  students.forEach(s => {
    const state = s.profile && s.profile.address && s.profile.address.state;
    if (state) stateCounts[state] = (stateCounts[state] || 0) + 1;
  });
  const studentsByState = Object.entries(stateCounts).map(([state, count]) => ({ state, count }));

  // ----- affiliate counts -----
// ----- affiliate counts -----
const affiliateCountsMap = students.reduce((acc, s) => {
  const program = (s.profile && s.profile.affiliateProgram) || 'Unspecified';
  acc[program] = (acc[program] || 0) + 1;
  return acc;
}, {});

const affiliateCounts = Object.entries(affiliateCountsMap).map(([affiliate, count]) => ({
  affiliate,
  count
}));


const signupsLast7Days  = buildDailySeries(students, 7);    // day-by-day for past 7 days
const signupsLast30Days = buildDailySeries(students, 30);   // optional
const signupsLast365    = buildDailySeries(students, 365);  // optional

  // const sum = a => a.reduce((n, x) => n + x.count, 0);
  // const signupsTotals = {
  //   week:  sum(signupsDailyWeek),
  //   month: sum(signupsDailyMonth),
  //   year:  sum(signupsDailyYear)
  // };

  const classSizes = classes.map(c => ({ name: c.name, size: (c.studentIds || []).length }));

  // (optional) logging
  console.log("course counts:", JSON.stringify(courseCounts));
  console.log("student by state:", JSON.stringify(studentsByState));
  console.log("affiliate counts:", JSON.stringify(affiliateCounts));
  console.log("signups totals:", JSON.stringify(signupsLast7Days));
    console.log("signups totals:", JSON.stringify(signupsLast30Days));
      console.log("signups totals:", JSON.stringify(signupsLast365));


res.json(affiliateCounts);
  // res.render('admin_dashboard', {
  //   user: req.session.user,
  //   classes,
  //   teachers,
  //   students,
  //   announcements,
  //   pendingCount: pendingStudents.length,
  //   approvedCount: approvedStudents.length,
  //   classSizes,
  //   courseCounts,
  //   studentsByState,
  //   affiliateCounts,
  //   signupsLast7Days,
  //   signupsLast30Days,
  //   signupsLast365
  // });
});

router.get('/chart/SignUp365', async (req, res) => {
      const users = await userModel.getAll();
  const classes = await classModel.getAllClasses();
  const teachers = users.filter(u => u.role === 'teacher');
  const students = users.filter(u => u.role === 'student');
  const pendingStudents = students.filter(u => u.status === 'pending' || !u.status);
  const approvedStudents = students.filter(u => u.status === 'approved');
  const announcements = await announcementModel.forAdmin();

  // ----- course counts -----
  const courseCountsMap = students.reduce((acc, s) => {
    const course = (s.profile && s.profile.course) || 'Unknown';
    acc[course] = (acc[course] || 0) + 1;
    return acc;
  }, {});
  const courseCounts = Object.entries(courseCountsMap).map(([course, count]) => ({ course, count }));

  // ----- state counts -----
  const stateCounts = {};
  students.forEach(s => {
    const state = s.profile && s.profile.address && s.profile.address.state;
    if (state) stateCounts[state] = (stateCounts[state] || 0) + 1;
  });
  const studentsByState = Object.entries(stateCounts).map(([state, count]) => ({ state, count }));

  // ----- affiliate counts -----
  const affiliateCounts = students.reduce((acc, s) => {
    const program = (s.profile && s.profile.affiliateProgram) || 'Unspecified';
    acc[program] = (acc[program] || 0) + 1;
    return acc;
  }, {});


const signupsLast7Days  = buildDailySeries(students, 7);    // day-by-day for past 7 days
const signupsLast30Days = buildDailySeries(students, 30);   // optional
const signupsLast365    = buildDailySeries(students, 365);  // optional

  // const sum = a => a.reduce((n, x) => n + x.count, 0);
  // const signupsTotals = {
  //   week:  sum(signupsDailyWeek),
  //   month: sum(signupsDailyMonth),
  //   year:  sum(signupsDailyYear)
  // };

  const classSizes = classes.map(c => ({ name: c.name, size: (c.studentIds || []).length }));

  // (optional) logging
  console.log("course counts:", JSON.stringify(courseCounts));
  console.log("student by state:", JSON.stringify(studentsByState));
  console.log("affiliate counts:", JSON.stringify(affiliateCounts));
  console.log("signups totals:", JSON.stringify(signupsLast7Days));
    console.log("signups totals:", JSON.stringify(signupsLast30Days));
      console.log("signups totals:", JSON.stringify(signupsLast365));


res.json(signupsLast365);
  // res.render('admin_dashboard', {
  //   user: req.session.user,
  //   classes,
  //   teachers,
  //   students,
  //   announcements,
  //   pendingCount: pendingStudents.length,
  //   approvedCount: approvedStudents.length,
  //   classSizes,
  //   courseCounts,
  //   studentsByState,
  //   affiliateCounts,
  //   signupsLast7Days,
  //   signupsLast30Days,
  //   signupsLast365
  // });
});

router.get('/chart/signups', async (req, res) => {
  const range = req.query.range || 'week';
  const daysMap = { week: 7, month: 30, year: 365 };
  const days = daysMap[range] || 7;
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  const startDate = start.toISOString().slice(0, 10);
  try {
    const [rows] = await db.query(
      `SELECT DATE(appliedAt) AS date, COUNT(*) AS count
       FROM mdtslms_users
       WHERE role='student' AND DATE(appliedAt) >= ?
       GROUP BY DATE(appliedAt)
       ORDER BY DATE(appliedAt)`,
      [startDate]
    );
    const result = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      const row = rows.find(r => r.date === ds);
      result.push({ date: ds, count: row ? row.count : 0 });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'query failed' });
  }
});

router.get('/classes/:id', async (req, res) => {
  const id = Number(req.params.id);
  const klass = await classModel.findClassById(id);
  if (!klass) return res.status(404).send('Not found');
  const users = await userModel.getAll();
  const students = users.filter(u => u.role === 'student' && u.status === 'approved');
  const teacher = await userModel.findById(klass.teacherId);
  const discussions = await discussionModel.getByClass(id);

  const classStudents = students.filter(s => (klass.studentIds||[]).includes(s.id));
  res.render('view_class', { klass, students, classStudents, studentView: false, discussions, teacher });
});

router.post('/classes/:id/lectures', async (req, res) => {
  const classId = Number(req.params.id);
  const { title, url } = req.body;
  if (title && url) {
    await classModel.addLecture(classId, {
      title: title.trim(),
      url: url.trim(),
      isPowerPoint: false
    });
  }
  res.redirect(`/admin/classes/${classId}#lectures`);
});

router.post('/classes/:id/simulations', async (req, res) => {
  const classId = Number(req.params.id);
  const { title, url } = req.body;
  if (title && url) {
    await classModel.addSimulation(classId, { title: title.trim(), url: url.trim() });
  }
  res.redirect(`/admin/classes/${classId}#simulations`);
});

router.post('/classes/:id/assignments', async (req, res) => {
  const classId = Number(req.params.id);
  const { title, url } = req.body;
  if (title && url) {
    await classModel.addAssignment(classId, { title: title.trim(), url: url.trim() });
  }
  res.redirect(`/admin/classes/${classId}#assignments`);
});

  router.post('/classes/:id/tests/upload', upload.single('csv'), async (req, res) => {
    const classId = Number(req.params.id);
    const title = (req.body.title || 'Uploaded Test').trim();
      const timeLimit = Number(req.body.timeLimit) || 90;

    const csv = req.file && req.file.buffer.toString('utf-8');
    if (csv) {
      const lines = csv.split(/\r?\n/).filter(l => l.trim());
      const [, ...rows] = lines;
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
    res.redirect(`/admin/classes/${classId}#tests`);
  });

router.post('/classes/:id/tests/generate', async (req, res) => {
  const classId = Number(req.params.id);
  const { title, prompt, timeLimit } = req.body;
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
        title: title,
        itemType: q['Item Type'],
        path: q.Path
      }));
      const testTitle = title || 'AI Generated Test';
  questions.forEach(q => { q.test = q.test || testTitle; });
      await testModel.insertQuestions(questions);
      await classModel.addTest(classId, { title: testTitle, timeLimit: Number(timeLimit) || 90 });
    } catch (e) {
      console.error('OpenAI error', e);
    }
    res.redirect(`/admin/classes/${classId}#tests`);
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

router.post('/classes/:id/rename', async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body;
  if (name && name.trim()) {
    await classModel.renameClass(id, name.trim());
  }
  res.redirect(`/admin/classes/${id}`);
});

router.post('/users/:id/deactivate', async (req, res) => {
  await userModel.setActive(Number(req.params.id), false);
  res.redirect('back');
});

router.post('/users/:id/activate', async (req, res) => {
  await userModel.setActive(Number(req.params.id), true);
  res.redirect('back');
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
// Edit teacher (placeholder)
router.get('/teachers/:id/edit', async (req, res) => {
  const teacher = await userModel.findById(Number(req.params.id));
  if (!teacher || teacher.role !== 'teacher') return res.status(404).send('Not found');
  res.render('teacher_profile', { teacher, role: 'admin', saved: req.query.saved });
});

router.post('/teachers/:id/edit', mediaUpload.single('photo'), async (req, res) => {
  const id = Number(req.params.id);
  const teacher = await userModel.findById(id);
  if (!teacher || teacher.role !== 'teacher') return res.status(404).send('Not found');
  if (req.file) {
    await userModel.updateProfile(id, {
      photo: {
        url: `/uploads/${req.file.filename}`,
        originalName: req.file.originalname
      }
    });
  }
  res.redirect(`/admin/teachers/${id}/edit?saved=1`);
});

router.post('/teachers/:id/link', mediaUpload.single('image'), async (req, res) => {
  const id = Number(req.params.id);
  const teacher = await userModel.findById(id);
  if (!teacher || teacher.role !== 'teacher') return res.status(404).send('Not found');
  const { url } = req.body;
  if (url) {
    const link = { url };
    if (req.file) {
      link.image = { url: `/uploads/${req.file.filename}`, originalName: req.file.originalname };
    }
    try { await userModel.addLinks(id, [link]); }
    catch (e) { console.error('add link', e); }
  }
  res.redirect(`/admin/teachers/${id}/edit?saved=1`);
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
          const [sh, sm] = String(s.start || '0:0').split(':').map(Number);
          events.push({
            title: klass.name + ' (Class)',
            start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), sh, sm || 0),
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

// Custom report builder routes
router.get('/reports/custom', async (_req, res) => {
  const [tables] = await db.query('SHOW TABLES');
  const tableNames = tables.map(t => Object.values(t)[0]);
  res.render('custom_report', { tables: tableNames, columns: [], results: null, selected: {} });
});

router.get('/reports/custom/columns', async (req, res) => {
  const table = req.query.table;
  if (!table) return res.json([]);
  const [cols] = await db.query('SHOW COLUMNS FROM ??', [table]);
  res.json(cols.map(c => c.Field));
});

router.post('/reports/custom', async (req, res) => {
  const { table, columns = [], filterCol, operator, value } = req.body;
  const [tables] = await db.query('SHOW TABLES');
  const tableNames = tables.map(t => Object.values(t)[0]);
  if (!table || !tableNames.includes(table)) {
    return res.render('custom_report', { tables: tableNames, columns: [], results: [], selected: {}, error: 'Invalid table selected.' });
  }
  const [cols] = await db.query('SHOW COLUMNS FROM ??', [table]);
  const colNames = cols.map(c => c.Field);
  let selectedCols = Array.isArray(columns) ? columns : [columns];
  selectedCols = selectedCols.filter(c => colNames.includes(c));
  const allowedOps = ['=', '!=', '>', '<', 'LIKE'];
  let sql = 'SELECT ?? FROM ??';
  const params = [selectedCols.length ? selectedCols : colNames, table];
  if (filterCol && value && allowedOps.includes(operator) && colNames.includes(filterCol)) {
    sql += ` WHERE ?? ${operator} ?`;
    params.push(filterCol, operator === 'LIKE' ? `%${value}%` : value);
  }
  const [rows] = await db.query(sql, params);
  res.render('custom_report', { tables: tableNames, columns: colNames, results: rows, selected: { table, columns: selectedCols, filterCol, operator, value } });
});


// Preview test routes
router.get('/classes/:id/tests/:testId/preview', async (req, res) => {
  const classId = Number(req.params.id);
  const testId = Number(req.params.testId);
  console.log('Admin preview test', { classId, testId, userId: req.session.user.id });
  const klass = await classModel.findClassById(classId);
  if (!klass) {
    console.log('Class not found', classId);
    return res.status(404).send('Not found');
  }
  const test = (klass.tests || []).find(t => t.id === testId);
  if (!test) {
    console.log('Test not found', { classId, testId });
    return res.status(404).send('Test not found');
  }
  test.questions = await testModel.getQuestionsByTest(test.title);
  console.log(test.questions);
  res.render('take_test', {
    klass,
    test,
    attempts: 0,
    user: req.session.user,
    action: `/admin/classes/${classId}/tests/${testId}/preview`
  });
});

router.post('/classes/:id/tests/:testId/preview', async (req, res) => {
  const classId = Number(req.params.id);
  const testId = Number(req.params.testId);
  console.log('Admin submit preview', { classId, testId, userId: req.session.user.id });
  const klass = await classModel.findClassById(classId);
  if (!klass) return res.status(404).send('Not found');
  const test = (klass.tests || []).find(t => t.id === testId);
  if (!test) return res.status(404).send('Test not found');
  test.questions = await testModel.getQuestionsByTest(test.title);
  let score = 0;
  test.questions.forEach((q, i) => {
    const chosen = Number(req.body[`q_${i}`]);
    const correct = Number(q.answer);
    if (!Number.isNaN(chosen) && chosen === correct) score++;
  });
  const pct = Math.round((score / test.questions.length) * 100);
  console.log('Admin preview score', { classId, testId, userId: req.session.user.id, score: pct });
  res.render('test_result', { klass, test, score: pct, student: req.session.user, user: req.session.user });
});

module.exports = router;
