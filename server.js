const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { Telegraf } = require('telegraf');
const path = require('path');

const TOKEN = "8854910303:AAFre2j9IO6RKvJ8BJRoG4dZ4quD40d3LFM";
const CHANNEL_ID = "@sanal_miner_duyuru";

const bot = new Telegraf(TOKEN);
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = path.join(__dirname, 'miner.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('Veritabanı bağlantı hatası:', err.message);
    else console.log('SQLite veritabanına bağlanıldı.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        full_name TEXT,
        balance REAL DEFAULT 0.0,
        tickets INTEGER DEFAULT 0,
        wallet TEXT DEFAULT ''
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        amount REAL,
        wallet TEXT,
        status TEXT DEFAULT 'Beklemede'
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        username TEXT,
        action TEXT,
        details TEXT,
        timestamp TEXT
    )`);
});

// Telegram Bot Komutları
bot.start((ctx) => {
    const user = ctx.from;
    const userId = user.id;
    const username = user.username || "Bulunmuyor";
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();

    db.get('SELECT user_id FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (!row) {
            db.run('INSERT INTO users (user_id, username, full_name, balance, tickets, wallet) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, username, fullName, 0.0, 0, ""]);
        } else {
            db.run('UPDATE users SET username = ?, full_name = ? WHERE user_id = ?', [username, fullName, userId]);
        }
    });

    ctx.reply(`Selam ${fullName}! Sanal Miner Pro'ya hoş geldin.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 Sanal Miner App Aç", web_app: { url: "https://miner-production-32ee.up.railway.app" } }]
            ]
        }
    });
});

bot.launch().catch(err => console.log("Bot başlatılamadı:", err));

// API Endpoints
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/user/:id', (req, res) => {
    db.get('SELECT balance, tickets, wallet FROM users WHERE user_id = ?', [req.params.id], (err, row) => {
        if (row) res.json(row);
        else res.json({ balance: 0.0, tickets: 0, wallet: "" });
    });
});

app.post('/api/user/update', (req, res) => {
    const { telegram_id, balance, tickets, wallet, username } = req.body;
    if (!telegram_id) return res.status(400).json({ status: "error" });

    db.get('SELECT user_id FROM users WHERE user_id = ?', [telegram_id], (err, row) => {
        if (!row) {
            db.run('INSERT INTO users (user_id, username, full_name, balance, tickets, wallet) VALUES (?, ?, ?, ?, ?, ?)',
                [telegram_id, username || 'MiniAppUser', username || 'MiniAppUser', balance || 0, tickets || 0, wallet || ""]);
        } else {
            db.run('UPDATE users SET balance = COALESCE(?, balance), tickets = COALESCE(?, tickets), wallet = COALESCE(?, wallet) WHERE user_id = ?',
                [balance, tickets, wallet, telegram_id]);
        }
        res.json({ status: "success" });
    });
});

app.post('/api/user/log', (req, res) => {
    const { telegram_id, username, action, details, timestamp } = req.body;
    db.run('INSERT INTO logs (user_id, username, action, details, timestamp) VALUES (?, ?, ?, ?, ?)',
        [telegram_id, username, action, details, timestamp]);
    
    if (action && (action.includes("SPIN") || action.includes("ÇARK"))) {
        const msg = `🎉 **Şanslı Çark Ödülü!**\n👤 @${username}\n✨ ${details}`;
        bot.telegram.sendMessage(CHANNEL_ID, msg, { parse_mode: "Markdown" }).catch(() => {});
    }
    res.json({ status: "success" });
});

app.get('/api/leaderboard', (req, res) => {
    db.all('SELECT username, full_name, balance FROM users ORDER BY balance DESC LIMIT 15', [], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/withdraw', (req, res) => {
    const { user_id, amount, wallet } = req.body;
    db.get('SELECT username FROM users WHERE user_id = ?', [user_id], (err, row) => {
        const uname = row ? row.username : "Bilinmiyor";
        db.run('INSERT INTO withdrawals (user_id, username, amount, wallet, status) VALUES (?, ?, ?, ?, ?)',
            [user_id, uname, amount, wallet, "Beklemede"]);
        
        bot.telegram.sendMessage(CHANNEL_ID, `🚨 **Yeni Çekim Talebi!**\n👤 @${uname}\n💰 ${amount} PEPE\n💳 ${wallet}`, { parse_mode: "Markdown" }).catch(() => {});
        res.json({ status: "success" });
    });
});

const SECRET_KEY = "SizinGucluSifreniz123";

app.get('/api/admin/users', (req, res) => {
    if (req.query.secret !== SECRET_KEY) return res.status(403).json({ error: "Yetkisiz" });
    db.all('SELECT user_id, username, full_name, balance, tickets, wallet FROM users ORDER BY balance DESC', [], (err, rows) => {
        res.json(rows || []);
    });
});

app.get('/api/admin/withdrawals', (req, res) => {
    if (req.query.secret !== SECRET_KEY) return res.status(403).json({ error: "Yetkisiz" >> 0 });
    db.all('SELECT id, user_id, username, amount, wallet, status FROM withdrawals ORDER BY id DESC', [], (err, rows) => {
        res.json(rows || []);
    });
});

app.get('/api/admin/logs', (req, res) => {
    if (req.query.secret !== SECRET_KEY) return res.status(403).json({ error: "Yetkisiz" });
    db.all('SELECT username, action, details, timestamp FROM logs ORDER BY id DESC LIMIT 50', [], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/admin/update_balance', (req, res) => {
    const { secret, user_id, amount, action } = req.body;
    if (secret !== SECRET_KEY) return res.status(403).json({ error: "Yetkisiz" });

    let query = 'UPDATE users SET balance = ? WHERE user_id = ?';
    if (action === 'add') query = 'UPDATE users SET balance = balance + ? WHERE user_id = ?';
    if (action === 'sub') query = 'UPDATE users SET balance = MAX(0, balance - ?) WHERE user_id = ?';

    db.run(query, [amount, user_id], () => {
        db.get('SELECT balance FROM users WHERE user_id = ?', [user_id], (err, row) => {
            res.json({ success: true, new_balance: row ? row.balance : 0 });
        });
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
