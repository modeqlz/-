// ═══════════════════════════════════════════════════════════════
//  Reddit Karma Bot — Mini App
// ═══════════════════════════════════════════════════════════════

(() => {
    // ─── Supabase Config ───
    const SUPABASE_URL = "https://xabcwmhmbxhcopoynbyw.supabase.co";
    const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhYmN3bWhtYnhoY29wb3luYnl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODcxOTUsImV4cCI6MjA4OTk2MzE5NX0.m9xCYtWBlObqLVADUhbNlw-DHnUGHc76vsjRmP6Xgr4";

    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#0a0a0b');
        tg.setBackgroundColor('#0a0a0b');

        // ─── Profile Init ───
        const user = tg.initDataUnsafe?.user;
        if (user) {
            document.getElementById('tg-profile-container').style.display = 'block';
            
            const profName = document.getElementById('tg-prof-name');
            const profAvatar = document.getElementById('tg-prof-avatar');
            const profSub = document.getElementById('tg-prof-sub');
            
            profName.textContent = user.first_name || 'Пользователь';
            // Аватарка из Телеграм (если доступна photo_url)
            profAvatar.src = user.photo_url || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%236e56cf" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

            // Запрашиваем из Supabase
            fetch(`${SUPABASE_URL}/rest/v1/subscriptions?telegram_id=eq.${user.id}&select=*`, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            })
            .then(res => res.json())
            .then(data => {
                profSub.classList.remove('loading');
                if (data && data.length > 0) {
                    const sub = data[0];
                    if (sub.active) {
                        profSub.classList.add('active');
                        profSub.textContent = `Тариф: ${sub.plan || 'Pro'}`;
                    } else {
                        profSub.classList.add('inactive');
                        profSub.textContent = 'Подписка неактивна';
                    }
                } else {
                    profSub.classList.add('inactive');
                    profSub.textContent = 'Нет активной подписки';
                }
            })
            .catch(() => {
                profSub.classList.remove('loading');
                profSub.textContent = 'Не удалось загрузить';
            });
        }
    }

    // ─── Scroll Reveal ───
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                const parent = e.target.parentElement;
                const siblings = Array.from(parent.children).filter(c => c.tagName === e.target.tagName);
                const idx = siblings.indexOf(e.target);
                e.target.style.transitionDelay = `${idx * 0.06}s`;
                e.target.classList.add('vis');
                io.unobserve(e.target);
            }
        });
    }, { threshold: 0.12 });
    document.querySelectorAll('.f-card, .step, .p-card, .faq-item').forEach(el => io.observe(el));

    // ─── Smooth Scroll ───
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            const target = document.querySelector(a.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  INTERACTIVE APP DEMO
    // ═══════════════════════════════════════════════════════════

    // ─── Tab switching ───
    document.querySelectorAll('.app-nav').forEach(nav => {
        nav.addEventListener('click', () => {
            document.querySelectorAll('.app-nav').forEach(n => n.classList.remove('active'));
            nav.classList.add('active');
            document.querySelectorAll('.app-tab').forEach(t => t.style.display = 'none');
            const tab = document.getElementById('tab-' + nav.dataset.tab);
            if (tab) tab.style.display = 'block';
        });
    });

    // ─── Toggle switches ───
    document.querySelectorAll('.app-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => toggle.classList.toggle('on'));
    });

    // ─── Demo Bot Simulation ───
    let running = false;
    let interval = null;
    let seconds = 0;
    let comments = 0;
    let karma = 0;

    const btn = document.getElementById('btn-demo-run');
    const runText = document.getElementById('run-text');
    const playIcon = btn?.querySelector('.play-icon');
    const stopIcon = btn?.querySelector('.stop-icon');
    const elComments = document.getElementById('d-comments');
    const elKarma = document.getElementById('d-karma');
    const elUptime = document.getElementById('d-uptime');
    const elStatus = document.getElementById('d-status');
    const elAccKarma = document.getElementById('d-acc-karma');
    const logsEl = document.getElementById('demo-logs');

    const subs = ['r/AskReddit', 'r/funny', 'r/pics', 'r/todayilearned', 'r/worldnews'];
    const actions = [
        { text: 'Генерация комментария через Llama 3...', type: '' },
        { text: 'Анализ поста...', type: '' },
        { text: 'Подбор сабреддита...', type: '' },
    ];

    if (btn) {
        btn.addEventListener('click', () => {
            if (running) {
                stopDemo();
            } else {
                startDemo();
            }
        });
    }

    function startDemo() {
        running = true;
        runText.textContent = 'Остановить';
        playIcon.style.display = 'none';
        stopIcon.style.display = 'block';
        btn.classList.add('running');
        elStatus.textContent = 'Фарм активен';
        elStatus.classList.add('active');
        addLog('Бот запущен', '');
        addLog('Фаза прогрева — просмотр постов...', 'warn');

        interval = setInterval(() => {
            seconds++;
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            elUptime.textContent = `${m}:${s.toString().padStart(2, '0')}`;

            if (seconds === 3) {
                addLog('Прогрев завершён', 'success');
            }

            if (seconds > 3 && seconds % 4 === 0) {
                const sub = subs[Math.floor(Math.random() * subs.length)];
                const k = Math.floor(Math.random() * 20) + 1;
                comments++;
                karma += k;

                elComments.textContent = comments;
                elKarma.textContent = '+' + karma;
                elAccKarma.textContent = karma + ' karma';

                const action = actions[Math.floor(Math.random() * actions.length)];
                addLog(action.text, action.type);

                setTimeout(() => {
                    addLog(`Комментарий в ${sub} (+${k} karma)`, 'success');
                }, 800);
            }

            if (seconds > 3 && seconds % 7 === 0) {
                addLog('Рандомная пауза 60-180 сек...', 'warn');
            }
        }, 1000);
    }

    function stopDemo() {
        running = false;
        clearInterval(interval);
        runText.textContent = 'Запустить';
        playIcon.style.display = 'block';
        stopIcon.style.display = 'none';
        btn.classList.remove('running');
        elStatus.textContent = 'Остановлен';
        elStatus.classList.remove('active');
        addLog('Бот остановлен', 'error');
    }

    function addLog(text, type) {
        if (!logsEl) return;
        const now = new Date();
        const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
            .map(v => v.toString().padStart(2, '0')).join(':');
        const div = document.createElement('div');
        div.className = 'app-log' + (type ? ' ' + type : '');
        div.innerHTML = `<span class="al-time">${time}</span><span class="al-text">${text}</span>`;
        logsEl.appendChild(div);
        while (logsEl.children.length > 20) logsEl.removeChild(logsEl.firstChild);
        logsEl.scrollTop = logsEl.scrollHeight;
    }

    // ─── Plans ───
    document.querySelectorAll('[data-plan]').forEach(btn => {
        btn.addEventListener('click', () => {
            const plan = btn.dataset.plan;
            const names = { starter: 'Starter (7 дней)', pro: 'Pro (30 дней)', unlimited: 'Unlimited (навсегда)' };
            const prices = { starter: 15, pro: 39, unlimited: 99 };
            if (tg) {
                tg.sendData(JSON.stringify({ action: 'buy', plan, price: prices[plan], name: names[plan] }));
            } else {
                alert(`${names[plan]} — $${prices[plan]}\n\nОткройте в Telegram для оформления.`);
            }
        });
    });

    // ─── FAQ Accordion ───
    document.querySelectorAll('.faq-q').forEach(q => {
        q.addEventListener('click', () => {
            const item = q.parentElement;
            const isOpen = item.classList.contains('open');
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
            if (!isOpen) {
                item.classList.add('open');
            }
        });
    });

    // ─── Footer ───
    const openLink = url => tg ? tg.openTelegramLink(url) : window.open(url, '_blank');
    document.getElementById('link-support')?.addEventListener('click', e => { e.preventDefault(); openLink('https://t.me/yanaidyteba'); });
    document.getElementById('link-channel')?.addEventListener('click', e => { e.preventDefault(); openLink('https://t.me/yanaidyteba'); });
})();
