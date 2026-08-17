const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios'); // Telegram bildirimleri için

const app = express();
const PORT = process.env.PORT || 3000;

// Bot ve Kanal Bilgileri (Kendi Telegram Bot Token ve Kanal ID'nizi buraya yazın)
const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN || '8854910303:AAFre2j9IO6RKvJ8BJRoG4dZ4quD40d3LFM';
const ADMIN_CHANNEL_ID = process.env.CHANNEL_ID || '@sanal_miner_duyuru';

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite Veritabanı Bağlantısı
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('Veritabanı bağlantı hatası:', err.message);
    else console.log('SQLite veritabanına bağlandı.');
});

// Tabloların Oluşturulması
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE,
        username TEXT,
        balance REAL DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT,
        username TEXT,
        amount REAL,
        wallet TEXT,
        status TEXT DEFAULT 'Bekliyor',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// ÇEKİM TALEBİ OLUŞTURMA ENDPOINT'İ
app.post('/api/withdraw', (req, res) => {
    const { telegram_id, username, amount, wallet } = req.body;
    
    db.run(`INSERT INTO withdrawals (telegram_id, username, amount, wallet) VALUES (?, ?, ?, ?)`,
        [telegram_id, username || 'Bilinmiyor', amount, wallet],
        function(err) {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            
            // Telegram Kanalına/Grubuna Bilgilendirme Gönderimi
            const msg = `🔔 **YENİ ÇEKİM TALEBİ**\n\n👤 Kullanıcı: @${username || telegram_id}\n💰 Miktar: ${amount} PEPE\n💳 Cüzdan: \`${wallet}\``;
            axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHANNEL_ID,
                text: msg,
                parse_mode: 'Markdown'
            }).catch(e => console.log('Telegram bildirim hatası:', e.message));

            res.json({ success: true, message: 'Çekim talebi alındı.' });
        }
    );
});

// ADMIN PANELİ İÇİN ÇEKİM LİSTESİNİ GETİRME
app.get('/api/withdrawals', (req, res) => {
    db.all(`SELECT * FROM withdrawals ORDER BY id DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, withdrawals: rows });
    });
});

// TOPLU DUYURU / BİLDİRİM GÖNDERME ENDPOINT'İ
app.post('/api/broadcast', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Mesaj boş olamaz.' });

    db.all(`SELECT telegram_id FROM users`, [], async (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        let successCount = 0;
        for (const row of rows) {
            try {
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: row.telegram_id,
                    text: `📢 **DUYURU**\n\n${message}`,
                    parse_mode: 'Markdown'
                });
                successCount++;
            } catch (e) {
                console.log(`Mesaj gönderilemedi (${row.telegram_id}):`, e.message);
            }
        }
        res.json({ success: true, sent_count: successCount });
    });
});

app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor.`);
});
