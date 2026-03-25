// ═══════════════════════════════════════════════════════════════
//  Reddit Karma Bot — Telegram Bot (Продажи + Авторизация)
// ═══════════════════════════════════════════════════════════════

const { Telegraf, Markup } = require('telegraf');

// ─── CONFIG ───
const BOT_TOKEN = '8568338479:AAHKwVR2yrP6CthvwFwUs4ks2w8hTXJ0kc8';
const ADMIN_ID = 0;                   // ← Твой Telegram ID (число)

const SUPABASE_URL = 'https://xabcwmhmbxhcopoynbyw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhYmN3bWhtYnhoY29wb3luYnl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODcxOTUsImV4cCI6MjA4OTk2MzE5NX0.m9xCYtWBlObqLVADUhbNlw-DHnUGHc76vsjRmP6Xgr4';

const bot = new Telegraf(BOT_TOKEN);

// ═══ Supabase helper ═══
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
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return res.json();
}

// ═══════════════════════════════════════════════════════════════
//  /start — Приветствие или авторизация
// ═══════════════════════════════════════════════════════════════
bot.start(async (ctx) => {
    const payload = ctx.startPayload; // Код из десктопа

    // Если пришёл код авторизации
    if (payload && /^\d{6}$/.test(payload)) {
        return handleAuthCode(ctx, payload);
    }

    // Обычный /start
    const name = ctx.from.first_name || 'друг';
    await ctx.reply(
        `Привет, ${name}! 👋\n\n` +
        `Я бот для управления Reddit Karma Bot.\n\n` +
        `📋 Доступные команды:\n` +
        `/buy — Купить подписку\n` +
        `/status — Статус подписки\n` +
        `/help — Помощь\n\n` +
        `Для авторизации в десктоп-приложении нажмите «Войти» в программе.`,
        Markup.keyboard([
            ['🛒 Купить подписку'],
            ['📊 Статус подписки', '❓ Помощь']
        ]).resize()
    );
});

// ═══════════════════════════════════════════════════════════════
//  Обработка кода авторизации из десктопа
// ═══════════════════════════════════════════════════════════════
async function handleAuthCode(ctx, code) {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || '';
    const firstName = ctx.from.first_name || '';

    try {
        // Ищем код в БД
        const rows = await supabase(`auth_codes?code=eq.${code}&select=*`);
        if (!rows || rows.length === 0) {
            return ctx.reply('❌ Код не найден или истёк. Попробуйте заново.');
        }

        const authCode = rows[0];
        if (authCode.confirmed) {
            return ctx.reply('⚠️ Этот код уже использован.');
        }

        // Проверяем подписку
        const subs = await supabase(`subscriptions?telegram_id=eq.${telegramId}&select=*`);
        const hasSub = subs && subs.length > 0 && subs[0].active &&
            (!subs[0].expires_at || new Date(subs[0].expires_at) > new Date());

        if (!hasSub) {
            // Подтверждаем код но без подписки
            await supabase(`auth_codes?code=eq.${code}`, {
                method: 'PATCH',
                body: JSON.stringify({ telegram_id: telegramId, confirmed: true })
            });
            return ctx.reply(
                '✅ Аккаунт найден, но подписка не активна.\n\n' +
                'Используйте /buy чтобы приобрести подписку.'
            );
        }

        // Подтверждаем код
        await supabase(`auth_codes?code=eq.${code}`, {
            method: 'PATCH',
            body: JSON.stringify({ telegram_id: telegramId, confirmed: true })
        });

        await ctx.reply(
            '✅ Авторизация подтверждена!\n\n' +
            `📋 Ваша подписка: ${subs[0].plan}\n` +
            `⏰ Действует до: ${subs[0].expires_at ? new Date(subs[0].expires_at).toLocaleDateString('ru') : 'Бессрочно'}\n\n` +
            'Вернитесь в приложение — оно автоматически загрузится.'
        );
    } catch (err) {
        console.error('Auth error:', err);
        ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
}

// ═══════════════════════════════════════════════════════════════
//  /buy — Покупка подписки
// ═══════════════════════════════════════════════════════════════
bot.command('buy', async (ctx) => showPricing(ctx));
bot.hears('🛒 Купить подписку', async (ctx) => showPricing(ctx));

async function showPricing(ctx) {
    await ctx.reply(
        '🛒 *Тарифы Reddit Karma Bot*\n\n' +
        '┌ *Starter* — 7 дней\n' +
        '│ До 3 аккаунтов\n' +
        '│ ИИ-комментарии + прогрев\n' +
        '└ Цена: *$15*\n\n' +
        '┌ *Pro* — 30 дней ⭐\n' +
        '│ До 10 аккаунтов\n' +
        '│ ИИ-комментарии + прогрев\n' +
        '│ Приоритетная поддержка\n' +
        '└ Цена: *$39*\n\n' +
        '┌ *Unlimited* — Навсегда\n' +
        '│ Без лимита аккаунтов\n' +
        '│ Все обновления бесплатно\n' +
        '└ Цена: *$99*',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('Starter — $15', 'buy_starter')],
                [Markup.button.callback('⭐ Pro — $39', 'buy_pro')],
                [Markup.button.callback('Unlimited — $99', 'buy_unlimited')]
            ])
        }
    );
}

// ─── Обработка выбора тарифа ───
bot.action(/^buy_(.+)$/, async (ctx) => {
    const plan = ctx.match[1];
    const prices = { starter: 15, pro: 39, unlimited: 99 };
    const names = { starter: 'Starter (7 дней)', pro: 'Pro (30 дней)', unlimited: 'Unlimited (навсегда)' };

    await ctx.answerCbQuery();
    await ctx.reply(
        `Вы выбрали: *${names[plan]}* — $${prices[plan]}\n\n` +
        `Для оплаты свяжитесь с администратором:\n` +
        `@yanaidyteba\n\n` +
        `Укажите ваш ID: \`${ctx.from.id}\``,
        { parse_mode: 'Markdown' }
    );

    // Уведомляем админа
    if (ADMIN_ID) {
        bot.telegram.sendMessage(ADMIN_ID,
            `🔔 Новый заказ!\n\n` +
            `Пользователь: ${ctx.from.first_name} (@${ctx.from.username || 'нет'})\n` +
            `ID: ${ctx.from.id}\n` +
            `Тариф: ${names[plan]} — $${prices[plan]}`
        ).catch(() => {});
    }
});

// ═══════════════════════════════════════════════════════════════
//  /status — Статус подписки
// ═══════════════════════════════════════════════════════════════
bot.command('status', async (ctx) => showStatus(ctx));
bot.hears('📊 Статус подписки', async (ctx) => showStatus(ctx));

async function showStatus(ctx) {
    try {
        const rows = await supabase(`subscriptions?telegram_id=eq.${ctx.from.id}&select=*`);
        if (!rows || rows.length === 0) {
            return ctx.reply('У вас нет активной подписки.\nИспользуйте /buy для покупки.');
        }

        const sub = rows[0];
        const isActive = sub.active && (!sub.expires_at || new Date(sub.expires_at) > new Date());
        const emoji = isActive ? '✅' : '❌';
        const status = isActive ? 'Активна' : 'Неактивна';

        await ctx.reply(
            `${emoji} *Статус подписки: ${status}*\n\n` +
            `📋 Тариф: ${sub.plan}\n` +
            `📅 Создана: ${new Date(sub.created_at).toLocaleDateString('ru')}\n` +
            `⏰ Истекает: ${sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('ru') : 'Бессрочно'}\n` +
            `🆔 Telegram ID: \`${ctx.from.id}\``,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        ctx.reply('Ошибка при получении данных. Попробуйте позже.');
    }
}

// ═══════════════════════════════════════════════════════════════
//  /help — Помощь
// ═══════════════════════════════════════════════════════════════
bot.command('help', (ctx) => showHelp(ctx));
bot.hears('❓ Помощь', (ctx) => showHelp(ctx));

function showHelp(ctx) {
    ctx.reply(
        '❓ *Помощь*\n\n' +
        '*Как начать:*\n' +
        '1. Купите подписку — /buy\n' +
        '2. Скачайте бот с нашего канала\n' +
        '3. Нажмите «Войти через Telegram» в приложении\n' +
        '4. Отправьте код сюда\n\n' +
        '*Команды:*\n' +
        '/buy — Купить подписку\n' +
        '/status — Статус подписки\n' +
        '/help — Эта справка\n\n' +
        'Поддержка: @yanaidyteba',
        { parse_mode: 'Markdown' }
    );
}

// ═══════════════════════════════════════════════════════════════
//  АДМИН-КОМАНДЫ (только для ADMIN_ID)
// ═══════════════════════════════════════════════════════════════

// /grant <telegram_id> <plan> <days> — Выдать подписку
bot.command('grant', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
        return ctx.reply('Формат: /grant <telegram_id> <plan> [days]\nПример: /grant 123456789 pro 30');
    }

    const [tgId, plan, days] = args;
    const expiresAt = days ? new Date(Date.now() + parseInt(days) * 86400000).toISOString() : null;

    try {
        // Upsert: вставить или обновить
        await supabase('subscriptions', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify({
                telegram_id: parseInt(tgId),
                plan,
                active: true,
                expires_at: expiresAt
            })
        });

        ctx.reply(`✅ Подписка выдана!\nID: ${tgId}\nПлан: ${plan}\nДней: ${days || '∞'}`);

        // Уведомляем пользователя
        bot.telegram.sendMessage(parseInt(tgId),
            `🎉 Ваша подписка *${plan}* активирована!\n` +
            `Действует: ${days ? days + ' дней' : 'Бессрочно'}\n\n` +
            `Теперь вы можете авторизоваться в приложении.`,
            { parse_mode: 'Markdown' }
        ).catch(() => {});
    } catch (err) {
        ctx.reply('❌ Ошибка: ' + err.message);
    }
});

// /revoke <telegram_id> — Отозвать подписку
bot.command('revoke', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const tgId = ctx.message.text.split(' ')[1];
    if (!tgId) return ctx.reply('Формат: /revoke <telegram_id>');

    try {
        await supabase(`subscriptions?telegram_id=eq.${tgId}`, {
            method: 'PATCH',
            body: JSON.stringify({ active: false })
        });
        ctx.reply(`✅ Подписка отозвана для ID: ${tgId}`);
    } catch (err) {
        ctx.reply('❌ Ошибка: ' + err.message);
    }
});

// /broadcast <text> — Рассылка всем подписчикам
bot.command('broadcast', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    const text = ctx.message.text.substring('/broadcast '.length);
    if (!text) return ctx.reply('Формат: /broadcast <текст>');

    try {
        const subs = await supabase('subscriptions?active=eq.true&select=telegram_id');
        let sent = 0;
        for (const sub of subs) {
            try {
                await bot.telegram.sendMessage(sub.telegram_id, text, { parse_mode: 'Markdown' });
                sent++;
                await new Promise(r => setTimeout(r, 50)); // Rate limit
            } catch {}
        }
        ctx.reply(`✅ Рассылка отправлена: ${sent}/${subs.length}`);
    } catch (err) {
        ctx.reply('❌ Ошибка: ' + err.message);
    }
});

// /stats — Статистика (админ)
bot.command('stats', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;

    try {
        const all = await supabase('subscriptions?select=*');
        const active = all.filter(s => s.active && (!s.expires_at || new Date(s.expires_at) > new Date()));

        const plans = {};
        active.forEach(s => { plans[s.plan] = (plans[s.plan] || 0) + 1; });

        let planStr = Object.entries(plans).map(([k, v]) => `  ${k}: ${v}`).join('\n') || '  нет';

        ctx.reply(
            `📊 *Статистика*\n\n` +
            `Всего пользователей: ${all.length}\n` +
            `Активных подписок: ${active.length}\n\n` +
            `По тарифам:\n${planStr}`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        ctx.reply('❌ Ошибка: ' + err.message);
    }
});

// ═══ Запуск ═══
bot.launch().then(() => {
    console.log('🤖 Reddit Karma Bot Shop запущен!');
    console.log(`Admin ID: ${ADMIN_ID}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
