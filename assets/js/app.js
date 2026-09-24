'use strict';

// Bağımsız uygulama başlatıcı: tema yönetimi + ConfigGenerator'ın ilk render'ı.
(function () {
    const root = document.documentElement;
    const btn  = document.getElementById('themeToggle');

    function apply(theme) {
        root.setAttribute('data-theme', theme);
        // Tema değişkenleri body.dark-mode altında, bazı bileşenler [data-theme="dark"] altında tanımlı.
        document.body.classList.toggle('dark-mode', theme === 'dark');
        if (btn) btn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }

    apply(root.getAttribute('data-theme') || 'light');

    if (btn) {
        btn.addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            apply(next);
            try { localStorage.setItem('cg-theme', next); } catch (e) {}
        });
    }

    if (typeof ConfigGenerator !== 'undefined') ConfigGenerator.init();
})();
