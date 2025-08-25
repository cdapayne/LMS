(function(){
  const root = document.documentElement;
  fetch('/branding.json')
    .then(r => r.json())
    .then(b => {
      if (b.primaryColor) root.style.setProperty('--primary-color', b.primaryColor);
      if (b.secondaryColor) root.style.setProperty('--secondary-color', b.secondaryColor);
    })
    .catch(() => {});
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