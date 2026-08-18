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
const CHANNEL_ID = process.env.CHANNEL_ID || '@sanal_miner_duyuru'; 
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://miner-production-32ee.up.railway.app';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '825653935';

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    const telegramId = ctx.from.id.toString();
    const username = ctx.from.username || 'User_' + telegramId.slice(-4);
    const firstName = ctx.from.first_name || '';

    db.run(
        `INSERT INTO users (telegram_id, username, balance, streak_day) VALUES (?, ?, 5, 1) 
         ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username`,
        [telegramId, username]
    );

    ctx.reply(`✨ Merhaba ${firstName}, Crypto Quest Hub'a hoş geldin!\n\nBinance cüzdanlarınla entegre kazanç sistemimizle hemen kazanmaya başla.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 Uygulamayı Aç", web_app: { url: MINI_APP_URL } }],
                [{ text: "📢 Duyuru & Ödeme Kanalı", url: "https://t.me/sanal_miner_duyuru" }]
            ]
        }
    });
});

bot.launch().then(() => console.log("Bot ve Otonom Zamanlayıcılar Aktif!")).catch(err => logSystemError(err));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id TEXT PRIMARY KEY,
        username TEXT,
        balance REAL DEFAULT 5,
        wallet TEXT,
        streak_day INTEGER DEFAULT 1,
        last_claim_date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT,
        username TEXT,
        amount REAL,
        currency TEXT,
        wallet TEXT,
        status TEXT DEFAULT 'Bekliyor',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        log_type TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

function logSystemError(errMessage) {
    const errorText = typeof errMessage === 'object' ? errMessage.message : errMessage;
    console.error("[SİSTEM HATASI]:", errorText);
    db.run("INSERT INTO system_logs (log_type, message) VALUES ('HATA', ?)", [errorText], () => {
        try { bot.telegram.sendMessage(ADMIN_CHAT_ID, `🚨 KRİTİK SİSTEM HATASI:\n\n${errorText}`); } catch(e) {}
    });
}

setInterval(() => {
    db.all("SELECT username, amount, currency FROM withdrawals WHERE status='Ödendi' ORDER BY id DESC LIMIT 3", (err, rows) => {
        if (err) { logSystemError(err); return; }
        let payoutText = rows && rows.length > 0 
            ? rows.map(r => `• Kullanıcı: ${r.username} ➔ ${r.amount} ${r.currency} (Ödendi)`).join('\n')
            : `• CryptoKing_99 ➔ 50 USDT (Ödendi)\n• Satoshi_TR ➔ 30 USDT (Ödendi)\n• BinanceWhale ➔ 25 USDT (Ödendi)`;

        const motivationalMessages = [
            `🔥 GÜNÜN ÖDEME LİSTESİ & FIRSAT RAPORU!\n\n${payoutText}\n\n💡 Dostlar, vakit kaybetmeyin! Reklam izleyerek ve günlük bonusları toplayarak bakiyenizi katlayın, anında Binance cüzdanınıza çekin!\n\n🚀 Hemen Kazanmaya Başla: ${MINI_APP_URL}`
        ];
        let randomMsg = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
        bot.telegram.sendMessage(CHANNEL_ID, randomMsg).catch(e => logSystemError(e));
    });
}, 6 * 60 * 60 * 1000);

app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (err, row) => {
        if (err) logSystemError(err);
        if (row) res.json(row);
        else {
            db.run(`INSERT INTO users (telegram_id, username, balance, streak_day) VALUES (?, ?, 5, 1)`, [userId, "User_" + userId.slice(-4)], () => {
                db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (_, newRow) => res.json(newRow));
            });
        }
    });
});

app.post('/api/daily/claim', (req, res) => {
    const { telegram_id } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    db.get("SELECT streak_day, last_claim_date FROM users WHERE telegram_id = ?", [telegram_id], (err, user) => {
        if (!user) return res.status(404).json({ success: false, error: "Kullanıcı bulunamadı." });
        if (user.last_claim_date === today) {
            return res.status(400).json({ success: false, error: "Bugünkü bonusunuzu zaten aldınız!" });
        }

        let currentDay = user.streak_day || 1;
        const rewards = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 15 };
        let earnedReward = rewards[currentDay] || 5;
        let nextDay = currentDay >= 7 ? 1 : currentDay + 1;

        db.run("UPDATE users SET balance = balance + ?, streak_day = ?, last_claim_date = ? WHERE telegram_id = ?", 
            [earnedReward, nextDay, today, telegram_id], (err2) => {
            if (err2) { logSystemError(err2); return res.status(500).json({ success: false }); }
            res.json({ success: true, reward: earnedReward, nextDay });
        });
    });
});

// Liderlik ve Kullanıcının Kendi Sıralamasını Hesaplama
app.get('/api/leaderboard/:telegram_id', (req, res) => {
    const tid = req.params.telegram_id;
    db.all("SELECT telegram_id, username, balance FROM users", (err, realUsers) => {
        let fakeUsers = [
            { telegram_id: "f1", username: "CryptoKing_99", balance: 1420 },
            { telegram_id: "f2", username: "Satoshi_TR", balance: 1250 },
            { telegram_id: "f3", username: "BinanceWhale", balance: 980 },
            { telegram_id: "f4", username: "MineMaster", balance: 850 },
            { telegram_id: "f5", username: "Ali_Can_Coin", balance: 620 },
            { telegram_id: "f6", username: "ZenginEsnaf", balance: 510 },
            { telegram_id: "f7", username: "KriptoKurdu", balance: 430 },
            { telegram_id: "f8", username: "BlockchainPro", balance: 310 },
            { telegram_id: "f9", username: "MehmetDag", balance: 215 },
            { telegram_id: "f10", username: "TokenAvcisi", balance: 150 }
        ];

        let combined = [...fakeUsers];
        if (realUsers) {
            realUsers.forEach(ru => {
                let existingIndex = combined.findIndex(f => f.telegram_id === ru.telegram_id);
                if (existingIndex >= 0) {
                    combined[existingIndex].balance = ru.balance;
                    combined[existingIndex].username = ru.username;
                } else {
                    combined.push({ telegram_id: ru.telegram_id, username: ru.username, balance: ru.balance });
                }
            });
        }

        combined.sort((a, b) => b.balance - a.balance);
        
        let userRankIndex = combined.findIndex(u => u.telegram_id === tid);
        let userRankData = userRankIndex >= 0 ? { rank: userRankIndex + 1, ...combined[userRankIndex] } : { rank: combined.length + 1, username: "Sen", balance: 0 };

        res.json({ top10: combined.slice(0, 10), userRank: userRankData });
    });
});

app.get('/api/payouts', (req, res) => {
    db.all("SELECT username, amount, currency, timestamp FROM withdrawals WHERE status='Ödendi' ORDER BY id DESC LIMIT 5", (err, rows) => res.json(rows || []));
});

app.get('/api/my-withdrawals/:telegram_id', (req, res) => {
    const tid = req.params.telegram_id;
    db.all("SELECT amount, currency, status FROM withdrawals WHERE telegram_id = ? ORDER BY id DESC LIMIT 5", [tid], (err, rows) => {
        if (err) { logSystemError(err); return res.status(500).json([]); }
        res.json(rows || []);
    });
});

app.post('/api/reward/claim', (req, res) => {
    const { telegram_id, reward } = req.body;
    db.run("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", [reward, telegram_id], (err) => {
        if(err) logSystemError(err);
        res.json({ success: true });
    });
});

app.post('/api/withdraw', (req, res) => {
    const { telegram_id, amount, currency, wallet } = req.body;
    db.get("SELECT balance, username FROM users WHERE telegram_id = ?", [telegram_id], (err, user) => {
        if (!user || user.balance < amount) return res.status(400).json({ success: false, error: "Yetersiz bakiye!" });

        db.run("UPDATE users SET balance = balance - ? WHERE telegram_id = ?", [amount, telegram_id], () => {
            db.run("INSERT INTO withdrawals (telegram_id, username, amount, currency, wallet) VALUES (?, ?, ?, ?, ?)",
                [telegram_id, user.username, amount, currency, wallet], () => {
                res.json({ success: true, message: "Çekim talebiniz alındı! Binance üzerinden ödülünüz gönderilecektir." });
            });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server aktif: ${PORT}`));
