const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Telegram Bot Bilgileri
const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN || '8854910303:AAFre2j9IO6RKvJ8BJRoG4dZ4quD40d3LFM';
const ADMIN_CHANNEL_ID = process.env.CHANNEL_ID || '@sanal_miner_duyuru';

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite Veritabanı Bağlantısı (Railway Volume Uyumlu)
const dbDir = '/app/data';
if (!fs.existsSync(dbDir)){
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Veritabanı bağlantı hatası:', err.message);
    else console.log('SQLite veritabanına bağlandı:', dbPath);
});

// Tabloların Oluşturulması
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE,
        username TEXT,
        balance REAL DEFAULT 0,
        tickets INTEGER DEFAULT 0,
        wallet TEXT DEFAULT ''
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

// 0. ADMIN GİRİŞ DOĞRULAMA (Eksik olan kısım eklendi)
app.post(['/api/admin/login', '/api/admin/giris'], (req, res) => {
    const { password } = req.body;
    // Railway değişkenlerinden veya varsayılan olarak '123'den alır
    const ADMIN_SECRET = process.env.ADMIN_SECRET || '123';

    if (password === ADMIN_SECRET) {
        res.json({ success: true, message: 'Giriş başarılı' });
    } else {
        res.status(401).json({ success: false, error: 'Hatalı Yönetici Şifresi!' });
    }
});

// 1. KULLANICI GİRİŞİ / SENKRONİZASYONU
app.post(['/api/user/login', '/api/kullanici/giris'], (req, res) => {
    const { telegram_id, username } = req.body;
    if (!telegram_id) return res.status(400).json({ success: false, error: 'Telegram ID gerekli' });

    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        if (row) {
            res.json({ success: true, balance: row.balance, tickets: row.tickets, wallet: row.wallet, username: row.username });
        } else {
            db.run(`INSERT INTO users (telegram_id, username, balance, tickets, wallet) VALUES (?, ?, 0, 0, '')`, [telegram_id, username || 'Kullanıcı'], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, balance: 0, tickets: 0, wallet: '', username: username });
            });
        }
    });
});

// 2. ÇEKİM TALEBİ OLUŞTURMA
app.post(['/api/withdraw', '/api/cekim'], (req, res) => {
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

// 3. ÇEKİMLERİ GETİRME
const handleWithdrawals = (req, res) => {
    db.all(`SELECT * FROM withdrawals ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, withdrawals: rows });
    });
};
app.get(['/api/withdrawals', '/api/geri çekilmeler', '/api/geri-cekilmeler', '/api/cekimler'], handleWithdrawals);

// 4. KULLANICI LİSTESİ / LİDERLİK TABLOSU
const handleLeaderboard = (req, res) => {
    db.all(`SELECT telegram_id, username, balance, tickets FROM users ORDER BY balance DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ json: [], error: err.message });
        res.json(rows);
    });
};
app.get(['/api/leaderboard', '/api/lider tahtası', '/api/lider-tahtasi', '/api/users', '/api/kullanicilar'], handleLeaderboard);

// 5. ADMIN BAKIYE GÜNCELLEME
app.post(['/api/admin/update-balance', '/api/admin/bakiye-guncelle'], (req, res) => {
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
            db.run(`INSERT INTO users (telegram_id, username, balance, tickets, wallet) VALUES (?, ?, ?, 0, '')`, [telegram_id, 'Kullanıcı', newBalance], (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, new_balance: newBalance });
            });
        }
    });
});

// 6. TOPLU DUYURU GÖNDERME
app.post(['/api/broadcast', '/api/duyuru'], async (req, res) => {
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

// 8. KULLANICI BİLGİLERİNİ GÜNCELLEME
const handleUserUpdate = (req, res) => {
    const { telegram_id, username, balance, tickets, wallet } = req.body;
    if (!telegram_id) return res.status(400).json({ success: false, error: 'Telegram ID gerekli' });

    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        if (row) {
            db.run(`UPDATE users SET username = ?, balance = ?, tickets = ?, wallet = ? WHERE telegram_id = ?`, 
                [username || row.username, balance ?? row.balance, tickets ?? row.tickets, wallet ?? row.wallet, telegram_id], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, message: 'Kullanıcı güncellendi.' });
            });
        } else {
            db.run(`INSERT INTO users (telegram_id, username, balance, tickets, wallet) VALUES (?, ?, ?, ?, ?)`, 
                [telegram_id, username || 'Kullanıcı', balance || 0, tickets || 0, wallet || ''], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, message: 'Yeni kullanıcı oluşturuldu ve güncellendi.' });
            });
        }
    });
};
app.post(['/api/user/update', '/api/kullanici/guncelle', '/api/kullanıcı/güncelleme'], handleUserUpdate);

// 9. KULLANICI ETKİLEŞİM / LOG KAYIT SİSTEMİ
const handleUserLog = (req, res) => {
    const { telegram_id, action, details } = req.body;
    console.log(`[LOG] Telegram ID: ${telegram_id}, İşlem: ${action}, Detay: ${details || '-'}`);
    res.json({ success: true, message: 'Log kaydedildi.' });
};
app.post(['/api/user/log', '/api/kullanici/log', '/api/kullanıcı/günlük'], handleUserLog);

// 10. TEKİL KULLANICI VERİSİNİ GETİRME
const handleGetSingleUser = (req, res) => {
    const telegramId = req.params.telegramId || req.params.id;
    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegramId], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!row) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        res.json({ success: true, balance: row.balance, tickets: row.tickets, wallet: row.wallet, username: row.username });
    });
};
app.get(['/api/user/:telegramId', '/api/kullanici/:telegramId', '/api/kullanıcı/:telegramId'], handleGetSingleUser);

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
