const express = require('express');
const router = express.Router();
const preRegModel = require('../models/preRegModel');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

const transporter = nodemailer.createTransport({
  host: 'mdts-apps.com',
  port: 465,
  secure: true,
  auth: {
    user: 'noreply@mdts-apps.com',
    pass: 'c@r,5ysPI@&s'
  }
});

function generateRandomInvoiceNumber() {
  const randomNumber = Math.floor(Math.random() * 9000) + 1000;
  const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${randomNumber}-${currentDate}`;
}

function getPrice(course) {
  const prices = {
    'ITIL 4 Foundation': '$1,424.00',
    CEH: '$3,074.00',
    CND: '$2,724.00',
    'Security+': '$2,875.00',
    'CASP+': '$3,075.00',
    CHFI: '$3,074.99'
  };
  return prices[course] || 'Please contact us for pricing.';
}

function createInvoicePdf({ name, course, price, invoiceNumber }) {
  return new Promise(resolve => {
    const doc = new PDFDocument();
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    doc.fontSize(20).text('Tuition Invoice', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Invoice #: ${invoiceNumber}`);
    doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`);
    doc.moveDown();
    doc.text(`Student: ${name}`);
    doc.text(`Course: ${course}`);
    doc.text(`Amount Due: ${price}`);
    doc.end();
  });
}

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

       const invoiceNumber = generateRandomInvoiceNumber();
    const price = getPrice(course.trim());
    try {
      const pdfBuffer = await createInvoicePdf({
        name: name.trim(),
        course: course.trim(),
        price,
        invoiceNumber
      });
      await transporter.sendMail({
        from: 'noreply@mdts-apps.com',
        to: email.trim(),
        bcc: 'lance.durante@mdtechgo.com,differentcoders@gmail.com,carol.scott@mdtechnicalschool.com,benseghirolga@gmail.com,OlgaB@mdtechnicalschool.com,snyderr@mdtechnicalschool.com,durantelp@mdtechnicalschool.com',
        subject: 'MD Technical School Pre-Registration',
        html: `<p>Thank you, ${name.trim()}, for pre-registering for ${course.trim()}.</p>`,
        attachments: [
          {
            filename: `invoice-${invoiceNumber}.pdf`,
            content: pdfBuffer
          }
        ]
      });
    } catch (err) {
      console.error('Error sending pre-registration email', err);
    }


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