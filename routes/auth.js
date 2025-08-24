const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const emailTemplates = require('../utils/emailTemplates');
const dropdowns = require('../utils/dropdownStore');


const userModel = require('../models/userModel');

// Multer setup for file uploads (docs)
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '../uploads'));
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + file.originalname);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
}).fields([
  { name: 'gedDoc', maxCount: 1 },
  { name: 'govIdDoc', maxCount: 1 }
]);

// Email transporter
const transporter = nodemailer.createTransport({
  host: 'mdts-apps.com',
  port: 465,
  secure: true,
  auth: {
    user: 'noreply@mdts-apps.com',
    pass: 'c@r,5ysPI@&s'
  }
});

const DOC_VERSION = 'v1.0-2025-08-14';
const DOC_TEXT = 'By registering, you agree to the school’s Acceptable Use Policy, Honor Code, and Privacy Notice. You consent to electronic records and provide a digital signature affirming your identity.';

function ensureStr(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return String(v[0] ?? '');
  if (v && typeof v === 'object') {
    if (typeof v.password === 'string') return v.password;
    if (typeof v.value === 'string') return v.value;
  }
  return String(v ?? '');
}

router.get('/login', (req, res) => {
  const next = ensureStr(req.query.next);
  const safeNext = next.startsWith('/') ? next : '';
  res.render('login', { error: null, next: safeNext });
});
router.get('/forgot-password', (req, res) => {
  res.render('forgot_password', { error: null, sent: false });
});

router.post('/forgot-password', async (req, res) => {
  const email = ensureStr(req.body.email).toLowerCase();
  try {
    const user = await userModel.findByEmail(email);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + 1000 * 60 * 60; // 1 hour
      await userModel.setResetToken(user.username, token, expires);
      const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;
      const { subject, html, text } = emailTemplates.render('passwordResetLink', { resetLink });
      await transporter.sendMail({
        from: 'no-reply@mdts-apps.com',
        to: user.email,
        subject,
        html,
        text
      });
    }
    return res.render('forgot_password', { sent: true, error: null });
  } catch (e) {
    console.error(e);
    return res.status(500).render('forgot_password', { sent: false, error: 'Unable to send reset request' });
  }
});

router.get('/reset-password', async (req, res) => {
  const token = ensureStr(req.query.token);
  if (!token) {
    return res.status(400).render('reset_password', { error: 'Invalid or expired link', success: false, token: null });
  }
  const user = await userModel.findByResetToken(token);
  if (!user) {
    return res.status(400).render('reset_password', { error: 'Invalid or expired link', success: false, token: null });
  }
  return res.render('reset_password', { error: null, success: false, token });
});

router.post('/reset-password', async (req, res) => {
  const token = ensureStr(req.body.token);
  const password = ensureStr(req.body.password);
  const confirm = ensureStr(req.body.confirm);

  if (!token || !password || password !== confirm) {
    return res.status(400).render('reset_password', {
      error: 'Invalid request',
       success: false,
      token
    });
  }

  const user = await userModel.findByResetToken(token);
  if (!user) {
    return res.status(400).render('reset_password', {
      error: 'Invalid or expired link',
      success: false,
      token: null
    });
  }
  await userModel.updatePassword(user.username, password);
  await userModel.clearResetToken(user.id);
  return res.render('reset_password', { error: null, success: true, token: null });
});

router.get('/step2', async (req, res) => {
  const token = ensureStr(req.query.token);
  if (!token) {
    return res.status(400).render('login', { error: 'Invalid or expired link', next: '' });
  }
  const user = await userModel.findByStep2Token(token);
  if (!user) {
    return res.status(400).render('login', { error: 'Invalid or expired link', next: '' });
  }
  req.session.user = {
    id: user.id,
    name: user.name,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName
  };
  req.session.role = user.role;
  await userModel.clearStep2Token(user.id);
  return res.redirect('/student/profile');
});

router.post('/login', async (req, res) => {
  const username = ensureStr(req.body.username);
  const password = ensureStr(req.body.password);
  const redirectTo = ensureStr(req.body.next);
  const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '';

  const user = await userModel.findByUsername(username);
  if (!user || !userModel.verifyPassword(user, password)) {
    return res.status(401).render('login', { error: 'Invalid credentials', next: safeRedirect });
  }
  if (user.active === false) {
    return res.status(403).render('login', { error: 'Account deactivated', next: safeRedirect });
  }
  req.session.user = {
    id: user.id,
    name: user.name,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName
  };
  req.session.role = user.role;

  if (user.role === 'student' && (user.status === 'pending' || !user.status) && !safeRedirect) {
    return res.render('pending', { user });
  }
  return res.redirect(safeRedirect || '/dashboard');
});

router.get('/register', async (req, res) => {
  const formData = req.session.preRegData || {};
  delete req.session.preRegData;
  try {
    formData.studentId = await userModel.generateStudentId();
  } catch (e) {
    console.error('Error generating student ID', e);
    formData.studentId = '';
  }
  const dd = dropdowns.getAll();
  res.render('register', {
    error: null,
    docVersion: DOC_VERSION,
    docText: DOC_TEXT,
    formData,
    courses: dd.courses,
    affiliatePrograms: dd.affiliatePrograms
  });
});

router.post('/register', (req, res) => {
  upload(req, res, async (err) => {
     const dd = dropdowns.getAll();
    if (err) {
      return res.status(400).render('register', {
        error: err.message,
        docVersion: DOC_VERSION,
        docText: DOC_TEXT,
        formData: req.body,
        courses: dd.courses,
        affiliatePrograms: dd.affiliatePrograms
      });
    }

     try {
      const firstName = ensureStr(req.body.firstName);
      const lastName = ensureStr(req.body.lastName);
      const username = ensureStr(req.body.username) || `${firstName}${lastName}`.replace(/\s+/g, '');
      const email = ensureStr(req.body.email);
      const confirmEmail = ensureStr(req.body.confirmEmail);
      const password = ensureStr(req.body.password);
 const studentId = ensureStr(req.body.studentId) || await userModel.generateStudentId();      const agree = ensureStr(req.body.agree);
      const suffix = ensureStr(req.body.suffix);
      const address = ensureStr(req.body.address);
      const city = ensureStr(req.body.city);
      const state = ensureStr(req.body.state);
      const zip = ensureStr(req.body.zip);
      const course = ensureStr(req.body.course);
      const affiliateProgram = ensureStr(req.body.affiliateProgram);
      const phoneHome = ensureStr(req.body.phoneHome);
      const phoneCell = ensureStr(req.body.phoneCell);
      const phoneWork = ensureStr(req.body.phoneWork);
      const ssn = ensureStr(req.body.ssn);
      const emergencyName = ensureStr(req.body.emergencyName);
      const emergencyRelation = ensureStr(req.body.emergencyRelation);
      const emergencyPhone = ensureStr(req.body.emergencyPhone);
   
      const selfPay = affiliateProgram === 'Self Pay';

      const grievanceAck = ensureStr(req.body.grievanceAck);
      const financialAid = ensureStr(req.body.financialAid);
      const referralName = ensureStr(req.body.referralName);
      const referralEmail = ensureStr(req.body.referralEmail);

      if (email !== confirmEmail) {
        return res.status(400).render('register', {
          error: 'Emails do not match.',
          docVersion: DOC_VERSION,
          docText: DOC_TEXT,
          formData: req.body,
          courses: dd.courses,
          affiliatePrograms: dd.affiliatePrograms
        });
      }

       if (!agree) {
      return res.status(400).render('register', {
          error: 'You must agree to the registration agreement.',
          docVersion: DOC_VERSION,
          docText: DOC_TEXT,
          formData: req.body,
          courses: dd.courses,
          affiliatePrograms: dd.affiliatePrograms
        });
      }

      const user = await userModel.createStudent({
        username,
        firstName,
        lastName,
          suffix,
        address,
        city,
        state,
        zip,
        course,
        affiliateProgram,
        phones: { home: phoneHome, cell: phoneCell, work: phoneWork },
        ssn,
        emergencyContact: { name: emergencyName, relation: emergencyRelation, phone: emergencyPhone },
     
        grievanceAck,
        name: `${firstName} ${lastName}`.trim(),
        email,
        password,
        studentId,
        financialAid: financialAid === 'yes',
        referralName,
        referralEmail
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
            url: `/uploads/${f.filename}`
          }));
          await userModel.addUploads(user.id, uploads);
        }
      }

      const { subject, html, text } = emailTemplates.render('registrationSubmitted', { firstName, username });
      await transporter.sendMail({
        from: 'no-reply@mdts-apps.com',
        to: email,
        subject,
        html,
        text
      });

      return res.render('pending', { user: { firstName, lastName, name: `${firstName} ${lastName}` }, financialAid: financialAid === 'yes', selfPay });    } catch (e) {
      console.error(e);
      return res.status(500).render('register', {
        error: 'Registration failed. Please try again.',
        docVersion: DOC_VERSION,
        docText: DOC_TEXT,
        formData: req.body,
        courses: dd.courses,
        affiliatePrograms: dd.affiliatePrograms
      });
    }
  });
});

router.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

module.exports = router;
