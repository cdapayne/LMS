require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const studentRoutes = require('./routes/student');
const teacherRoutes = require('./routes/teacher');
const paymentRoutes = require('./routes/payment');
const preRegRoutes = require('./routes/preReg');
const eventRoutes = require('./routes/events');
const accountRoutes = require('./routes/account');

// Initialize admissions workflow queue
require('./utils/admissionsWorkflow');



const app = express();

// Load branding configuration and expose to views
const branding = require('./branding.json');
app.locals.branding = branding;
app.use((req, res, next) => {
  res.locals.branding = branding;
  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: 'lax', httpOnly: true }
}));

app.use('/docs', express.static(path.join(__dirname, 'docs')));


app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', (req, res) => {
  if (!req.session || !req.session.role) return res.redirect('/login');
  const role = req.session.role;
  if (role === 'admin')   return res.redirect('/admin');
  if (role === 'teacher') return res.redirect('/teacher');
  if (role === 'student') return res.redirect('/student');
  return res.redirect('/login');
});

app.use(authRoutes);
app.use(preRegRoutes);

app.use('/admin', adminRoutes);
app.use(paymentRoutes);
app.use(eventRoutes);


app.use('/student', studentRoutes);
app.use('/teacher', teacherRoutes);
app.use(accountRoutes);

const PORT = process.env.PORT || 3012;
app.listen(PORT, () => console.log(`School LMS running on http://localhost:${PORT}`));
