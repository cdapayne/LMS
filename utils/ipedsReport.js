const userModel = require('../models/userModel');
const classModel = require('../models/classModel');

async function generate() {
  const users = await userModel.getAll();
  const classes = await classModel.getAllClasses();
  const students = users.filter(u => u.role === 'student');
  const teachers = users.filter(u => u.role === 'teacher');
  const totalClasses = classes.length;
  const totalEnrollments = classes.reduce((sum, c) => sum + (c.studentIds ? c.studentIds.length : 0), 0);
  const avgClassSize = totalClasses ? totalEnrollments / totalClasses : 0;
  return {
    reporting_year: new Date().getFullYear(),
    total_students: students.length,
    total_teachers: teachers.length,
    total_classes: totalClasses,
    total_enrollments: totalEnrollments,
    avg_class_size: Number(avgClassSize.toFixed(2))
  };
}

function toCsv(data) {
  const headers = Object.keys(data).join(',');
  const values = Object.values(data).join(',');
  return headers + '\n' + values + '\n';
}

module.exports = { generate, toCsv };
