const sentenceSplit = text =>
  text
    .replace(/\n+/g, ' ')
    .split(/[.!?]\s+/)
    .map(s => s.trim())
    .filter(Boolean);

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateQuestions(lecture, questionCount, optionsPerQuestion, testTitle = '') {
  const sentences = sentenceSplit(lecture);
  const allWords = lecture
    .replace(/[^A-Za-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const questions = [];
  for (let i = 0; i < questionCount; i++) {
    const sentence = sentences[i % sentences.length] || randomChoice(sentences);
    const words = sentence.split(/\s+/);
    const targetIndex = Math.floor(Math.random() * words.length);
    const answerWord = words[targetIndex].replace(/[^A-Za-z0-9]/g, '');
    words[targetIndex] = '____';
    const questionText = words.join(' ');
    const distractors = [];
    while (distractors.length < optionsPerQuestion - 1) {
      const w = randomChoice(allWords).replace(/[^A-Za-z0-9]/g, '');
      if (w && w.toLowerCase() !== answerWord.toLowerCase() && !distractors.includes(w)) {
        distractors.push(w);
      }
    }
    const options = [answerWord, ...distractors];
    for (let j = options.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [options[j], options[k]] = [options[k], options[j]];
    }
    const answerIndex = options.indexOf(answerWord);
    questions.push({
      question: questionText,
      options,
      answer: answerIndex,
      answerText: answerWord,
      explanation: sentence,
      picture: '',
      test: testTitle,
      contentType: 'multiple-choice',
      title: `${testTitle} - Q${i + 1}`,
      itemType: 'Question',
      path: ''
    });
  }
  return questions;
}

module.exports = { generateQuestions };