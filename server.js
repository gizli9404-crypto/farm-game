const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Veritabanı ve Tablo Başlatma
db.serialize(() => {
    // 1. Kullanıcılar tablosu
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id TEXT PRIMARY KEY,
        username TEXT,
        balance REAL DEFAULT 0,
        tickets INTEGER DEFAULT 0,
        wallet TEXT
    )`, (err) => {
        if (err) console.error("Tablo oluşturma hatası:", err);
    });

    // 2. 'tickets' sütunu kontrolü
    db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) return;
        const hasTickets = columns.find(col => col.name === 'tickets');
        if (!hasTickets) {
            db.run(`ALTER TABLE users ADD COLUMN tickets INTEGER DEFAULT 0`, (err) => {
                if (err) console.error("Tickets sütunu eklenirken hata:", err);
                else console.log("Tickets sütunu başarıyla veritabanına eklendi.");
            });
        }
    });

    // 3. Çekim talepleri tablosu
    db.run(`CREATE TABLE IF NOT EXISTS withdraws (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT,
        username TEXT,
        amount REAL,
        wallet TEXT,
        network TEXT,
        status TEXT DEFAULT 'pending'
    )`);
});

// --- API ROTALARI ---

// Canlı Liderlik Tablosu API'si (AdsGram Moderasyon Kuralı Uyumlu)
app.get('/api/leaderboard', (req, res) => {
    db.all("SELECT telegram_id, username, balance FROM users ORDER BY balance DESC LIMIT 10", (err, rows) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

// Kullanıcı Verisi Getir
app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else if (row) {
            res.json(row);
        } else {
            res.status(404).json({ error: "Kullanıcı bulunamadı" });
        }
    });
});

// Kullanıcı Güncelle / Kaydet
app.post('/api/user/update', (req, res) => {
    const { telegram_id, username, balance, tickets, wallet } = req.body;
    db.run(
        `INSERT INTO users (telegram_id, username, balance, tickets, wallet) 
         VALUES (?, ?, ?, ?, ?) 
         ON CONFLICT(telegram_id) 
         DO UPDATE SET username = excluded.username, balance = excluded.balance, tickets = excluded.tickets, wallet = excluded.wallet`,
        [telegram_id, username, balance, tickets, wallet],
        function(err) {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});

// Aktivite Log Sistemi (Admin/Worker için)
app.post('/api/user/log', (req, res) => {
    // Gelen log kayıtları konsola basılır veya veritabanında saklanabilir
    const { telegram_id, username, action, details, timestamp } = req.body;
    console.log(`[LOG] [${timestamp}] ID: ${telegram_id} (${username}) -> Aksiyon: ${action} | Detay: ${details}`);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda başarıyla çalışıyor.`);
});
