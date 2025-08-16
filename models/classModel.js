const store = require('./dataStore');

async function getAllClasses() { return store.loadClasses(); }

async function findClassById(id) {
  const classes = await store.loadClasses();
  return classes.find(k => k.id === id);
}

async function createClass({ name, description, teacherId, schedule }) {
  const classes = await store.loadClasses();
  const nextId = (classes.reduce((m,k)=>Math.max(m,k.id),0) || 0) + 1;
  const newClass = { id: nextId, name, description, teacherId, studentIds: [], schedule: schedule||[], lectures: [], tests: [], grades: [] };
  classes.push(newClass);
  await store.saveClasses(classes);
  return newClass;
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
  byTeacher
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
