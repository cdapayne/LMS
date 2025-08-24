(function(){
  const questions = window.testQuestions || [];
  const total = questions.length;
  const testId = window.testId;
  let current = 0;
  let score = 0;
  const answers = [];

  function saveProgress(){
    localStorage.setItem('test_'+testId+'_progress', JSON.stringify({current, score, answers}));
  }

  function loadProgress(){
    try{
      const raw = localStorage.getItem('test_'+testId+'_progress');
      if(!raw) return;
      const data = JSON.parse(raw);
      current = data.current || 0;
      score = data.score || 0;
      (data.answers || []).forEach((v,i)=>{ answers[i] = v; });
    }catch(e){}
  }

  function loadQuestion(idx){
    const q = questions[idx];
    document.getElementById('question-number').textContent = `Question ${idx + 1} of ${total}`;
    document.getElementById('question-text').textContent = q.question;
    const img = document.getElementById('question-image');
    if (q.picture) {
      img.src = q.picture;
      img.style.display = '';
    } else {
      img.style.display = 'none';
    }
    const container = document.getElementById('answers-container');
    container.innerHTML = '';
    q.options.forEach((opt, i) => {
      const id = `opt${i}`;
      const div = document.createElement('div');
      div.className = 'form-check list-group-item';
      div.innerHTML = `\n        <input class="form-check-input" type="radio" name="answer" id="${id}" value="${i}">\n        <label class="form-check-label" for="${id}">${opt}</label>\n      `;
      container.appendChild(div);
    });
  }

  function updateGrade(){
    const pct = total ? ((score / total) * 100).toFixed(2) : '0.00';
    document.getElementById('grade').textContent = `${pct}%`;
  }

  function finalize(){
    localStorage.removeItem('test_'+testId+'_progress');
    const form = document.getElementById('final-form');
    form.innerHTML = '';
    questions.forEach((q, i) => {
      const val = typeof answers[i] !== 'undefined' ? answers[i] : '';
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = `q_${i}`;
      input.value = val;
      form.appendChild(input);
    });
    const scoreInput = document.createElement('input');
    scoreInput.type = 'hidden';
    scoreInput.name = 'score';
    scoreInput.value = score;
    form.appendChild(scoreInput);
    form.submit();
  }

  document.getElementById('answers-container').addEventListener('click', function(e){
    const input = e.target.closest('input[type="radio"]');
    if (!input) return;
    const val = Number(input.value);
    const correct = Number(questions[current].answer);
    const parent = input.closest('.form-check');
    if (val === correct) {
      score++;
      parent.classList.add('text-white','bg-success');
    } else {
      parent.classList.add('text-white','bg-danger');
    }
    answers[current] = val;
    updateGrade();
    saveProgress();
    setTimeout(() => {
      current++;
      if (current < total) {
        loadQuestion(current);
      } else {
        finalize();
      }
    }, 500);
  });

  let remaining = (window.timePerQuestion || 90) * total;
  function tick(){
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    document.getElementById('time').textContent = `${m}:${s.toString().padStart(2,'0')}`;
    if (remaining <= 0) {
      finalize();
    } else {
      remaining--;
      setTimeout(tick, 1000);
    }
  }

  window.addEventListener('load', function(){
    // load any saved progress
    loadProgress();
    Swal.fire({
      title: 'Start Test',
      text: `You have 5 attempts. This is attempt ${(window.attempts||0)+1} of 5.`,
      confirmButtonText: 'Begin'
    }).then(() => {
      if (total > 0) {
        loadQuestion(current);
        updateGrade();
        tick();
      }
      else{
        alert('No questions found');
      }
    });
  });
})();
