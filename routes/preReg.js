const express = require('express');
const router = express.Router();
const preRegModel = require('../models/preRegModel');

router.get('/pre-register', (_req, res) => {
  res.render('pre_register', { error: null, success: false, formData: {} });
});

router.post('/pre-register', async (req, res) => {
  const {
    name,
    email,
    phone,
    phoneCarrier,
    address,
    zip,
    state,
    serving,
    branch,
    course,
    applicantType,
    referral,
    referralEmail,
    consent,
    action
  } = req.body;

  const formData = {
    name,
    email,
    phone,
    phoneCarrier,
    address,
    zip,
    state,
    serving,
    branch,
    course,
    applicantType,
    referral,
    referralEmail,
    consent: consent === 'on'
  };

  if (
    !name ||
    !email ||
    !phone ||
    !zip ||
    !state ||
    !course ||
    !applicantType ||
    !serving ||
    (serving === 'yes' && !branch) ||
    consent !== 'on'
  ) {
    return res
      .status(400)
      .render('pre_register', {
        error: 'All required fields must be filled and consent given.',
        success: false,
        formData
      });
  }

  try {
    await preRegModel.create({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      phoneCarrier: (phoneCarrier || '').trim() || null,
      address: (address || '').trim() || null,
      zip: zip.trim(),
      state: state.trim(),
      serving: serving === 'yes',
      branch: serving === 'yes' ? branch.trim() : null,
      course: course.trim(),
      applicantType: applicantType.trim(),
      referral: (referral || '').trim() || null,
      referralEmail: (referralEmail || '').trim() || null,
      consent: true
    });

    if (action === 'enroll') {
      const [firstName, ...rest] = name.trim().split(' ');
      const lastName = rest.join(' ');
      req.session.preRegData = {
        firstName,
        lastName,
        email: email.trim(),
        address: (address || '').trim(),
        state: state.trim(),
        zip: zip.trim(),
        course: course.trim(),
        referralName: (referral || '').trim(),
        referralEmail: (referralEmail || '').trim()
      };
      return res.redirect('/register');
    }

    res.render('pre_register', { error: null, success: true, formData: {} });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .render('pre_register', {
        error: 'Could not submit pre-registration.',
        success: false,
        formData
      });
  }
});

module.exports = router;