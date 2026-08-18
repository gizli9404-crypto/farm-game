const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Bot Token (Test veya gerçek token)
const BOT_TOKEN = process.env.BOT_TOKEN || '7512345678:AAH...'; 
const bot = new Telegraf(BOT_TOKEN);

// SQLite Veritabanı Kurulumu
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Veritabanı bağlantı hatası:', err.message);
    else console.log('SQLite veritabanına bağlanıldı.');
});

// Tabloları ve Sütunları Eksiksiz Oluşturma / Güncelleme
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id TEXT PRIMARY KEY,
        username TEXT,
        balance REAL DEFAULT 0.0,
        tickets INTEGER DEFAULT 3,
        wallet TEXT DEFAULT ''
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT,
        username TEXT,
        amount REAL,
        wallet TEXT,
        network TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        // Eğer tablo önceden var ama network sütunu eksikse hata vermemesi için alternatif kontrol
        if (!err) {
            db.run(`ALTER TABLE withdrawals ADD COLUMN network TEXT`, () => {});
        }
    });
});

// 1. Kullanıcı Giriş / Senkronizasyon Endpoint'i
app.post('/api/user/login', (req, res) => {
    const { telegram_id, username } = req.body;
    if (!telegram_id) return res.status(400).json({ success: false, error: 'Telegram ID gerekli' });

    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        if (!row) {
            db.run(`INSERT INTO users (telegram_id, username, balance, tickets) VALUES (?, ?, 0.0, 3)`, 
                [telegram_id, username || 'User'], (insertErr) => {
                if (insertErr) return res.status(500).json({ success: false, error: insertErr.message });
                res.json({ success: true, balance: 0.0, tickets: 3, wallet: '' });
            });
        } else {
            res.json({ success: true, balance: Number(row.balance), tickets: row.tickets, wallet: row.wallet });
        }
    });
});

// 2. Kullanıcı Verilerini Getir
app.get('/api/user/data', (req, res) => {
    const { telegram_id } = req.query;
    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err || !row) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        res.json({ success: true, balance: Number(row.balance), tickets: row.tickets, wallet: row.wallet });
    });
});

// 3. Admin Bakiye / Bilet Ekleme
app.post('/api/admin/modify', (req, res) => {
    const { telegram_id, amount, type } = req.body; // type: 'balance' veya 'tickets'
    const val = Number(amount);

    if (type === 'balance') {
        db.run(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`, [val, telegram_id], function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
        });
    } else if (type === 'tickets') {
        db.run(`UPDATE users SET tickets = tickets + ? WHERE telegram_id = ?`, [val, telegram_id], function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
        });
    } else {
        res.status(400).json({ success: false, error: 'Geçersiz işlem tipi' });
    }
});

// 4. Çekim Talebi Oluşturma
app.post('/api/withdraw', (req, res) => {
    const { telegram_id, username, amount, wallet, network } = req.body;
    const reqAmount = Number(amount);

    db.get(`SELECT balance FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err || !row) return res.status(400).json({ success: false, error: 'Kullanıcı bulunamadı' });

        if (row.balance < reqAmount) {
            return res.status(400).json({ success: false, error: 'Yetersiz bakiye!' });
        }

        // Bakiyeden düş ve çekim talebi oluştur
        db.run(`UPDATE users SET balance = balance - ?, wallet = ? WHERE telegram_id = ?`, [reqAmount, wallet, telegram_id], (updateErr) => {
            if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });

            db.run(`INSERT INTO withdrawals (telegram_id, username, amount, wallet, network, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
                [telegram_id, username || 'User', reqAmount, wallet, network || 'BEP20'], (insertErr) => {
                if (insertErr) return res.status(500).json({ success: false, error: insertErr.message });
                res.json({ success: true });
            });
        });
    });
});

// 5. Bekleyen Çekimleri Listele (Admin)
app.get('/api/admin/withdrawals', (req, res) => {
    db.all(`SELECT * FROM withdrawals WHERE status = 'pending'`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, withdrawals: rows });
    });
});

// 6. Çekim İşlemini Onayla / Reddet (Admin)
app.post('/api/admin/withdraw/action', (req, res) => {
    const { id, action } = req.body; // action: 'approve' veya 'reject'
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    db.get(`SELECT * FROM withdrawals WHERE id = ?`, [id], (err, row) => {
        if (err || !row) return res.status(404).json({ success: false, error: 'Talep bulunamadı' });

        if (action === 'reject') {
            // Reddedildiyse bakiyeyi kullanıcıya iade et
            db.run(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`, [row.amount, row.telegram_id]);
        }

        db.run(`UPDATE withdrawals SET status = ? WHERE id = ?`, [newStatus, id], (updateErr) => {
            if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });
            res.json({ success: true });
        });
    });
});

// 7. Liderlik Tablosu
app.get('/api/rankings', (req, res) => {
    const { telegram_id } = req.query;
    db.all(`SELECT telegram_id, username, balance, tickets FROM users ORDER BY balance DESC LIMIT 10`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        let rank = 1;
        const topUsers = rows.map(u => ({
            rank: rank++,
            username: u.username,
            balance: Number(u.balance),
            tickets: u.tickets,
            isMe: u.telegram_id === telegram_id
        }));

        res.json({ success: true, topUsers });
    });
});

// 8. İstatistikler (Admin)
app.get('/api/admin/stats', (req, res) => {
    db.get(`SELECT COUNT(*) as totalUsers, SUM(balance) as totalBalance FROM users`, (err, userStats) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        db.get(`SELECT COUNT(*) as pendingWithdrawals FROM withdrawals WHERE status = 'pending'`, (err2, wdStats) => {
            if (err2) return res.status(500).json({ success: false, error: err2.message });

            res.json({
                success: true,
                totalUsers: userStats.totalUsers || 0,
                totalBalance: Number(userStats.totalBalance || 0).toFixed(2),
                pendingWithdrawals: wdStats.pendingWithdrawals || 0
            });
        });
    });
});

// Telegram Bot Komutları
bot.start((ctx) => {
    ctx.reply('Sanal Miner Pro\'ya Hoş Geldiniz! Aşağıdaki butona tıklayarak madencilik panelini açabilirsiniz.', {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 Madencilik Panelini Aç', web_app: { url: 'https://' + ctx.telegram.options.apiRoot + '...' } }] // veya kendi domain adresiniz
            ]
        }
    });
});

// Sunucuyu Başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
