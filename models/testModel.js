const db = require('./db');

async function getQuestionsByTest(testName) {
  const [rows] = await db.query('SELECT * FROM LMSTest5 WHERE Test = ?', [testName]);
  return rows.map(r => ({
    question: r.Question,
    answer: r.Answer,
    explanation: r.Explanation,
    picture: r.Picture,
    options: [r.OptionA, r.OptionB, r.OptionC, r.OptionD, r.OptionE, r.OptionF, r.OptionG].filter(Boolean),
    test: r.Test,
    contentType: r['Content Type'],
    title: r.Title,
    itemType: r['Item Type'],
    path: r.Path
  }));
}

async function replaceTestQuestions(testName, questions) {
  await db.query('DELETE FROM LMSTest5 WHERE Test = ?', [testName]);
  for (const q of questions) {
    const opts = q.options || [];
    await db.query(
      'INSERT INTO LMSTest5 (Question, Answer, Explanation, Picture, OptionA, OptionB, OptionC, OptionD, OptionE, OptionF, OptionG, Test, `Content Type`, Title, `Item Type`, Path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        q.question || '',
        q.answer || '',
        q.explanation || '',
        q.picture || '',
        opts[0] || '',
        opts[1] || '',
        opts[2] || '',
        opts[3] || '',
        opts[4] || '',
        opts[5] || '',
        opts[6] || '',
        testName,
        q.contentType || 'multiple-choice',
        q.title || '',
        q.itemType || 'Question',
        q.path || ''
      ]
    );
  }
}

module.exports = { getQuestionsByTest, replaceTestQuestions };