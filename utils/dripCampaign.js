const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const emailTemplates = require('./emailTemplates');

const campaignsPath = path.join(__dirname, '../data/dripCampaigns.json');

const transporter = nodemailer.createTransport({
  host: 'mdts-apps.com',
  port: 465,
  secure: true,
  auth: {
    user: 'noreply@mdts-apps.com',
    pass: 'c@r,5ysPI@&s'
  }
});

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID || '',
  process.env.TWILIO_AUTH_TOKEN || ''
);

function loadCampaigns() {
  try {
    const data = fs.readFileSync(campaignsPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveCampaigns(list) {
  fs.writeFileSync(campaignsPath, JSON.stringify(list, null, 2));
}

function addCampaign({ email, phone }) {
  const steps = [
    { delayMinutes: 0, template: 'registrationSubmitted', sms: 'Thanks for registering with MDTS!' },
    { delayMinutes: 1440, template: 'enrollmentStep2', sms: 'Remember to finish your enrollment.' }
  ];
  const campaigns = loadCampaigns();
  const firstRun = Date.now() + steps[0].delayMinutes * 60000;
  campaigns.push({ email, phone, steps, nextStep: 0, nextRun: firstRun });
  saveCampaigns(campaigns);
}

function processCampaigns() {
  const campaigns = loadCampaigns();
  const now = Date.now();
  let changed = false;
  campaigns.forEach(c => {
    if (c.nextRun <= now) {
      const step = c.steps[c.nextStep];
      const rendered = emailTemplates.render(step.template, { name: c.email });
      transporter.sendMail({ to: c.email, subject: rendered.subject, html: rendered.html });
      if (c.phone && step.sms) {
        twilioClient.messages.create({ to: c.phone, from: process.env.TWILIO_FROM_NUMBER, body: step.sms }).catch(() => {});
      }
      c.nextStep++;
      if (c.nextStep < c.steps.length) {
        c.nextRun = now + c.steps[c.nextStep].delayMinutes * 60000;
      } else {
        c.complete = true;
      }
      changed = true;
    }
  });
  const active = campaigns.filter(c => !c.complete);
  if (changed) saveCampaigns(active);
}

function init() {
  cron.schedule('* * * * *', processCampaigns);
}

module.exports = { init, addCampaign, loadCampaigns };
