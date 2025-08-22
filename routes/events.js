const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const eventModel = require('../models/eventModel');
const rsvpModel = require('../models/rsvpModel');

const transporter = nodemailer.createTransport({
  host: 'mdts-apps.com',
  port: 465,
  secure: true,
  auth: {
    user: 'noreply@mdts-apps.com',
    pass: 'c@r,5ysPI@&s'
  }
});

router.get('/events', async (req, res) => {
  const events = await eventModel.getAllEvents();
  const message = req.query.success ? 'RSVP submitted successfully!' : null;
  res.render('events', { events, message });
});

router.post('/events/rsvp', async (req, res) => {
  const { eventId, fullName, email, phone, address, city, state, zip, branch, program } = req.body;
  await rsvpModel.createRSVP({ eventId, fullName, email, phone, address, city, state, zip, branch, program });

  try {
    const event = await eventModel.getEventById(eventId);
    if (event) {
      const eventDate = new Date(event.eventDate);
      const formattedDate = eventDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const start = eventDate.toISOString().slice(0, 10).replace(/-/g, '');
      const end = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '');
      const calendarLink = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
        event.name
      )}&dates=${start}/${end}&details=${encodeURIComponent(event.description || '')}`;
      const icsContent = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//MDTS LMS//EN\nBEGIN:VEVENT\nUID:${Date.now()}@mdts-apps.com\nDTSTAMP:${new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .split('.')[0]}Z\nDTSTART;VALUE=DATE:${start}\nDTEND;VALUE=DATE:${end}\nSUMMARY:${event.name}\nDESCRIPTION:${(event.description || '').replace(
        /\n/g,
        '\\n'
      )}\nEND:VEVENT\nEND:VCALENDAR`;

      await transporter.sendMail({
        from: 'no-reply@mdts-apps.com',
        to: email,
        subject: `You're in for ${event.name}!`,
        text: `Hi ${fullName},\n\nWe're excited you've RSVP'd for ${event.name} on ${formattedDate}.\n\nAdd to your calendar: ${calendarLink}\n\nSee you there!`,
        html: `
          <p>Hi ${fullName},</p>
          <p>We're excited you've RSVP'd for <strong>${event.name}</strong> on ${formattedDate}.</p>
          <strong>${event.description}</strong>
          <p><a href="${calendarLink}">Add to Google Calendar</a></p>
          <p>We look forward to seeing you!</p>
        `,
        icalEvent: {
          filename: 'event.ics',
          method: 'PUBLISH',
          content: icsContent
        }
      });
    }
  } catch (e) {
    console.error('Failed to send RSVP email', e);
  }
  res.redirect('/events?success=1');
});

module.exports = router;