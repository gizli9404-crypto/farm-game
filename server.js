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
    const username = ctx.from.username || 'Kullanici_' + telegramId.slice(-4);
    const firstName = ctx.from.first_name || '';

    db.run(
        `INSERT INTO users (telegram_id, username, balance) VALUES (?, ?, 5) 
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

// Otomatik Kanal Motivasyon ve Ödeme Listesi Gönderici
setInterval(() => {
    db.all("SELECT username, amount, currency FROM withdrawals WHERE status='Ödendi' ORDER BY id DESC LIMIT 3", (err, rows) => {
        if (err) { logSystemError(err); return; }
        let payoutText = rows && rows.length > 0 
            ? rows.map(r => `• Kullanıcı: ${r.username} ➔ ${r.amount} ${r.currency} (Ödendi)`).join('\n')
            : `• Henüz yeni ödeme yapılmadı, ilk çeken sen ol!`;

        const motivationalMessages = [
            `🔥 GÜNÜN ÖDEME LİSTESİ & FIRSAT RAPORU!\n\n${payoutText}\n\n💡 Dostlar, vakit kaybetmeyin! Reklam izleyerek ve görevleri tamamlayarak bakiyenizi katlayın, anında Binance cüzdanınıza çekin!\n\n🚀 Hemen Kazanmaya Başla: ${MINI_APP_URL}`,
            `💎 HIZLI KAZANÇ ZAMANI!\n\nSon ödemeler kullanıcılarımızın cüzdanlarına ulaştı:\n${payoutText}\n\n⭐ Siz de yerinizi alın, arkadaşlarınızı davet edin ve pasif gelirinizi artırın!\n\n👉 Uygulamaya Git: ${MINI_APP_URL}`
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
            db.run(`INSERT INTO users (telegram_id, username, balance) VALUES (?, ?, 5)`, [userId, "User_" + userId.slice(-4)], () => {
                db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (_, newRow) => res.json(newRow));
            });
        }
    });
});

// Liderlik Tablosu: Sahte Kullanıcılar ile Gerçek Kullanıcıları Birleştirip Puana Göre Sıralama
app.get('/api/leaderboard', (req, res) => {
    db.all("SELECT username, balance FROM users", (err, realUsers) => {
        let fakeUsers = [
            { username: "CryptoKing_99", balance: 1420 },
            { username: "Satoshi_TR", balance: 1250 },
            { username: "BinanceWhale", balance: 980 },
            { username: "MineMaster", balance: 850 },
            { username: "Ali_Can_Coin", balance: 620 },
            { username: "ZenginEsnaf", balance: 510 },
            { username: "KriptoKurdu", balance: 430 },
            { username: "BlockchainPro", balance: 310 },
            { username: "MehmetDag", balance: 215 },
            { username: "TokenAvcisi", balance: 150 }
        ];

        let combined = [...fakeUsers];
        if (realUsers) {
            realUsers.forEach(ru => {
                let existingIndex = combined.findIndex(f => f.username === ru.username);
                if (existingIndex >= 0) {
                    combined[existingIndex].balance = ru.balance; // Güncel gerçek bakiye
                } else {
                    combined.push({ username: ru.username, balance: ru.balance });
                }
            });
        }

        // Büyükten küçüğe sırala (Gerçek kullanıcıların puanı yüksekse otomatik üste çıkar)
        combined.sort((a, b) => b.balance - a.balance);
        res.json(combined.slice(0, 10));
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

app.get('/api/admin/data', (req, res) => {
    db.get("SELECT COUNT(*) as totalUsers, SUM(balance) as totalBalance FROM users", (err, stats) => {
        db.all("SELECT * FROM withdrawals WHERE status='Bekliyor' ORDER BY id DESC", (err2, pending) => {
            db.all("SELECT * FROM users ORDER BY balance DESC", (err3, users) => {
                db.all("SELECT * FROM system_logs ORDER BY id DESC LIMIT 10", (err4, logs) => {
                    res.json({ success: true, ...stats, pending, users, logs: logs || [] });
                });
            });
        });
    });
});

app.post('/api/admin/approve-withdrawal', async (req, res) => {
    const { id } = req.body;
    db.get("SELECT * FROM withdrawals WHERE id = ?", [id], async (err, w) => {
        if (!w) return res.status(404).json({ success: false, error: "Talep bulunamadı." });

        db.run("UPDATE withdrawals SET status = 'Ödendi' WHERE id = ?", [id], async () => {
            try {
                await bot.telegram.sendMessage(CHANNEL_ID, 
                    `🎉 Yeni Ödeme Başarıyla Yapıldı!\n\n` +
                    `👤 Kullanıcı: ${w.username}\n` +
                    `💎 Miktar: ${w.amount} ${w.currency}\n` +
                    `🌐 Ağ/Cüzdan: ${w.wallet}\n` +
                    `✅ Durum: Binance Üzerinden Gönderildi!\n\n` +
                    `🚀 Sen de kazanmak için: @sanal_miner_test_bot`
                );
            } catch(e) { logSystemError(e); }
            res.json({ success: true });
        });
    });
});

app.post('/api/admin/broadcast', async (req, res) => {
    const { message, type } = req.body; 
    let title = type === 'hata' ? "⚠️ SİSTEM HATA / BAKIM BİLDİRİMİ" : "📢 GÜNÜN KAZANÇ VE MOTİVASYON DUYURUSU";
    try {
        db.all("SELECT telegram_id FROM users", async (err, rows) => {
            if(rows) {
                for (const u of rows) {
                    try { await bot.telegram.sendMessage(u.telegram_id, `${title}\n\n${message}`); } catch(e){}
                }
            }
        });
        await bot.telegram.sendMessage(CHANNEL_ID, `${title}\n\n${message}\n\n🚀 Katıl: @sanal_miner_test_bot`);
        res.json({ success: true });
    } catch(e) {
        logSystemError(e);
        res.status(500).json({ success: false, error: "Gönderilemedi" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server aktif: ${PORT}`));
