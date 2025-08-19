const express = require('express');
const router = express.Router();
const eventModel = require('../models/eventModel');
const rsvpModel = require('../models/rsvpModel');

router.get('/events', async (req, res) => {
  const events = await eventModel.getAllEvents();
  const message = req.query.success ? 'RSVP submitted successfully!' : null;
  res.render('events', { events, message });
});

router.post('/events/rsvp', async (req, res) => {
  const { eventId, fullName, email, phone, address, city, state, zip, branch, program } = req.body;
  await rsvpModel.createRSVP({ eventId, fullName, email, phone, address, city, state, zip, branch, program });
  res.redirect('/events?success=1');
});

module.exports = router;