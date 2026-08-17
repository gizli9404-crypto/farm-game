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

// Kullanıcı Verisi Getir (Yoksa otomatik oluşturup kayıt açar)
app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (row) {
            res.json(row);
        } else {
            // Kullanıcı veritabanında yoksa otomatik oluştur
            db.run(
                `INSERT INTO users (telegram_id, username, balance, tickets) VALUES (?, ?, 0, 0)`,
                [userId, "Kullanıcı_" + userId.slice(-4)],
                function(insErr) {
                    if (insErr) {
                        return res.status(500).json({ error: insErr.message });
                    }
                    db.get("SELECT * FROM users WHERE telegram_id = ?", [userId], (err2, newRow) => {
                        res.json(newRow || { telegram_id: userId, balance: 0, tickets: 0 });
                    });
                }
            );
        }
    });
});

// Kullanıcı Güncelle / Kaydet
app.post('/api/user/update', (req, res) => {
    const { telegram_id, username, balance, tickets, wallet } = req.body;
    if (!telegram_id) return res.status(400).json({ success: false, error: "Telegram ID eksik" });

    db.run(
        `INSERT INTO users (telegram_id, username, balance, tickets, wallet) 
         VALUES (?, ?, ?, ?, ?) 
         ON CONFLICT(telegram_id) 
         DO UPDATE SET username = excluded.username, balance = excluded.balance, tickets = excluded.tickets, wallet = excluded.wallet`,
        [telegram_id, username || "İsimsiz", balance || 0, tickets || 0, wallet || ""],
        function(err) {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
            } else {
                res.json({ success: true });
            }
        }
    );
});

// Aktivite Log Sistemi
app.post('/api/user/log', (req, res) => {
    const { telegram_id, username, action, details, timestamp } = req.body;
    console.log(`[LOG] [${timestamp}] ID: ${telegram_id} (${username}) -> Aksiyon: ${action} | Detay: ${details}`);
    res.json({ success: true });
});

// --- ADMIN PANELİ API ROTALARI (Eksik Olanlar Eklendi) ---

// 1. Admin İstatistikleri (Admin Paneldeki Toplam Kullanıcı ve Bakiye Göstergesi İçin)
app.get('/api/admin/stats', (req, res) => {
    db.get(`SELECT COUNT(*) as totalUsers, SUM(balance) as totalBalance FROM users`, (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        db.get(`SELECT COUNT(*) as pendingWithdraws FROM withdraws WHERE status = 'pending'`, (err2, row2) => {
            db.all(`SELECT * FROM withdraws WHERE status = 'pending'`, (err3, withdrawsRows) => {
                res.json({
                    success: true,
                    totalUsers: row?.totalUsers || 0,
                    totalBalance: row?.totalBalance || 0,
                    pendingWithdraws: row2?.pendingWithdraws || 0,
                    withdraws: withdrawsRows || []
                });
            });
        });
    });
});

// 2. Admin Kullanıcıları Listeleme (Admin Panelinin Kullanıcıları Göstermesi İçin)
app.get('/api/admin/users', (req, res) => {
    db.all(`SELECT * FROM users ORDER BY balance DESC`, (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, users: rows || [] });
    });
});

// 3. Admin Bakiye/Bilet Düzenleme İşlemi
app.post('/api/admin/modify', (req, res) => {
    const { telegram_id, amount, type } = req.body;
    const column = type === 'tickets' ? 'tickets' : 'balance';
    
    db.run(`UPDATE users SET ${column} = ${column} + ? WHERE telegram_id = ?`, [amount, telegram_id], function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

// 4. Çekim Onaylama İşlemi
app.post('/api/admin/withdraw/approve', (req, res) => {
    const { id } = req.body;
    db.run(`UPDATE withdraws SET status = 'approved' WHERE id = ?`, [id], function(err) {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda başarıyla çalışıyor.`);
});
