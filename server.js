const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Telegraf } = require('telegraf');

const app = express();
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Gelişmiş İstek Loglama
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

const BOT_TOKEN = process.env.BOT_TOKEN || '8854910303:AAFre2j9IO6RKvJ8BJRoG4dZ4quD40d3LFM';
const CHANNEL_ID = process.env.CHANNEL_ID || '@sanal_miner_duyuru'; 
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://miner-production-32ee.up.railway.app';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '825653935';

const bot = new Telegraf(BOT_TOKEN);

async function sendTelegramChannelMessage(text, replyMarkup = null) {
    try {
        await bot.telegram.sendMessage(CHANNEL_ID, text, { 
            parse_mode: 'HTML',
            reply_markup: replyMarkup 
        });
    } catch (error) {
        console.error("Kanal mesajı gönderim hatası:", error);
    }
}

bot.start((ctx) => {
    const telegramId = ctx.from.id.toString();
    const username = ctx.from.username || 'User_' + telegramId.slice(-4);
    const firstName = ctx.from.first_name || '';

    db.run(
        `INSERT INTO users (telegram_id, username, balance, streak_day) VALUES (?, ?, 5, 1) 
         ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username`,
        [telegramId, username]
    );

    ctx.reply(`✨ Merhaba ${firstName}, Pixel Craft Quest dünyasına hoş geldin!\n\nGünlük görevleri tamamlayarak, reklamları inceleyerek puanları topla ve ödül mağazasında harca!`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 Oyunu Başlat", web_app: { url: MINI_APP_URL } }],
                [{ text: "📢 Duyuru & Topluluk Kanalı", url: "https://t.me/sanal_miner_duyuru" }]
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
        network TEXT,
        wallet TEXT,
        status TEXT DEFAULT 'Bekliyor',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS completed_quests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT,
        quest_id TEXT,
        completion_date TEXT,
        UNIQUE(telegram_id, quest_id, completion_date)
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
        try { 
            if (ADMIN_CHAT_ID) {
                bot.telegram.sendMessage(ADMIN_CHAT_ID, `🚨 KRİTİK SİSTEM HATASI:\n\n${errorText}`); 
            }
        } catch(e) {
            console.error("Admin hata bildirimi gönderilemedi:", e.message);
        }
    });
}

// Otomatik Duyuru (6 Saatte Bir)
setInterval(() => {
    db.all("SELECT username, amount, currency FROM withdrawals WHERE status='Ödendi' ORDER BY id DESC LIMIT 3", (err, rows) => {
        if (err) { logSystemError(err); return; }
        let payoutText = rows && rows.length > 0 
            ? rows.map(r => `• Oyuncu: @${r.username ? r.username.replace(/^@/, '') : 'Oyuncu'} ➔ ${r.amount} ${r.currency} ödülü kazandı!`).join('\n')
            : `• @GamerPro_99 ➔ 5,000 Puan Kazandı!\n• @PixelKing ➔ VIP Kart Açtı!\n• @QuestMaster ➔ Seviye Atladı!`;

        let motivationalMsg = `🔥 <b>GÜNÜN ETKİNLİK VE LİDERLİK RAPORU!</b>\n\n${payoutText}\n\n💡 Dostlar, vakit kaybetmeyin! Görevleri tamamlayarak en iyi oyuncular arasına adınızı yazdırın!`;
        
        const inlineKeyboard = {
            inline_keyboard: [
                [{ text: "🚀 Oyuna Git ve Puan Topla", url: MINI_APP_URL }]
            ]
        };

        sendTelegramChannelMessage(motivationalMsg, inlineKeyboard);
    });
}, 6 * 60 * 60 * 1000);

app.get('/api/admin/users', (req, res) => {
    db.all("SELECT telegram_id, username, balance FROM users ORDER BY balance DESC", (err, rows) => {
        if (err) {
            logSystemError(err);
            return res.status(500).json({ success: false, error: "Veritabanı hatası" });
        }
        res.json(rows || []);
    });
});

app.get('/api/admin/withdraws', (req, res) => {
    db.all("SELECT id, telegram_id, username, amount, currency, network, wallet, status FROM withdrawals WHERE status = 'Bekliyor' ORDER BY id DESC", (err, rows) => {
        if (err) {
            logSystemError(err);
            return res.status(500).json({ success: false, error: "Veritabanı hatası" });
        }
        res.json(rows || []);
    });
});

app.post('/api/admin/withdraws/complete', (req, res) => {
    const { id } = req.body;
    
    db.get("SELECT * FROM withdrawals WHERE id = ?", [id], (err, withdraw) => {
        if (err || !withdraw) {
            return res.status(404).json({ success: false, error: "Ödül talebi bulunamadı!" });
        }

        db.run("UPDATE withdrawals SET status = 'Ödendi' WHERE id = ?", [id], function(updateErr) {
            if (updateErr) {
                logSystemError(updateErr);
                return res.status(500).json({ success: false, error: "Veritabanı hatası" });
            }

            let cleanUsername = withdraw.username ? withdraw.username.replace(/^@/, '') : 'Oyuncu';
            let channelMessage = 
`🚀 <b>Yeni Ödül Teslim Edildi!</b>\n\n` +
`👤 Oyuncu: @${cleanUsername}\n` +
`💎 Ödül: ${withdraw.amount} ${withdraw.currency}\n` +
`🌐 Sunucu: ${withdraw.network || 'Global'} / <code>${withdraw.wallet}</code>\n` +
`✅ Durum: Oyuncu Hesabına Gönderildi!`;

            const inlineKeyboard = {
                inline_keyboard: [
                    [{ text: "🚀 Sen de ödül kazanmak için tıkla!", url: MINI_APP_URL }]
                ]
            };

            sendTelegramChannelMessage(channelMessage, inlineKeyboard);
            res.json({ success: true, message: "Talep başarıyla tamamlandı!" });
        });
    });
});

app.post('/api/admin/add-balance', (req, res) => {
    const { telegram_id, amount } = req.body;
    const numAmount = parseFloat(amount);

    if (!telegram_id || isNaN(numAmount)) {
        return res.status(400).json({ success: false, error: "Geçersiz ID veya miktar!" });
    }

    db.run("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", [numAmount, telegram_id], function(err) {
        if (err) {
            logSystemError(err);
            return res.status(500).json({ success: false, error: "Veritabanı hatası" });
        }
        if (this.changes === 0) {
            return res.status(404).json({ success: false, error: "Kullanıcı bulunamadı!" });
        }
        res.json({ success: true, message: "Puan başarıyla eklendi!" });
    });
});

app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    if (!userId || userId === 'undefined' || userId === 'null') {
        return res.status(400).json({ success: false, error: "Geçersiz kullanıcı ID" });
    }

    db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (err, row) => {
        if (err) logSystemError(err);
        if (row) {
            res.json(row);
        } else {
            const fallbackName = "User_" + (userId.length >= 4 ? userId.slice(-4) : userId);
            db.run(`INSERT INTO users (telegram_id, username, balance, streak_day) VALUES (?, ?, 5, 1)`, [userId, fallbackName], () => {
                db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (_, newRow) => res.json(newRow));
            });
        }
    });
});

app.post('/api/daily/claim', (req, res) => {
    const { telegram_id } = req.body;
    if (!telegram_id) return res.status(400).json({ success: false, error: "Eksik parametre" });
    
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

app.get('/api/leaderboard/:telegram_id', (req, res) => {
    const tid = req.params.telegram_id;
    db.all("SELECT telegram_id, username, balance FROM users", (err, realUsers) => {
        let fakeUsers = [
            { telegram_id: "f1", username: "GamerPro_99", balance: 1420 },
            { telegram_id: "f2", username: "PixelKing", balance: 1250 },
            { telegram_id: "f3", username: "QuestMaster", balance: 980 },
            { telegram_id: "f4", username: "SpeedRunner", balance: 850 },
            { telegram_id: "f5", username: "AliCraft", balance: 620 },
            { telegram_id: "f6", username: "ProGamer", balance: 510 },
            { telegram_id: "f7", username: "ArcadeHero", balance: 430 },
            { telegram_id: "f8", username: "LevelUp", balance: 310 },
            { telegram_id: "f9", username: "MehmetPlay", balance: 215 },
            { telegram_id: "f10", username: "TokenHunter", balance: 150 }
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

        let displayList = combined.slice(0, 10);
        if (userRankIndex >= 10) {
            displayList.push(combined[userRankIndex]);
        }

        res.json({ top10: displayList, userRank: userRankData });
    });
});

// GÜVENLİ REKLAM ÖDÜL API'Sİ (HilltopAds ve Adsgram için ortak koruma)
app.post('/api/reward/claim', (req, res) => {
    const { telegram_id, reward, quest_id } = req.body;
    
    if (!telegram_id) {
        return res.status(400).json({ success: false, error: "Geçersiz işlem: telegram_id bulunamadı." });
    }

    const numReward = parseFloat(reward) || 5;
    const today = new Date().toISOString().slice(0, 10);

    if (quest_id) {
        db.get("SELECT id FROM completed_quests WHERE telegram_id = ? AND quest_id = ? AND completion_date = ?", 
            [telegram_id, quest_id, today], (err, row) => {
            if (row) {
                return res.status(400).json({ success: false, error: "Bu görevi bugün zaten tamamladınız!" });
            }

            db.run("INSERT INTO completed_quests (telegram_id, quest_id, completion_date) VALUES (?, ?, ?)", 
                [telegram_id, quest_id, today], (insErr) => {
                if (insErr) { logSystemError(insErr); }
                
                db.run("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", [numReward, telegram_id], (upErr) => {
                    if (upErr) {
                        logSystemError(upErr);
                        return res.status(500).json({ success: false, error: "Veritabanı hatası" });
                    }
                    res.json({ success: true, message: "Ödül başarıyla eklendi!" });
                });
            });
        });
    } else {
        db.run("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", [numReward, telegram_id], (err) => {
            if (err) {
                logSystemError(err);
                return res.status(500).json({ success: false, error: "Veritabanı hatası" });
            }
            res.json({ success: true, message: "Ödül başarıyla eklendi!" });
        });
    }
});

app.post('/api/withdraw', (req, res) => {
    const { telegram_id, currency, network, wallet } = req.body;
    if (!telegram_id) return res.status(400).json({ success: false, error: "Geçersiz kullanıcı" });
    
    let requiredAmount = 0;
    if (currency === 'VIP_PAKET') requiredAmount = 50;
    else if (currency === 'KOSTUM') requiredAmount = 100;
    else return res.status(400).json({ success: false, error: "Geçersiz ürün seçimi!" });

    db.get("SELECT balance, username FROM users WHERE telegram_id = ?", [telegram_id], (err, user) => {
        if (!user || user.balance < requiredAmount) {
            return res.status(400).json({ success: false, error: "Yetersiz bakiye!" });
        }

        db.run("UPDATE users SET balance = balance - ? WHERE telegram_id = ?", [requiredAmount, telegram_id], () => {
            db.run("INSERT INTO withdrawals (telegram_id, username, amount, currency, network, wallet) VALUES (?, ?, ?, ?, ?, ?)",
                [telegram_id, user.username, requiredAmount, currency, network || 'GameServer', wallet], () => {
                res.json({ success: true, message: "Ödül talebiniz başarıyla alındı!" });
            });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server aktif: ${PORT}`));
