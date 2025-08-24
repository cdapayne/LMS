const nodemailer = require('nodemailer');

let Queue;
try {
  Queue = require('bull');
} catch (e) {
  // Bull might not be installed or Redis not available.
  console.warn('Bull not available, admissions workflow disabled');
}

// Simple transporter reuse; in real usage this should come from config
const transporter = nodemailer.createTransport({
  host: 'mdts-apps.com',
  port: 465,
  secure: true,
  auth: {
    user: 'noreply@mdts-apps.com',
    pass: 'c@r,5ysPI@&s'
  }
});

let workflowQueue = null;
if (Queue) {
  try {
    workflowQueue = new Queue('admissions', process.env.REDIS_URL || 'redis://127.0.0.1:6379');
    workflowQueue.process(async job => {
      const { applicant, state } = job.data;
      try {
        if (state === 'submitted') {
          await send(applicant.email, 'Application Received', `Hi ${applicant.name}, we received your application.`);
          await workflowQueue.add({ applicant, state: 'review' });
        } else if (state === 'review') {
          await send(applicant.email, 'Application Under Review', `Hi ${applicant.name}, your application is under review.`);
          // simple auto decision example
          const decision = applicant.autoDeny ? 'denied' : 'accepted';
          await workflowQueue.add({ applicant, state: decision });
        } else if (state === 'accepted') {
          await send(applicant.email, 'Application Accepted', `Congratulations ${applicant.name}, you have been accepted!`);
        } else if (state === 'denied') {
          await send(applicant.email, 'Application Denied', `Hello ${applicant.name}, we are unable to accept your application.`);
        }
      } catch (e) {
        console.error('Workflow processing error', e);
      }
    });
  } catch (e) {
    console.warn('Could not initialize admissions workflow queue', e.message);
    workflowQueue = null;
  }
}

async function send(to, subject, html) {
  try {
    await transporter.sendMail({ from: 'no-reply@mdts-apps.com', to, subject, html });
  } catch (e) {
    console.error('Email send failed', e);
  }
}

function enqueueApplicant(applicant) {
  if (!workflowQueue) return;
  workflowQueue.add({ applicant, state: 'submitted' });
}

module.exports = { enqueueApplicant };
