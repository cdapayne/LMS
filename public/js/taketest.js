(function(){
  const questions = window.testQuestions || [];
  const total = questions.length;
  let current = 0;
  let score = 0;
  const answers = [];

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
      div.className = 'form-check';
      div.innerHTML = `\n        <input class="form-check-input" type="radio" name="answer" id="${id}" value="${i}">\n        <label class="form-check-label" for="${id}">${opt}</label>\n      `;
      container.appendChild(div);
    });
  }

  function updateGrade(){
    const pct = total ? ((score / total) * 100).toFixed(2) : '0.00';
    document.getElementById('grade').textContent = `${pct}%`;
  }

  function finalize(){
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

  document.getElementById('question-form').addEventListener('submit', function(e){
    e.preventDefault();
    const selected = document.querySelector('input[name="answer"]:checked');
    if (!selected) return;
    const val = Number(selected.value);
    const correct = Number(questions[current].answer);
    if (val === correct) {
      score++;
      Swal.fire({title:'Correct!', icon:'success', timer:1000, showConfirmButton:false});
    } else {
      Swal.fire({title:'Incorrect!', icon:'error', timer:1000, showConfirmButton:false});
    }
    answers[current] = val;
    current++;
    updateGrade();
    if (current < total) {
      loadQuestion(current);
    } else {
      finalize();
    }
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
    if (total > 0) {
      loadQuestion(0);
      updateGrade();
      tick();
    }
  });
})();