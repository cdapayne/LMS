const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');

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
}).array('docs', 2); // max 2 files

// Email transporter
const transporter = nodemailer.createTransport({
  host: 'mdts-apps.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
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

router.get('/login', (req, res) => res.render('login', { error: null }));

router.post('/login', async (req, res) => {
  const username = ensureStr(req.body.username);
  const password = ensureStr(req.body.password);

  const user = await userModel.findByUsername(username);
  if (!user || !userModel.verifyPassword(user, password)) {
    return res.status(401).render('login', { error: 'Invalid credentials' });
  }
  req.session.user = { id: user.id, name: user.name, username: user.username, firstName: user.firstName, lastName: user.lastName };
  req.session.role = user.role;

  if (user.role === 'student' && (user.status === 'pending' || !user.status)) {
    return res.render('pending', { user });
  }
  return res.redirect('/dashboard');
});

router.get('/register', (req, res) => {
  res.render('register', {
    error: null,
    docVersion: DOC_VERSION,
    docText: DOC_TEXT,
    formData: {}
  });
});

router.post('/register', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).render('register', {
        error: err.message,
        docVersion: DOC_VERSION,
        docText: DOC_TEXT,
        formData: req.body
      });
    }

    try {
      const firstName = ensureStr(req.body.firstName);
      const lastName = ensureStr(req.body.lastName);
      const username = ensureStr(req.body.username) || `${firstName}${lastName}`.replace(/\s+/g, '');
      const email = ensureStr(req.body.email);
      const confirmEmail = ensureStr(req.body.confirmEmail);
      const password = ensureStr(req.body.password);
      const studentId = ensureStr(req.body.studentId);
      const agree = ensureStr(req.body.agree);
      const signatureDataUrl = ensureStr(req.body.signatureDataUrl);

      if (email !== confirmEmail) {
        return res.status(400).render('register', {
          error: 'Emails do not match.',
          docVersion: DOC_VERSION,
          docText: DOC_TEXT,
          formData: req.body
        });
      }

      if (!agree || !signatureDataUrl) {
        return res.status(400).render('register', {
          error: 'You must agree and sign the registration agreement.',
          docVersion: DOC_VERSION,
          docText: DOC_TEXT,
          formData: req.body
        });
      }

      const user = await userModel.createStudent({
        username,
        firstName,
        lastName,
        name: `${firstName} ${lastName}`.trim(),
        email,
        password,
        studentId,
        signatureDataUrl,
        agreedDocVersion: DOC_VERSION,
        docs: req.files?.map(f => f.filename) || []
      });

      await transporter.sendMail({
        from: 'no-reply@mdts-apps.com',
        to: email,
        subject: 'Registration submitted (pending approval)',
        text: `Hi ${firstName}, your registration is pending admin approval. Username: ${username}.`
      });

      return res.render('pending', { user: { firstName, lastName, name: `${firstName} ${lastName}` } });
    } catch (e) {
      console.error(e);
      return res.status(500).render('register', {
        error: 'Registration failed. Please try again.',
        docVersion: DOC_VERSION,
        docText: DOC_TEXT,
        formData: req.body
      });
    }
  });
});

router.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

module.exports = router;
