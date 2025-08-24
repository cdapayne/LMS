const db = require('./db');

const TEST_TABLE = 'LMSTest5';


async function getQuestionsByTest(testName) {
    console.log(testName);
  const [rows] = await db.query(`SELECT * FROM ${TEST_TABLE} WHERE Test = ?`, testName);  return rows.map(r => {
    const options = [r.OptionA, r.OptionB, r.OptionC, r.OptionD, r.OptionE, r.OptionF, r.OptionG].filter(Boolean);
    console.log(rows);
    let answerIndex = parseInt(r.Answer, 10);
    if (Number.isNaN(answerIndex)) {
      answerIndex = options.findIndex(opt => opt === r.Answer);
    }
    const answerText = options[answerIndex] || r.Answer;
    return {
      question: r.Question,
      answer: answerIndex,
      answerText,
      explanation: r.Explanation,
      picture: r.Picture,
      options,
      test: r.Test,
      contentType: r['Content Type'],
      title: r.Title,
      itemType: r['Item Type'],
      path: r.Path
    };
  });
}

async function replaceTestQuestions(testName, questions) {
     console.log("inert 2");
  await db.query(`DELETE FROM ${TEST_TABLE} WHERE Test = ?`, [testName]);
  for (const q of questions) {
    const opts = q.options || [];
    const correctAns =
      typeof q.answer === 'number'
        ? opts[q.answer] || q.answerText || ''
        : q.answer || q.answerText || '';
    await db.query(
      `INSERT INTO ${TEST_TABLE} (Question, Answer, Explanation, Picture, OptionA, OptionB, OptionC, OptionD, OptionE, OptionF, OptionG, Test, \`Content Type\`, Title, \`Item Type\`, Path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,      [
        q.question || '',
        correctAns,
        q.explanation || '',
        q.picture || '',
        opts[0] || '',
        opts[1] || '',
        opts[2] || '',
        opts[3] || '',
        opts[4] || '',
        opts[5] || '',
        opts[6] || '',
        q.title,
        q.contentType || 'multiple-choice',
        q.title || '',
        q.itemType || 'Question',
        q.path || ''
      ]
    );
  }
}

async function insertQuestions(questions) {
    console.log("inert 1");
  for (const q of questions) {
    const opts = q.options || [];
    const correctAns =
      typeof q.answer === 'number'
        ? opts[q.answer] || q.answerText || ''
        : q.answer || q.answerText || '';
    await db.query(
     `INSERT INTO ${TEST_TABLE} (Question, Answer, Explanation, Picture, OptionA, OptionB, OptionC, OptionD, OptionE, OptionF, OptionG, Test, \`Content Type\`, Title, \`Item Type\`, Path) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,      [
        q.question || '',
        correctAns,
        q.explanation || '',
        q.picture || '',
        opts[0] || '',
        opts[1] || '',
        opts[2] || '',
        opts[3] || '',
        opts[4] || '',
        opts[5] || '',
        opts[6] || '',
        q.title || '',
        q.contentType || 'multiple-choice',
        q.title || '',
        q.itemType || 'Question',
        q.path || ''
      ]
    );
  }
}


module.exports = { getQuestionsByTest, replaceTestQuestions, insertQuestions };