const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Telegraf } = require('telegraf');

const app = express();
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Bot ve Kanal Bilgileri (Kendi Bot Token'ını ve Grup/Kanal ID'ni buraya yazabilirsin)
const BOT_TOKEN = process.env.BOT_TOKEN || '8854910303:AAFre2j9IO6RKvJ8BJRoG4dZ4quD40d3LFM';
const CHANNEL_ID = process.env.CHANNEL_ID || '@sanal_miner_duyuru'; 
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://miner-production-32ee.up.railway.app';

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    const telegramId = ctx.from.id.toString();
    const username = ctx.from.username || 'Kullanici_' + telegramId.slice(-4);
    const firstName = ctx.from.first_name || '';

    db.run(
        `INSERT INTO users (telegram_id, username, balance) VALUES (?, ?, 100) 
         ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username`,
        [telegramId, username]
    );

    ctx.reply(`✨ Merhaba **${firstName}**, Crypto Quest Hub'a hoş geldin!\n\nBinance cüzdanlarınla entegre kazanç sistemimizle hemen kazanmaya başla.`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 Uygulamayı Aç", web_app: { url: MINI_APP_URL } }],
                [{ text: "📢 Duyuru & Ödeme Kanalı", url: "https://t.me/sanal_miner_duyuru" }]
            ]
        }
    });
});

bot.launch().then(() => console.log("Bot ve Otomasyon Aktif!")).catch(err => console.log(err));

// Veritabanı Tabloları
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id TEXT PRIMARY KEY,
        username TEXT,
        balance REAL DEFAULT 100,
        wallet TEXT
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

    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// API Rotaları
app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (err, row) => {
        if (row) res.json(row);
        else {
            db.run(`INSERT INTO users (telegram_id, username, balance) VALUES (?, ?, 100)`, [userId, "User_" + userId.slice(-4)], () => {
                db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (_, newRow) => res.json(newRow));
            });
        }
    });
});

app.get('/api/leaderboard', (req, res) => {
    db.all("SELECT username, balance FROM users ORDER BY balance DESC LIMIT 10", (err, rows) => res.json(rows || []));
});

app.get('/api/payouts', (req, res) => {
    db.all("SELECT username, amount, currency, timestamp FROM withdrawals WHERE status='Ödendi' ORDER BY id DESC LIMIT 5", (err, rows) => res.json(rows || []));
});

app.post('/api/reward/claim', (req, res) => {
    const { telegram_id, reward } = req.body;
    db.run("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", [reward, telegram_id], () => {
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

// --- YENİLENMİŞ TAM OTOMATİK ADMİN PANELİ API'LERİ ---
app.get('/api/admin/data', (req, res) => {
    db.get("SELECT COUNT(*) as totalUsers, SUM(balance) as totalBalance FROM users", (err, stats) => {
        db.all("SELECT * FROM withdrawals WHERE status='Bekliyor' ORDER BY id DESC", (err2, pending) => {
            db.all("SELECT * FROM users ORDER BY balance DESC", (err3, users) => {
                res.json({ success: true, ...stats, pending, users });
            });
        });
    });
});

// Çekimi Onayla ve Kanıtı Otomatik Kanala Gönder (Binance Entegrasyon Mesajı)
app.post('/api/admin/approve-withdrawal', async (req, res) => {
    const { id } = req.body;
    db.get("SELECT * FROM withdrawals WHERE id = ?", [id], async (err, w) => {
        if (!w) return res.status(404).json({ success: false, error: "Talep bulunamadı." });

        db.run("UPDATE withdrawals SET status = 'Ödendi' WHERE id = ?", [id], async () => {
            // Telegram kanalına otomatik şık motivasyon/ödeme mesajı gönderir
            try {
                await bot.telegram.sendMessage(CHANNEL_ID, 
                    `🎉 **Yeni Ödeme Başarıyla Yapıldı!**\n\n` +
                    `👤 Kullanıcı: \`${w.username}\`\n` +
                    `💎 Miktar: **${w.amount} ${w.currency}**\n` +
                    `🌐 Ağ/Cüzdan: \`${w.wallet}\`\n` +
                    `✅ Durum: **Binance Üzerinden Gönderildi!**\n\n` +
                    `🚀 Sen de kazanmak için: @sanal_miner_test_bot`, 
                    { parse_mode: 'Markdown' }
                );
            } catch(e) { console.log("Kanal mesajı gönderilemedi:", e); }

            res.json({ success: true });
        });
    });
});

// Sistemsel Hata / Bakım Duyurusu Otomasyonu
app.post('/api/admin/broadcast', async (req, res) => {
    const { message, type } = req.body; // type: 'duyuru' veya 'hata'
    let title = type === 'hata' ? "⚠️ SİSTEM HATA / BAKIM BİLDİRİMİ" : "📢 SİSTEM DUYURUSU";
    
    try {
        // Tüm kullanıcılara özelden gönder
        db.all("SELECT telegram_id FROM users", async (err, rows) => {
            for (const u of rows) {
                try { await bot.telegram.sendMessage(u.telegram_id, `*${title}*\n\n${message}`, { parse_mode: 'Markdown' }); } catch(e){}
            }
        });
        // Kanala da gönder
        await bot.telegram.sendMessage(CHANNEL_ID, `*${title}*\n\n${message}`, { parse_mode: 'Markdown' });
        
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ success: false, error: "Gönderilemedi" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server aktif: ${PORT}`));
