const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Telegraf } = require('telegraf');

const app = express();
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.BOT_TOKEN || '8854910303:AAFre2j9IO6RKvJ8BJRoG4dZ4quD40d3LFM';
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://miner-production-32ee.up.railway.app';

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    const telegramId = ctx.from.id.toString();
    const username = ctx.from.username || 'Kullanici_' + telegramId.slice(-4);
    const firstName = ctx.from.first_name || '';

    db.run(
        `INSERT INTO users (telegram_id, username, balance, energy) 
         VALUES (?, ?, 100, 1000) 
         ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username`,
        [telegramId, username]
    );

    ctx.reply(`✨ Merhaba **${firstName}**, Crypto Quest Hub'a hoş geldin!\n\nGörevleri tamamlayarak, günlük bonusları toplayarak ve topluluk liderlik tablosunda yerini alarak kazanmaya başla.`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 Uygulamayı Aç (Hub)", web_app: { url: MINI_APP_URL } }],
                [{ text: "📢 Ödeme Kanıtları & Duyuru", url: "https://t.me/" }]
            ]
        }
    });
});

bot.launch().then(() => console.log("Bot aktif!")).catch(err => console.log(err));

// Veritabanı Tabloları
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id TEXT PRIMARY KEY,
        username TEXT,
        balance REAL DEFAULT 100,
        energy INTEGER DEFAULT 1000,
        wallet TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        amount REAL,
        status TEXT DEFAULT 'Ödendi',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

function addLog(action, details) {
    db.run(`INSERT INTO logs (action, details) VALUES (?, ?)`, [action, details]);
}

// API Rotaları
app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) res.json(row);
        else {
            db.run(`INSERT INTO users (telegram_id, username, balance, energy) VALUES (?, ?, 100, 1000)`, [userId, "User_" + userId.slice(-4)], () => {
                db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (_, newRow) => res.json(newRow));
            });
        }
    });
});

app.get('/api/leaderboard', (req, res) => {
    db.all("SELECT username, balance FROM users ORDER BY balance DESC LIMIT 10", (err, rows) => {
        res.json(rows || []);
    });
});

app.get('/api/payouts', (req, res) => {
    db.all("SELECT username, amount, timestamp FROM payouts ORDER BY id DESC LIMIT 5", (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/reward/claim', (req, res) => {
    const { telegram_id, reward } = req.body;
    db.run("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", [reward, telegram_id], (err) => {
        if (err) return res.status(500).json({ success: false });
        addLog("Ödül Alındı", `ID: ${telegram_id} | Tutar: ${reward}`);
        res.json({ success: true });
    });
});

app.post('/api/withdraw', (req, res) => {
    const { telegram_id, amount, wallet } = req.body;
    db.get("SELECT balance, username FROM users WHERE telegram_id = ?", [telegram_id], (err, user) => {
        if (!user || user.balance < amount) return res.status(400).json({ success: false, error: "Yetersiz bakiye!" });

        db.run("UPDATE users SET balance = balance - ? WHERE telegram_id = ?", [amount, telegram_id], () => {
            db.run("INSERT INTO payouts (username, amount) VALUES (?, ?)", [user.username, amount]);
            addLog("Çekim Yapıldı", `Kullanıcı: ${user.username} | Tutar: ${amount}`);
            res.json({ success: true, message: "Çekim başarıyla işlendi ve ödeme kanıtlarına eklendi!" });
        });
    });
});

// Admin Rotaları
app.get('/api/admin/stats', (req, res) => {
    db.get("SELECT COUNT(*) as totalUsers, SUM(balance) as totalBalance FROM users", (err, stats) => {
        db.all("SELECT * FROM payouts ORDER BY id DESC LIMIT 10", (err2, payouts) => {
            res.json({ success: true, ...stats, payouts });
        });
    });
});

app.post('/api/admin/broadcast', async (req, res) => {
    const { message } = req.body;
    db.all("SELECT telegram_id FROM users", async (err, rows) => {
        for (const u of rows) {
            try { await bot.telegram.sendMessage(u.telegram_id, `📢 **Duyuru:**\n\n${message}`, { parse_mode: 'Markdown' }); } catch(e){}
        }
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server çalışıyor: ${PORT}`));
