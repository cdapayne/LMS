const store = require('./dataStore');

async function getAllClasses() { return store.loadClasses(); }

async function findClassById(id) {
  const classes = await store.loadClasses();
  return classes.find(k => k.id === id);
}

async function createClass({ schoolYear, cohort, name, shortName, description, teacherId, schedule }) {
  const classes = await store.loadClasses();
  const nextId = (classes.reduce((m,k)=>Math.max(m,k.id),0) || 0) + 1;
   const newClass = {
    id: nextId,
     schoolYear,
    cohort,
    name,
    description,
    teacherId,
    weeks: weeks || 0,
    studentIds: [],
    schedule: schedule || [],
    lectures: [],
    tests: [],
    grades: [],
        attendance: []

  };
  classes.push(newClass);
  await store.saveClasses(classes);
  return newClass;
}

async function recordAttendance(classId, date, presentIds) {
  const classes = await store.loadClasses();
  const k = classes.find(c => c.id === classId);
  if (!k) return null;
  if (!k.attendance) k.attendance = [];
  const existing = k.attendance.find(a => a.date === date);
  if (existing) {
    existing.present = presentIds;
  } else {
    k.attendance.push({ date, present: presentIds });
  }
  await store.saveClasses(classes);
  return true;
}

async function addStudent(classId, studentId) {
  const classes = await store.loadClasses();
  const k = classes.find(c => c.id === classId);
  if (!k) return null;
  if (!k.studentIds) k.studentIds = [];
  if (!k.studentIds.includes(studentId)) k.studentIds.push(studentId);
  await store.saveClasses(classes);
  return k;
}

async function duplicateClass(id) {
  const classes = await store.loadClasses();
  const original = classes.find(c => c.id === id);
  if (!original) return null;
  const nextId = (classes.reduce((m, k) => Math.max(m, k.id), 0) || 0) + 1;
  const copy = {
    id: nextId,
    name: `${original.name} (Copy)`,
    description: original.description,
    teacherId: original.teacherId,
    studentIds: [],
    schedule: JSON.parse(JSON.stringify(original.schedule || [])),
    lectures: JSON.parse(JSON.stringify(original.lectures || [])),
    tests: JSON.parse(JSON.stringify(original.tests || [])),
    grades: []
  };
  classes.push(copy);
  await store.saveClasses(classes);
  return copy;
}

async function addTest(classId, test) {
  const classes = await store.loadClasses();
  const k = classes.find(c => c.id === classId);
  if (!k) return null;
  if (!k.tests) k.tests = [];
  test.id = (k.tests.reduce((m,t)=>Math.max(m,t.id),0) || 0) + 1;
  k.tests.push(test);
  await store.saveClasses(classes);
  return test;
}

async function recordGrade(classId, testId, studentId, score) {

  const classes = await store.loadClasses();
  const k = classes.find(c => c.id === classId);
  if (!k) return null;
  if (!k.grades) k.grades = [];
  k.grades.push({ classId, testId, studentId, score, gradedAt: new Date().toISOString() });
  await store.saveClasses(classes);
  return true;
}

async function byTeacher(teacherId) {
  const classes = await store.loadClasses();
  return classes.filter(k => k.teacherId === teacherId);
}

module.exports = {
  getAllClasses,
  findClassById,
  createClass,
  addStudent,
  addTest,
  recordGrade,
   byTeacher,
  recordAttendance,
  upsertGrade,
  duplicateClass
};


async function upsertGrade(classId, testId, studentId, score) {
  const classes = await store.loadClasses();
  const k = classes.find(c => c.id === classId);
  if (!k) return null;
  if (!k.grades) k.grades = [];
  const existing = k.grades.find(g => g.testId === testId && g.studentId === studentId);
  const now = new Date().toISOString();
  if (existing) {
    existing.score = score;
    existing.gradedAt = now;
  } else {
    k.grades.push({ classId, testId, studentId, score, gradedAt: now });
  }
  await store.saveClasses(classes);
  return true;
}
