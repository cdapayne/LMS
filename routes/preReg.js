const express = require('express');
const router = express.Router();
const preRegModel = require('../models/preRegModel');

router.get('/pre-register', (_req, res) => {
  res.render('pre_register', { error: null, success: false, formData: {} });
});

router.post('/pre-register', async (req, res) => {
  const { name, phone, email, branch, region, course, referral, consent } = req.body;
  const formData = { name, phone, email, branch, region, course, referral };
  if (!name || !phone || !branch || !region || !course || !referral || consent !== 'on') {
    return res.status(400).render('pre_register', { error: 'All required fields must be filled and consent given.', success: false, formData });
  }
  try {
    await preRegModel.create({
      name: name.trim(),
      phone: phone.trim(),
      email: (email || '').trim() || null,
      branch: branch.trim(),
      region: region.trim(),
      course: course.trim(),
      referral: referral.trim(),
      consent: true
    });
    res.render('pre_register', { error: null, success: true, formData: {} });
  } catch (e) {
    console.error(e);
    res.status(500).render('pre_register', { error: 'Could not submit pre-registration.', success: false, formData });
  }
});

module.exports = router;