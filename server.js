const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8080;

// Telegram Bot Bilgileri
const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN || 'BURAYA_BOT_TOKEN_YAZIN';
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

// 1. KULLANICI GİRİŞİ / SENKRONİZASYONU (Mini Uygulama Açıldığında Çalışır)
app.post('/api/user/login', (req, res) => {
    const { telegram_id, username } = req.body;
    if (!telegram_id) return res.status(400).json({ success: false, error: 'Telegram ID gerekli' });

    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        if (row) {
            res.json({ success: true, balance: row.balance, username: row.username });
        } else {
            db.run(`INSERT INTO users (telegram_id, username, balance) VALUES (?, ?, 0)`, [telegram_id, username || 'Kullanıcı'], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, balance: 0, username: username });
            });
        }
    });
});

// 2. ÇEKİM TALEBİ OLUŞTURMA
app.post('/api/withdraw', (req, res) => {
    const { telegram_id, username, amount, wallet } = req.body;
    
    db.run(`INSERT INTO withdrawals (telegram_id, username, amount, wallet) VALUES (?, ?, ?, ?)`,
        [telegram_id, username || 'Bilinmiyor', amount, wallet],
        function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            
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

// 3. ADMIN PANELİ İÇİN ÇEKİMLERİ GETİRME
app.get('/api/withdrawals', (req, res) => {
    db.all(`SELECT * FROM withdrawals ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, withdrawals: rows });
    });
});

// 4. KULLANICI LİSTESİ / LİDERLİK TABLOSU
app.get('/api/leaderboard', (req, res) => {
    db.all(`SELECT telegram_id, username, balance FROM users ORDER BY balance DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ json: [], error: err.message });
        res.json(rows);
    });
});

// 5. ADMIN BAKIYE GÜNCELLEME
app.post('/api/admin/update-balance', (req, res) => {
    const { telegram_id, action, amount } = req.body;

    db.get(`SELECT balance FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        let currentBalance = row ? row.balance : 0;
        let newBalance = currentBalance;

        if (action === 'set') newBalance = amount;
        else if (action === 'add') newBalance = currentBalance + amount;
        else if (action === 'sub') newBalance = Math.max(0, currentBalance - amount);

        if (row) {
            db.run(`UPDATE users SET balance = ? WHERE telegram_id = ?`, [newBalance, telegram_id], (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, new_balance: newBalance });
            });
        } else {
            db.run(`INSERT INTO users (telegram_id, username, balance) VALUES (?, ?, ?)`, [telegram_id, 'Kullanıcı', newBalance], (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, new_balance: newBalance });
            });
        }
    });
});

// 6. TOPLU DUYURU GÖNDERME
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

// 7. OTOMATİK HATA TAKİP VE KANAL BİLDİRİM SİSTEMİ (WATCHDOG)
let alertSent = false;
const checkSystemHealth = async () => {
    try {
        await axios.get('https://api.github.com');
        alertSent = false;
    } catch (error) {
        if (!alertSent) {
            console.log('Sistem hatası algılandı, kanala duyuru yapılıyor...');
            const errorMessage = "⚠️ **SİSTEM BAKIM DUYURUSU**\n\nŞu an genel bir altyapı çalışması veya servis kesintisi mevcuttur. İşlemlerinizde hata alabilirsiniz. Lütfen kısa bir süre işlem yapmayın, düzelince bilgilendirme yapılacaktır.";
            
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHANNEL_ID,
                text: errorMessage,
                parse_mode: 'Markdown'
            }).catch(e => console.log('Duyuru gönderilemedi:', e.message));
            
            alertSent = true;
        }
    }
};

setInterval(checkSystemHealth, 300000);

app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor.`);
});
