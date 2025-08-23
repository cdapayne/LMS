const express = require('express');
const router = express.Router();
const userModel = require('../models/userModel');

router.use((req, res, next) => {
  if (!req.session || !req.session.user) return res.redirect('/login');
  next();
});

router.get('/account', (req, res) => {
  res.render('account', { user: req.session.user, error: null, success: false });
});

router.post('/account/password', async (req, res) => {
  const { current, password, confirm } = req.body;
  const user = await userModel.findById(req.session.user.id);
  if (!user || !userModel.verifyPassword(user, current)) {
    return res.render('account', { user: req.session.user, error: 'Current password is incorrect', success: false });
  }
  if (!password || password !== confirm) {
    return res.render('account', { user: req.session.user, error: 'Passwords do not match', success: false });
  }
  await userModel.updatePassword(user.username, password);
  res.render('account', { user: req.session.user, error: null, success: true });
});

module.exports = router;