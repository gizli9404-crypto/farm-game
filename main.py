const express = require('express');
const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN || "BURAYA_BOT_TOKEN_YAZ";
const bot = new Telegraf(BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// SQLite Veritabanı Oluşturma / Bağlanma
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Veritabanı bağlantı hatası:', err.message);
    else console.log('SQLite veritabanına başarıyla bağlanıldı.');
});

// Tabloları Oluştur
db.run(`CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    username TEXT,
    balance REAL DEFAULT 150.0000,
    tickets INTEGER DEFAULT 2
)`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Kullanıcı Verisini Getir veya Oluştur
app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    const username = req.query.username || "Kullanıcı";

    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (!row) {
            // Kullanıcı yoksa ilk kayıt (150 bakiye, 2 bilet)
            db.run(`INSERT INTO users (telegram_id, username, balance, tickets) VALUES (?, ?, 150.0000, 2)`, 
                [userId, username], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ balance: 150.0000, tickets: 2 });
            });
        } else {
            res.json({ balance: row.balance, tickets: row.tickets });
        }
    });
});

// Kullanıcı Verisini Güncelle (Bakiye / Bilet harcama ve kazanma)
app.post('/api/user/update', (req, res) => {
    const { telegram_id, balance, tickets } = req.body;
    
    db.run(`UPDATE users SET balance = ?, tickets = ? WHERE telegram_id = ?`, 
        [balance, tickets, telegram_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Telegram Bot Komutları
bot.start((ctx) => {
    const webAppUrl = process.env.WEB_APP_URL || `https://${ctx.telegram.token ? 'senin-projen.up.railway.app' : 'localhost:3000'}`;
    ctx.reply(`Selam ${ctx.from.first_name}! Sanal Miner Pro'ya hoş geldin. Madenciliğe başlamak için aşağıdaki butona tıkla:`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 Sanal Miner App Aç", web_app: { url: webAppUrl } }]
            ]
        }
    });
});

bot.launch();
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
