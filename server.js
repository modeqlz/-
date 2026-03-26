// ═══════════════════════════════════════════════════════════════
//  Reddit Karma Bot — API Server для Mini App
//  Вся логика на сервере, клиент НЕ имеет доступа к БД
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

// ─── CONFIG (из .env) ───
const BOT_TOKEN      = process.env.BOT_TOKEN;
const ADMIN_ID       = parseInt(process.env.ADMIN_ID || '0');
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const PORT           = parseInt(process.env.PORT || '3000');

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Отсутствуют переменные окружения! Проверьте .env');
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════════
//  Rate Limiter (в памяти)
// ═══════════════════════════════════════════════════════════════
const rateLimits = new Map(); // key -> { count, resetAt }

function rateLimit(key, maxAttempts, windowMs) {
    const now = Date.now();
    const entry = rateLimits.get(key);

    if (!entry || now > entry.resetAt) {
        rateLimits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }

    if (entry.count >= maxAttempts) {
        return false;
    }

    entry.count++;
    return true;
}

// Очистка старых записей каждые 5 минут
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimits) {
        if (now > entry.resetAt) rateLimits.delete(key);
    }
}, 300_000);

// ═══════════════════════════════════════════════════════════════
//  Telegram initData Validation (HMAC-SHA256)
// ═══════════════════════════════════════════════════════════════
function validateInitData(initData) {
    if (!initData) return null;

    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return null;

        params.delete('hash');

        // Сортируем по алфавиту, объединяем через \n
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');

        // HMAC: secret = HMAC_SHA256("WebAppData", BOT_TOKEN)
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();

        const checkHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        if (checkHash !== hash) return null;

        // Проверяем актуальность (не старше 1 часа)
        const authDate = parseInt(params.get('auth_date') || '0');
        if (Math.floor(Date.now() / 1000) - authDate > 3600) return null;

        const userStr = params.get('user');
        return userStr ? JSON.parse(userStr) : null;
    } catch (err) {
        console.error('initData validation error:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
//  Supabase Helper (server-side, service_role key)
// ═══════════════════════════════════════════════════════════════
async function supabase(endpoint, options = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
            ...options.headers
        }
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase ${res.status}: ${text}`);
    }
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return res.json();
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
//  Middleware: аутентификация через Telegram initData
// ═══════════════════════════════════════════════════════════════
function requireAuth(req, res, next) {
    const initData = req.headers['x-telegram-init-data'];
    if (!initData) {
        return res.status(401).json({ error: 'Требуется авторизация через Telegram' });
    }

    const user = validateInitData(initData);
    if (!user) {
        return res.status(401).json({ error: 'Невалидные данные Telegram' });
    }

    req.telegramUser = user;
    next();
}

// ═══════════════════════════════════════════════════════════════
//  API ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// ─── GET /api/profile ───
// Возвращает профиль пользователя + подписку + isAdmin
app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        const user = req.telegramUser;
        const userId = parseInt(user.id);

        // Rate limit: 30 запросов в минуту на пользователя
        if (!rateLimit(`profile:${userId}`, 30, 60_000)) {
            return res.status(429).json({ error: 'Слишком много запросов' });
        }

        const rows = await supabase(
            `subscriptions?telegram_id=eq.${userId}&select=*`
        );

        res.json({
            user: {
                id: user.id,
                first_name: user.first_name || '',
                photo_url: user.photo_url || ''
            },
            subscription: rows && rows.length > 0 ? rows[0] : null,
            isAdmin: userId === ADMIN_ID
        });
    } catch (err) {
        console.error('Profile error:', err.message);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ─── POST /api/auth-confirm ───
// Подтверждение кода авторизации из десктопа (Deep Link)
app.post('/api/auth-confirm', requireAuth, async (req, res) => {
    try {
        const user = req.telegramUser;
        const userId = parseInt(user.id);
        const { code } = req.body;

        // Валидация формата кода
        if (!code || !/^\d{6}$/.test(String(code))) {
            return res.status(400).json({ error: 'Невалидный код' });
        }

        // Rate limit: 5 попыток за 10 минут
        if (!rateLimit(`auth:${userId}`, 5, 600_000)) {
            return res.status(429).json({ error: 'Слишком много попыток. Подождите 10 минут.' });
        }

        // Ищем код в БД
        const rows = await supabase(`auth_codes?code=eq.${code}&select=*`);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Код не найден' });
        }

        const authCode = rows[0];

        if (authCode.confirmed) {
            return res.status(409).json({ error: 'Код уже использован' });
        }

        // Проверяем TTL (10 минут)
        if (authCode.created_at) {
            const codeAgeMs = Date.now() - new Date(authCode.created_at).getTime();
            if (codeAgeMs > 600_000) {
                return res.status(410).json({ error: 'Код истёк. Запросите новый в приложении.' });
            }
        }

        // Подтверждаем код
        await supabase(`auth_codes?code=eq.${code}`, {
            method: 'PATCH',
            body: JSON.stringify({
                telegram_id: userId,
                confirmed: true,
                first_name: user.first_name || '',
                username: user.username || '',
                avatar_url: user.photo_url || ''
            })
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Auth confirm error:', err.message);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ─── POST /api/admin/grant ───
// Админ: выдать подписку клиенту
app.post('/api/admin/grant', requireAuth, async (req, res) => {
    const user = req.telegramUser;

    // Серверная проверка админа (не обойти через DevTools!)
    if (parseInt(user.id) !== ADMIN_ID) {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const { telegramId, plan, days } = req.body;

    // Валидация входных данных
    if (!telegramId || !plan) {
        return res.status(400).json({ error: 'Укажите telegramId и plan' });
    }

    const parsedId = parseInt(telegramId);
    if (isNaN(parsedId) || parsedId <= 0) {
        return res.status(400).json({ error: 'Невалидный Telegram ID' });
    }

    const allowedPlans = ['Starter', 'Pro', 'Unlimited'];
    if (!allowedPlans.includes(plan)) {
        return res.status(400).json({ error: 'Невалидный тариф' });
    }

    const parsedDays = Math.min(Math.max(parseInt(days) || 30, 1), 3650);
    const expiresAt = new Date(Date.now() + parsedDays * 86400000).toISOString();

    try {
        const existing = await supabase(
            `subscriptions?telegram_id=eq.${parsedId}&select=*`
        );

        const payload = {
            telegram_id: parsedId,
            active: true,
            plan: plan,
            expires_at: expiresAt
        };

        if (existing && existing.length > 0) {
            await supabase(`subscriptions?telegram_id=eq.${parsedId}`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
        } else {
            await supabase('subscriptions', {
                method: 'POST',
                headers: { 'Prefer': 'return=minimal' },
                body: JSON.stringify(payload)
            });
        }

        console.log(`✅ Admin granted: ${plan} (${parsedDays}d) → ${parsedId}`);
        res.json({ success: true, plan, days: parsedDays, telegramId: parsedId });
    } catch (err) {
        console.error('Admin grant error:', err.message);
        res.status(500).json({ error: 'Ошибка при выдаче подписки' });
    }
});

// ═══════════════════════════════════════════════════════════════
//  Статические файлы (безопасная раздача)
// ═══════════════════════════════════════════════════════════════
// Раздаём ТОЛЬКО конкретные безопасные файлы, не всю папку!
const SAFE_FILES = {
    '/':          { file: 'index.html', type: 'text/html' },
    '/style.css': { file: 'style.css',  type: 'text/css' },
    '/app.js':    { file: 'app.js',     type: 'application/javascript' },
    '/logo.png':  { file: 'logo.png',   type: 'image/png' },
};

for (const [route, { file, type }] of Object.entries(SAFE_FILES)) {
    app.get(route, (req, res) => {
        res.type(type).sendFile(path.join(__dirname, file));
    });
}

// Все остальные пути → 404
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ═══════════════════════════════════════════════════════════════
//  Запуск (ВНИМАНИЕ: Vercel использует module.exports)
// ═══════════════════════════════════════════════════════════════
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🌐 Mini App API сервер запущен на порту ${PORT}`);
        console.log(`   Admin ID: ${ADMIN_ID}`);
        console.log(`   Supabase: ${SUPABASE_URL}`);
    });
}

// Экспорт для Vercel Serverless Functions
module.exports = app;
