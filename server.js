const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Statik Dosyalar
app.use(express.static(path.join(__dirname)));

// SQLite Veritabanı Kurulumu
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Veritabanı bağlantı hatası:', err.message);
    } else {
        console.log('SQLite veritabanına başarıyla bağlanıldı.');
    }
});

// Tabloları Oluşturma
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id TEXT PRIMARY KEY,
        username TEXT,
        balance REAL DEFAULT 0.00,
        tickets INTEGER DEFAULT 0,
        wallet TEXT DEFAULT ''
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT,
        username TEXT,
        amount REAL,
        wallet TEXT,
        network TEXT,
        status TEXT DEFAULT 'Bekliyor',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT,
        action TEXT,
        details TEXT,
        balance REAL,
        tickets INTEGER,
        wallet TEXT,
        timestamp TEXT
    )`);
});

// --- API ROTALARI ---

// 1. Kullanıcı Bilgisi Getir
app.get('/api/user/:telegram_id', (req, res) => {
    const { telegram_id } = req.params;
    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (row) {
            res.json(row);
        } else {
            db.run(`INSERT OR IGNORE INTO users (telegram_id, username, balance, tickets) VALUES (?, ?, 0, 0)`, 
            [telegram_id, 'Kullanıcı_' + telegram_id.slice(-4)], function(err) {
                res.json({ telegram_id, username: 'Kullanıcı', balance: 0.00, tickets: 0, wallet: '' });
            });
        }
    });
});

// 2. Kullanıcı Verisi Güncelle / Senkronize Et
app.post('/api/user/update', (req, res) => {
    const { telegram_id, username, balance, tickets, wallet } = req.body;
    db.run(`INSERT INTO users (telegram_id, username, balance, tickets, wallet) 
            VALUES (?, ?, ?, ?, ?) 
            ON CONFLICT(telegram_id) 
            DO UPDATE SET username = excluded.username, balance = excluded.balance, tickets = excluded.tickets, wallet = excluded.wallet`,
        [telegram_id, username, balance, tickets, wallet],
        function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
        }
    );
});

// 3. Aktivite Log Kaydı
app.post('/api/user/log', (req, res) => {
    const { telegram_id, action, details, balance, tickets, wallet, timestamp } = req.body;
    db.run(`INSERT INTO logs (telegram_id, action, details, balance, tickets, wallet, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [telegram_id, action, details, balance, tickets, wallet, timestamp],
        function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, log_id: this.lastID });
        }
    );
});

// 4. Çekim Talebi Oluştur
app.post('/api/withdraw', (req, res) => {
    const { telegram_id, username, amount, wallet, network } = req.body;

    db.get(`SELECT balance FROM users WHERE telegram_id = ?`, [telegram_id], (err, user) => {
        if (err || !user) {
            return res.status(400).json({ success: false, error: 'Kullanıcı bulunamadı.' });
        }
        if (user.balance < amount) {
            return res.status(400).json({ success: false, error: 'Yetersiz bakiye.' });
        }

        db.run(`UPDATE users SET balance = balance - ? WHERE telegram_id = ?`, [amount, telegram_id], (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            db.run(`INSERT INTO withdrawals (telegram_id, username, amount, wallet, network, status) VALUES (?, ?, ?, ?, ?, 'Bekliyor')`,
                [telegram_id, username || telegram_id, amount, wallet, network || 'TON'],
                function(err) {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    
                    db.run(`INSERT INTO logs (telegram_id, action, details, balance, timestamp) VALUES (?, ?, ?, ?, ?)`,
                        [telegram_id, 'Yeni Çekim Talebi', `ID: ${telegram_id} | Tutar: ${amount}`, user.balance - amount, new Date().toLocaleTimeString()]);

                    res.json({ success: true, message: 'Çekim talebiniz başarıyla alındı!' });
                }
            );
        });
    });
});

// 5. Çekim Taleplerini Listele (Admin İçin)
app.get('/api/withdrawals', (req, res) => {
    db.all(`SELECT * FROM withdrawals ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, withdrawals: rows });
    });
});

// 6. Liderlik Tablosu / Kullanıcı Listesi
app.get('/api/leaderboard', (req, res) => {
    db.all(`SELECT telegram_id, username, balance, tickets FROM users ORDER BY balance DESC LIMIT 50`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 7. Admin Bakiye Güncelleme / Düzenleme
app.post('/api/admin/update-balance', (req, res) => {
    const { telegram_id, action, amount } = req.body;

    db.get(`SELECT balance FROM users WHERE telegram_id = ?`, [telegram_id], (err, user) => {
        if (err || !user) {
            return res.status(400).json({ success: false, error: 'Kullanıcı veritabanında bulunamadı.' });
        }

        let newBalance = user.balance;
        if (action === 'set') newBalance = parseFloat(amount);
        else if (action === 'add') newBalance += parseFloat(amount);
        else if (action === 'sub') newBalance -= parseFloat(amount);

        db.run(`UPDATE users SET balance = ? WHERE telegram_id = ?`, [newBalance, telegram_id], (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            db.run(`INSERT INTO logs (telegram_id, action, details, balance, timestamp) VALUES (?, ?, ?, ?, ?)`,
                [telegram_id, 'Varlık Güncelleme', `Tür: ${action} | Miktar: ${amount}`, newBalance, new Date().toLocaleTimeString()]);

            res.json({ success: true, new_balance: newBalance });
        });
    });
});

// 8. Toplu Duyuru API
app.post('/api/broadcast', (req, res) => {
    const { message } = req.body;
    db.all(`SELECT telegram_id FROM users`, [], async (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        let sentCount = rows.length;
        res.json({ success: true, sent_count: sentCount });
    });
});

// Sunucuyu Başlat
app.listen(PORT, () => {
    console.log(`Sanal Miner Pro Server http://localhost:${PORT} adresinde çalışıyor.`);
});
