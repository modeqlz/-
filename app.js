// ═══════════════════════════════════════════════════════════════
//  Reddit Karma Bot — Mini App (БЕЗОПАСНАЯ ВЕРСИЯ)
//  Все запросы идут через API сервер, НЕТ прямого доступа к БД
// ═══════════════════════════════════════════════════════════════

(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#0a0a0b');
        tg.setBackgroundColor('#0a0a0b');
    }

    // ─── API Helper (все запросы через сервер с валидацией initData) ───
    function getInitData() {
        return tg?.initData || '';
    }

    async function api(endpoint, options = {}) {
        const initData = getInitData();
        if (!initData) throw new Error('No initData');

        const res = await fetch(endpoint, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData,
                ...options.headers,
            },
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || 'Server error');
        }

        return res.json();
    }

    // ═══════════════════════════════════════════════════════════
    //  PROFILE + AUTH (через API)
    // ═══════════════════════════════════════════════════════════
    if (tg && tg.initData) {
        const startParam = tg.initDataUnsafe?.start_param;

        // 1. Deep Link авторизация — через сервер, не напрямую в БД
        if (startParam && /^\d{6}$/.test(startParam)) {
            api('/api/auth-confirm', {
                method: 'POST',
                body: JSON.stringify({ code: startParam }),
            })
            .then(() => {
                tg.showPopup({
                    title: '✅ Авторизация успешна',
                    message: 'Вернитесь в приложение на ПК — оно загрузится автоматически.',
                    buttons: [{ type: 'ok', text: 'Понятно' }],
                });
            })
            .catch(err => {
                tg.showPopup({
                    title: '❌ Ошибка',
                    message: err.message || 'Не удалось авторизоваться.',
                    buttons: [{ type: 'ok', text: 'OK' }],
                });
            });
        }

        // 2. Загружаем профиль через API
        api('/api/profile')
            .then(data => {
                const container = document.getElementById('tg-profile-container');
                container.style.display = 'block';

                const profName = document.getElementById('tg-prof-name');
                const profAvatar = document.getElementById('tg-prof-avatar');
                const profSub = document.getElementById('tg-prof-sub');

                profName.textContent = data.user.first_name || 'Пользователь';
                profAvatar.src = data.user.photo_url ||
                    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%236e56cf" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

                profSub.classList.remove('loading');
                if (data.subscription && data.subscription.active) {
                    profSub.classList.add('active');
                    profSub.textContent = `Тариф: ${data.subscription.plan || 'Pro'}`;
                    document.getElementById('tg-prof-action-btn').textContent = 'Продлить';
                } else {
                    profSub.classList.add('inactive');
                    profSub.textContent = data.subscription ? 'Подписка неактивна' : 'Нет подписки';
                    document.getElementById('tg-prof-action-btn').textContent = 'Купить';
                }

                // 3. Админ-панель (сервер валидирует isAdmin)
                if (data.isAdmin) {
                    const toggles = document.getElementById('admin-toggles');
                    const panel = document.getElementById('admin-panel');
                    const btnToggle = document.getElementById('btn-toggle-admin');

                    toggles.style.display = 'block';

                    btnToggle.addEventListener('click', () => {
                        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                    });

                    document.getElementById('admin-grant-btn').addEventListener('click', async () => {
                        const idStr = document.getElementById('admin-tg-id').value.trim();
                        if (!idStr) return alert('Введите ID!');

                        const plan = document.getElementById('admin-plan').value;
                        const days = parseInt(document.getElementById('admin-days').value) || 30;
                        const statusEl = document.getElementById('admin-status');

                        const iconLoad = `<svg style="width:14px;height:14px;animation:spin 1s linear infinite" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
                        const iconOk = `<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
                        const iconErr = `<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

                        statusEl.innerHTML = `${iconLoad} <span>Выдаём...</span>`;
                        statusEl.style.color = '#fff';

                        try {
                            // Запрос идёт через API, сервер проверяет что ты РЕАЛЬНО админ
                            const result = await api('/api/admin/grant', {
                                method: 'POST',
                                body: JSON.stringify({ telegramId: idStr, plan, days }),
                            });
                            statusEl.innerHTML = `${iconOk} <span>Успешно: ${result.plan} (${result.days} дн.) → ${result.telegramId}</span>`;
                            statusEl.style.color = 'var(--green)';
                        } catch (e) {
                            statusEl.innerHTML = `${iconErr} <span>${e.message || 'Ошибка'}</span>`;
                            statusEl.style.color = 'var(--red)';
                        }
                    });
                }
            })
            .catch(err => {
                const profSub = document.getElementById('tg-prof-sub');
                if (profSub) {
                    profSub.classList.remove('loading');
                    profSub.textContent = 'Не удалось загрузить';
                }
            });
    }

    // ═══════════════════════════════════════════════════════════
    //  SCROLL REVEAL
    // ═══════════════════════════════════════════════════════════
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

    // Tab switching
    document.querySelectorAll('.app-nav').forEach(nav => {
        nav.addEventListener('click', () => {
            document.querySelectorAll('.app-nav').forEach(n => n.classList.remove('active'));
            nav.classList.add('active');
            document.querySelectorAll('.app-tab').forEach(t => t.style.display = 'none');
            const tab = document.getElementById('tab-' + nav.dataset.tab);
            if (tab) tab.style.display = 'block';
        });
    });

    // Toggle switches
    document.querySelectorAll('.app-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => toggle.classList.toggle('on'));
    });

    // Demo Bot Simulation
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
        btn.addEventListener('click', () => running ? stopDemo() : startDemo());
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

            if (seconds === 3) addLog('Прогрев завершён', 'success');

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
                setTimeout(() => addLog(`Комментарий в ${sub} (+${k} karma)`, 'success'), 800);
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

    // ─── Links ───
    const openLink = url => {
        if (tg && tg.initData) {
            tg.openTelegramLink(url);
        } else {
            window.open(url, '_blank');
        }
    };

    // ─── Plans ───
    document.querySelectorAll('[data-plan]').forEach(btn => {
        btn.addEventListener('click', () => {
            const plan = btn.dataset.plan;
            const names = { starter: 'Starter (7 дней)', pro: 'Pro (30 дней)', unlimited: 'Unlimited (навсегда)' };
            const text = encodeURIComponent(`Привет! Хочу оформить подписку на тариф ${names[plan]}.`);
            openLink(`https://t.me/o4kazavr?text=${text}`);
        });
    });

    // ─── FAQ Accordion ───
    document.querySelectorAll('.faq-q').forEach(q => {
        q.addEventListener('click', () => {
            const item = q.parentElement;
            const isOpen = item.classList.contains('open');
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
            if (!isOpen) item.classList.add('open');
        });
    });

    // ─── Footer Links ───
    document.getElementById('link-support')?.addEventListener('click', e => { e.preventDefault(); openLink('https://t.me/yanaidyteba'); });
    document.getElementById('link-channel')?.addEventListener('click', e => { e.preventDefault(); openLink('https://t.me/yanaidyteba'); });
})();
