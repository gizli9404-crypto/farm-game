const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Telegraf } = require('telegraf');

const app = express();
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- TELEGRAM BOT AYARI ---
const BOT_TOKEN = process.env.BOT_TOKEN || '8854910303:AAFre2j9IO6RKvJ8BJRoG4dZ4quD40d3LFM';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://miner-production-32ee.up.railway.app';

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    const telegramId = ctx.from.id.toString();
    const username = ctx.from.username || 'İsimsiz_' + telegramId.slice(-4);
    const firstName = ctx.from.first_name || '';

    db.run(
        `INSERT INTO users (telegram_id, username, balance, tickets) 
         VALUES (?, ?, 0, 0) 
         ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username`,
        [telegramId, username]
    );

    ctx.reply(`👋 Merhaba **${firstName}**, Sanal Miner Pro'ya hoş geldin!\n\nMadencilik yapmak, çark çevirmek ve kazanç sağlamak için aşağıdaki butona tıkla:`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 Madenciliği Aç (Mini App)", web_app: { url: MINI_APP_URL } }],
                [{ text: "📢 Duyuru Kanalı", url: "https://t.me/" }]
            ]
        }
    });
});

bot.launch().then(() => {
    console.log("🤖 Telegram Bot başarıyla başlatıldı!");
}).catch(err => {
    console.error("Bot başlatılamadı:", err);
});

// --- VERİTABANI OLUŞTURMA ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id TEXT PRIMARY KEY,
        username TEXT,
        balance REAL DEFAULT 0,
        tickets INTEGER DEFAULT 0,
        wallet TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS withdraws (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT,
        username TEXT,
        amount REAL,
        wallet TEXT,
        network TEXT,
        status TEXT DEFAULT 'pending'
    )`);
});

// --- MİNİ APP API ROTALARI ---

app.get('/api/leaderboard', (req, res) => {
    db.all("SELECT telegram_id, username, balance FROM users ORDER BY balance DESC LIMIT 10", (err, rows) => {
        if (err) res.status(500).json({ success: false, error: err.message });
        else res.json(rows || []);
    });
});

app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            res.json(row);
        } else {
            db.run(
                `INSERT INTO users (telegram_id, username, balance, tickets) VALUES (?, ?, 0, 0)`,
                [userId, "Kullanıcı_" + userId.slice(-4)],
                function(insErr) {
                    if (insErr) return res.status(500).json({ error: insErr.message });
                    db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (err2, newRow) => {
                        res.json(newRow || { telegram_id: userId, balance: 0, tickets: 0 });
                    });
                }
            );
        }
    });
});

app.post('/api/user/update', (req, res) => {
    const { telegram_id, username, balance, tickets, wallet } = req.body;
    if (!telegram_id) return res.status(400).json({ success: false, error: "Telegram ID eksik" });

    db.run(
        `INSERT INTO users (telegram_id, username, balance, tickets, wallet) 
         VALUES (?, ?, ?, ?, ?) 
         ON CONFLICT(telegram_id) 
         DO UPDATE SET username = excluded.username, balance = excluded.balance, tickets = excluded.tickets, wallet = excluded.wallet`,
        [telegram_id, username || "İsimsiz", balance || 0, tickets || 0, wallet || ""],
        function(err) {
            if (err) res.status(500).json({ success: false, error: err.message });
            else res.json({ success: true });
        }
    );
});

// --- ADMIN PANELİ API ROTALARI ---

app.get('/api/admin/stats', (req, res) => {
    db.get(`SELECT COUNT(*) as totalUsers, SUM(balance) as totalBalance FROM users`, (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        db.get(`SELECT COUNT(*) as pendingWithdraws FROM withdraws WHERE status = 'pending'`, (err2, row2) => {
            db.all(`SELECT * FROM withdraws WHERE status = 'pending'`, (err3, withdrawsRows) => {
                res.json({
                    success: true,
                    totalUsers: row?.totalUsers || 0,
                    totalBalance: row?.totalBalance || 0,
                    pendingWithdraws: row2?.pendingWithdraws || 0,
                    withdraws: withdrawsRows || []
                });
            });
        });
    });
});

app.get('/api/admin/users', (req, res) => {
    db.all(`SELECT * FROM users ORDER BY balance DESC`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, users: rows || [] });
    });
});

app.post('/api/admin/modify', (req, res) => {
    const { telegram_id, amount, type } = req.body;
    const column = type === 'tickets' ? 'tickets' : 'balance';
    
    db.run(`UPDATE users SET ${column} = ${column} + ? WHERE telegram_id = ?`, [amount, telegram_id], function(err) {
        if (err) res.status(500).json({ success: false, error: err.message });
        else res.json({ success: true });
    });
});

app.post('/api/admin/broadcast', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, error: "Mesaj boş olamaz" });

    db.all(`SELECT telegram_id FROM users`, async (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        let successCount = 0;
        for (const user of rows) {
            try {
                await bot.telegram.sendMessage(user.telegram_id, `📢 **Sistem Duyurusu:**\n\n${message}`, { parse_mode: 'Markdown' });
                successCount++;
            } catch (e) {}
        }
        res.json({ success: true, sentCount: successCount });
    });
});

app.post('/api/admin/withdraw/approve', (req, res) => {
    const { id } = req.body;
    db.run(`UPDATE withdraws SET status = 'approved' WHERE id = ?`, [id], function(err) {
        if (err) res.status(500).json({ success: false, error: err.message });
        else res.json({ success: true });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda aktif.`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
