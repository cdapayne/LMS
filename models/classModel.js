const db = require('./db');

function mapClass(row) {
  if (!row) return row;
 ['studentIds', 'schedule', 'lectures', 'simulations', 'assignments', 'tests', 'grades', 'attendance', 'checklist'].forEach(k => {    if (row[k] && typeof row[k] === 'string') {
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

async function createClass({ schoolYear, cohort, name, shortName, description, teacherId, schedule, weeks, startDate, endDate }) {
  const [result] = await db.query(
       `INSERT INTO mdtslms_classes (schoolYear, cohort, name, shortName, description, teacherId, weeks, startDate, endDate, studentIds, schedule, lectures, simulations, assignments, tests, grades, attendance, checklist)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [schoolYear, cohort, name, shortName, description, teacherId, weeks || 0, startDate, endDate,
    JSON.stringify([]), JSON.stringify(schedule || []), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([])]  );
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

async function removeStudent(classId, studentId) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  const before = Array.isArray(klass.studentIds) ? klass.studentIds : [];
  const after = before.filter(id => Number(id) !== Number(studentId));
  await db.query('UPDATE mdtslms_classes SET studentIds=? WHERE id=?', [JSON.stringify(after), classId]);
  return true;
}

async function duplicateClass(id) {
  const original = await findClassById(id);
  if (!original) return null;
  const [result] = await db.query(
      `INSERT INTO mdtslms_classes (schoolYear, cohort, name, shortName, description, teacherId, weeks, startDate, endDate, studentIds, schedule, lectures, simulations, assignments, tests, grades, attendance, checklist)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [original.schoolYear, original.cohort, `${original.name} (Copy)`, original.shortName, original.description, original.teacherId, original.weeks, original.startDate, original.endDate,
    JSON.stringify([]), JSON.stringify(original.schedule || []), JSON.stringify(original.lectures || []), JSON.stringify(original.simulations || []), JSON.stringify(original.assignments || []), JSON.stringify(original.tests || []), JSON.stringify([]), JSON.stringify([]), JSON.stringify(original.checklist || [])]  );
  return findClassById(result.insertId);
}

async function renameClass(id, name) {
  await db.query('UPDATE mdtslms_classes SET name=? WHERE id=?', [name, id]);
  return findClassById(id);
}

// Update core class fields and schedule
async function updateClass(id, payload) {
  const {
    schoolYear,
    cohort,
    name,
    shortName,
    description,
    teacherId,
    weeks,
    startDate,
    endDate,
    schedule
  } = payload;
  await db.query(
    `UPDATE mdtslms_classes
     SET schoolYear=?, cohort=?, name=?, shortName=?, description=?, teacherId=?, weeks=?, startDate=?, endDate=?, schedule=?
     WHERE id=?`,
    [
      schoolYear,
      cohort,
      name,
      shortName,
      description,
      teacherId,
      Number(weeks) || 0,
      startDate,
      endDate,
      JSON.stringify(schedule || []),
      id
    ]
  );
  return findClassById(id);
}

// Permanently delete a class
async function deleteClass(id) {
  await db.query('DELETE FROM mdtslms_classes WHERE id = ?', [id]);
  return true;
}

async function addTest(classId, test) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  klass.tests = klass.tests || [];
  const newTest = {
    id: (klass.tests.reduce((m, t) => Math.max(m, t.id), 0) || 0) + 1,
    title: test.title,
    timeLimit: test.timeLimit,
    dueDate: test.dueDate
  };
  klass.tests.push(newTest);
  await db.query('UPDATE mdtslms_classes SET tests=? WHERE id=?', [JSON.stringify(klass.tests), classId]);
  return newTest;
}

async function addAssignment(classId, assignment) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  klass.assignments = klass.assignments || [];
  assignment.id = (klass.assignments.reduce((m, a) => Math.max(m, a.id), 0) || 0) + 1;
  klass.assignments.push(assignment);
  await db.query('UPDATE mdtslms_classes SET assignments=? WHERE id=?', [JSON.stringify(klass.assignments), classId]);
  return assignment;
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

async function updateChecklist(classId, checklist) {
  await db.query('UPDATE mdtslms_classes SET checklist=? WHERE id=?', [JSON.stringify(checklist || []), classId]);
  return true;
}

async function byTeacher(teacherId) {
  const [rows] = await db.query('SELECT * FROM mdtslms_classes WHERE teacherId = ?', [teacherId]);
  return rows.map(mapClass);
}


async function upsertItemGrade(classId, key, itemId, studentId, extra) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  klass.grades = klass.grades || [];
  const now = new Date().toISOString();
  const existing = klass.grades.find(g => g[key] === itemId && g.studentId === studentId);
  if (existing) {
    Object.assign(existing, extra, { gradedAt: now });
  } else {
    const entry = { classId, studentId, gradedAt: now, ...extra };
    entry[key] = itemId;
    klass.grades.push(entry);
  }
  await db.query('UPDATE mdtslms_classes SET grades=? WHERE id=?', [JSON.stringify(klass.grades), classId]);
  return true;
}

async function recordGrade(classId, testId, studentId, score) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  klass.grades = klass.grades || [];
  const now = new Date().toISOString();
  const existing = klass.grades.find(g => g.testId === testId && g.studentId === studentId);
  if (existing) {
    existing.score = score;
    existing.attempt = (existing.attempt || 0) + 1;
    existing.gradedAt = now;
  } else {
    klass.grades.push({ classId, studentId, testId, score, attempt: 1, gradedAt: now });
  }
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
  return upsertItemGrade(classId, 'testId', testId, studentId, { score });
}

async function upsertAssignmentGrade(classId, assignmentId, studentId, score) {
  return upsertItemGrade(classId, 'assignmentId', assignmentId, studentId, { score });
}

async function upsertLabStatus(classId, labId, studentId, passed) {
  return upsertItemGrade(classId, 'labId', labId, studentId, { passed: !!passed });
}

// Removal helpers
async function removeLecture(classId, lectureId) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  const list = Array.isArray(klass.lectures) ? klass.lectures : [];
  const next = list.filter(l => Number(l.id) !== Number(lectureId));
  await db.query('UPDATE mdtslms_classes SET lectures=? WHERE id=?', [JSON.stringify(next), classId]);
  return true;
}

async function removeSimulation(classId, simulationId) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  const list = Array.isArray(klass.simulations) ? klass.simulations : [];
  const next = list.filter(s => Number(s.id) !== Number(simulationId));
  await db.query('UPDATE mdtslms_classes SET simulations=? WHERE id=?', [JSON.stringify(next), classId]);
  return true;
}

async function removeAssignment(classId, assignmentId) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  const list = Array.isArray(klass.assignments) ? klass.assignments : [];
  const next = list.filter(a => Number(a.id) !== Number(assignmentId));
  await db.query('UPDATE mdtslms_classes SET assignments=? WHERE id=?', [JSON.stringify(next), classId]);
  return true;
}

async function removeTest(classId, testId) {
  const klass = await findClassById(classId);
  if (!klass) return null;
  const list = Array.isArray(klass.tests) ? klass.tests : [];
  const next = list.filter(t => Number(t.id) !== Number(testId));
  await db.query('UPDATE mdtslms_classes SET tests=? WHERE id=?', [JSON.stringify(next), classId]);
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
  addAssignment,
  removeStudent,
  removeLecture,
  removeSimulation,
  removeAssignment,
  removeTest,

  recordGrade,
  byTeacher,
  recordAttendance,
  upsertGrade,
  upsertAssignmentGrade,
  upsertLabStatus,
  duplicateClass,
  updateChecklist,
  renameClass,
  updateClass,
  deleteClass
};
