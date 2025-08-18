const db = require('./db');

function mapClass(row) {
  if (!row) return row;
  ['studentIds', 'schedule', 'lectures', 'simulations', 'tests', 'grades', 'attendance'].forEach(k => {
    if (row[k] && typeof row[k] === 'string') {
      try { row[k] = JSON.parse(row[k]); } catch (_) { row[k] = []; }
    } else if (!row[k]) {
      row[k] = [];
    }
  });
  return row;
}



async function getAllClasses() {
  const [rows] = await db.query('SELECT * FROM mdtslms_classes');
  return rows.map(mapClass);
}

async function findClassById(id) {
  const [rows] = await db.query('SELECT * FROM mdtslms_classes WHERE id = ?', [id]);
  return mapClass(rows[0]);
}

async function createClass({ schoolYear, cohort, name, shortName, description, teacherId, schedule, weeks }) {
  const [result] = await db.query(
    `INSERT INTO mdtslms_classes (schoolYear, cohort, name, shortName, description, teacherId, weeks, studentIds, schedule, lectures, simulations, tests, grades, attendance)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [schoolYear, cohort, name, shortName, description, teacherId, weeks || 0,
     JSON.stringify([]), JSON.stringify(schedule || []), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([])]
  );
  return findClassById(result.insertId);
}

async function addStudent(classId, studentId) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  klass.studentIds = klass.studentIds || [];
  if (!klass.studentIds.includes(studentId)) klass.studentIds.push(studentId);
  await db.query('UPDATE mdtslms_classes SET studentIds=? WHERE id=?', [JSON.stringify(klass.studentIds), classId]);
  return klass;
}

async function duplicateClass(id) {
  const original = await findClassById(id);
  if (!original) return null;
  const [result] = await db.query(
    `INSERT INTO mdtslms_classes (schoolYear, cohort, name, shortName, description, teacherId, weeks, studentIds, schedule, lectures, simulations, tests, grades, attendance)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [original.schoolYear, original.cohort, `${original.name} (Copy)`, original.shortName, original.description, original.teacherId, original.weeks,
     JSON.stringify([]), JSON.stringify(original.schedule || []), JSON.stringify(original.lectures || []), JSON.stringify(original.simulations || []), JSON.stringify(original.tests || []), JSON.stringify([]), JSON.stringify([])]
  );
  return findClassById(result.insertId);
}

async function addTest(classId, test) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  klass.tests = klass.tests || [];
  test.id = (klass.tests.reduce((m, t) => Math.max(m, t.id), 0) || 0) + 1;
  klass.tests.push(test);
  await db.query('UPDATE mdtslms_classes SET tests=? WHERE id=?', [JSON.stringify(klass.tests), classId]);
  return test;
}

async function addLecture(classId, lecture) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  klass.lectures = klass.lectures || [];
  lecture.id = (klass.lectures.reduce((m, l) => Math.max(m, l.id), 0) || 0) + 1;
  klass.lectures.push(lecture);
  await db.query('UPDATE mdtslms_classes SET lectures=? WHERE id=?', [JSON.stringify(klass.lectures), classId]);
  return lecture;
}

async function addSimulation(classId, simulation) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  klass.simulations = klass.simulations || [];
  simulation.id = (klass.simulations.reduce((m, s) => Math.max(m, s.id), 0) || 0) + 1;
  klass.simulations.push(simulation);
  await db.query('UPDATE mdtslms_classes SET simulations=? WHERE id=?', [JSON.stringify(klass.simulations), classId]);
  return simulation;
}

async function byTeacher(teacherId) {
  const [rows] = await db.query('SELECT * FROM mdtslms_classes WHERE teacherId = ?', [teacherId]);
  return rows.map(mapClass);
}


async function recordGrade(classId, testId, studentId, score) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  klass.grades = klass.grades || [];
  klass.grades.push({ classId, testId, studentId, score, gradedAt: new Date().toISOString() });
  await db.query('UPDATE mdtslms_classes SET grades=? WHERE id=?', [JSON.stringify(klass.grades), classId]);
  return true;
}

async function recordAttendance(classId, date, presentIds) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  klass.attendance = klass.attendance || [];
  const existing = klass.attendance.find(a => a.date === date);
  if (existing) {
    existing.present = presentIds;
  } else {
    klass.attendance.push({ date, present: presentIds });
  }
  await db.query('UPDATE mdtslms_classes SET attendance=? WHERE id=?', [JSON.stringify(klass.attendance), classId]);
  return true;
}

async function byTeacher(teacherId) {
 const [rows] = await db.query('SELECT * FROM mdtslms_classes WHERE teacherId = ?', [teacherId]);
  return rows.map(mapClass);

}
async function upsertGrade(classId, testId, studentId, score) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  klass.grades = klass.grades || [];
  const now = new Date().toISOString();
  const existing = klass.grades.find(g => g.testId === testId && g.studentId === studentId);
  if (existing) {
    existing.score = score;
    existing.gradedAt = now;
  } else {
    klass.grades.push({ classId, testId, studentId, score, gradedAt: now });
  }
  await db.query('UPDATE mdtslms_classes SET grades=? WHERE id=?', [JSON.stringify(klass.grades), classId]);
  return true;
}

module.exports = {
  getAllClasses,
  findClassById,
  createClass,
  addStudent,
  addTest,
  addLecture,
  addSimulation,
  recordGrade,
  byTeacher,
  recordAttendance,
  upsertGrade,
  duplicateClass
};



