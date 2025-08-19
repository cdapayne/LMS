(function(){
  const root = document.documentElement;
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') {
    root.setAttribute('data-theme', stored);
  }
  window.setupThemeToggle = function(id){
    const btn = document.getElementById(id);
    if (!btn) return;
    function update(){
      const isDark = root.getAttribute('data-theme') === 'dark';
      btn.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    }
    btn.addEventListener('click', function(){
      const isDark = root.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      update();
    });
    update();
  };
})();