const express = require('express');
const router = express.Router();
const preRegModel = require('../models/preRegModel');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const path = require('path');
const emailTemplates = require('../utils/emailTemplates');


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

function getPriceValue(course) {
  const prices = {
    'ITIL 4 Foundation': 1424.00,
    'CEH': 3074.00,
    'CND': 2724.00,
    'Security+': 2875.00,
    'CASP+': 3075.00,
    'CHFI': 3074.99
  };
  return prices[course] ?? null; // null => unknown (we’ll handle)
}

function formatCurrency(n) {
  if (typeof n !== 'number') return n;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function createInvoicePdf({ name, course, priceValue, invoiceNumber }) {
  return new Promise(resolve => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    // ------- Branding / constants -------
    const BRAND = {
      name: 'MD Technical School',
      color: '#1e90ff', // dodgerblue
      accent: '#0b60c8',
      textMuted: '#6b7280',
      addressLines: [
        'MD Technical School',
        '10304 Spotsylvania Ave, Ste 210',
        'Fredericksburg, VA 22408',
        'register@cybertraining4u.com',
        '(757) 810-3470'
      ],
      logoPath: path.join(__dirname, './docs/logo.svg')
    };

    // Helpers
    const line = (y, color = '#e5e7eb') => {
      doc.save().moveTo(50, y).lineTo(562, y).lineWidth(1).strokeColor(color).stroke().restore();
    };

    const rightText = (txt, y, options = {}) => {
      doc.text(txt, 300, y, { width: 262, align: 'right', ...options });
    };

    const label = (txt, x, y) => {
      doc.fillColor(BRAND.textMuted).fontSize(9).text(txt, x, y);
      doc.fillColor('black').fontSize(11);
    };

    // ------- Header band -------
    doc.rect(0, 0, doc.page.width, 110).fill(BRAND.color);
    doc.fillColor('#ffffff').fontSize(20).text('Tuition Invoice', 50, 35);
    doc.fontSize(10).text(BRAND.name, 50, 65);

    // Optional logo (if you have a file on disk)
    if (BRAND.logoPath) {
      try {
        doc.image(BRAND.logoPath, 462, 20, { width: 90, height: 90, align: 'right' });
      } catch (_) { /* ignore if missing */ }
    }

    // Invoice badge
    doc
      .roundedRect(50, 115, 200, 28, 6)
      .fillAndStroke('#f5f9ff', BRAND.accent)
      .fillColor(BRAND.accent)
      .fontSize(12)
      .text(`Invoice # ${invoiceNumber}`, 60, 123);

    // ------- Meta info -------
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    rightText(`Date: ${dateStr}`, 120);
    rightText(`Status: Pending`, 138);
    rightText(`Due Upon Receipt`, 156);

    // ------- Bill To / Summary -------
    let y = 160 + 30;
    label('Bill To', 50, y);
    doc.text(name, 50, y + 14);

    label('Program', 300, y);
    doc.text(course, 300, y + 14, { width: 260, align: 'right' });

    y += 54;
    line(y);

    // ------- Excited blurb -------
    y += 16;
    doc
      .fontSize(12)
      .fillColor('black')
      .text(
        `Welcome to ${BRAND.name}! We’re thrilled you’ve taken the next step toward your IT career. ` +
        `Your seat is being prepared, your resources are getting queued up, and we can’t wait to see you in class!`,
        50, y, { width: 512 }
      );

    y = doc.y + 10;

    // ------- Items table header -------
    y += 16;
    doc.fontSize(10).fillColor(BRAND.textMuted);
    doc.text('Description', 50, y);
    rightText('Amount', y);
    y += 10;
    line(y);
    doc.fillColor('black');

    // ------- Line items -------
    const priceKnown = typeof priceValue === 'number';
    const tuitionAmount = priceKnown ? priceValue : 0;

    y += 14;
    doc.fontSize(11);
    doc.text(`${course} – Tuition`, 50, y, { width: 380 });
    rightText(priceKnown ? formatCurrency(tuitionAmount) : 'Contact for pricing', y);

    // (Optional) add registration fee or materials if you want:
    // y += 18;
    // doc.text(`Student Services & Materials`, 50, y, { width: 380 });
    // rightText(formatCurrency(0), y);

    y += 24;
    line(y);
    y += 8;

    // ------- Totals -------
    const subtotal = tuitionAmount;
    const discount = 0;
    const total = subtotal - discount;

    const totalsXLeft = 300;
    const row = (labelTxt, valTxt) => {
      doc.fillColor(BRAND.textMuted).fontSize(10).text(labelTxt, totalsXLeft, y, { width: 150, align: 'right' });
      doc.fillColor('black').fontSize(11).text(valTxt, totalsXLeft + 160, y, { width: 102, align: 'right' });
      y += 18;
    };

    row('Subtotal', priceKnown ? formatCurrency(subtotal) : '—');
    // row('Scholarship/Discount', formatCurrency(discount));
    doc.fillColor(BRAND.accent).fontSize(12).text('Amount Due', totalsXLeft, y, { width: 150, align: 'right' });
    doc
      .fillColor(BRAND.accent)
      .fontSize(12)
      .text(priceKnown ? formatCurrency(total) : 'Contact for pricing', totalsXLeft + 160, y, { width: 102, align: 'right' });
    doc.fillColor('black');
    y += 16;

    // ------- Payment instructions -------
    y += 8;
    line(y);
    y += 14;

// ------- How to Pay -------
y = doc.y + 16;           // start a bit below the previous block
line(y);
y += 14;

doc.fontSize(12).fillColor('black').text('How to Pay', 50, y);
doc.moveDown(0.5);

// Use PDFKit lists so spacing is handled for you
doc.fontSize(10).fillColor(BRAND.textMuted).list(
  [
    'Contact Us at (540) 455-2878',
    'Financial Aid: https://climbcredit.com/apply/mdtechnical?page=create-account&schoolId=MD4644868617478',
    'Questions? Email: register@cybertraining4u.com'
  ],
  50,                      // x
  doc.y,                   // let it flow from current y
  { width: 512, bulletRadius: 2, textIndent: 10, bulletIndent: 10 }
);
doc.fillColor('black');

// ------- Notes / Terms -------
y = doc.y + 16;           // start below the list that just flowed
line(y);
y += 14;

doc.fontSize(12).fillColor('black').text('Notes & Terms', 50, y);
doc.moveDown(0.5);

doc.fontSize(10).fillColor(BRAND.textMuted).text(
  'Thank you for choosing MD Technical School! Your enrollment team will reach out with next steps, including materials access, class schedule, and onboarding details.',
  50, doc.y, { width: 512 }
);
doc.text(
  'Refunds and cancellations follow the published policy. Some programs may be eligible for funding through Army, Air Force, MyCAA, WIOA, DARS, or other affiliates. Please contact our office for details.',
  50, doc.y + 6, { width: 512 }
);
doc.fillColor('black');

    y = doc.y + 8;
    doc
      .text(
        'Refunds and cancellations follow the published policy. Some programs may be eligible for funding ' +
        'through Army, Air Force, MyCAA, WIOA, DARS, or other affiliates. Please contact our office for details.',
        50, y, { width: 512 }
      );
    doc.fillColor('black');

    // ------- Address footer -------
    const footerY = doc.page.height - 70;
    line(footerY - 10);
    doc.fontSize(9).fillColor(BRAND.textMuted);
    // BRAND.addressLines.forEach((ln, i) => {
    //   doc.text(ln, 50, footerY + i * 12);
    // });
    //doc.text(`Page ${doc.page.number}`, 460, footerY + 0, { width: 100, align: 'right' });
    doc.fillColor('black');

    doc.end();
  });
}


router.get('/pre-register', (_req, res) => {
  res.render('pre_register', { error: null, success: false, formData: {} });
});

router.post('/pre-register', async (req, res) => {

  try{
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
const priceValue = getPriceValue(course.trim());

const pdfBuffer = await createInvoicePdf({
  name: name.trim(),
  course: course.trim(),
  priceValue,
  invoiceNumber
});

const { subject, html } = emailTemplates.render('preRegConfirmation', {
  firstName: name.split(' ')[0],
  course: course.trim()
});
await transporter.sendMail({
  from: 'no-reply@mdts-apps.com',
  to: email.trim(),
  bcc: 'lance.durante@mdtechgo.com,differentcoders@gmail.com,carol.scott@mdtechnicalschool.com,benseghirolga@gmail.com,OlgaB@mdtechnicalschool.com,snyderr@mdtechnicalschool.com,durantelp@mdtechnicalschool.com',
  subject,
  html,
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