const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Veritabanı ve Tablo Başlatma
db.serialize(() => {
    // 1. Tabloyu oluştur (eğer yoksa)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id TEXT PRIMARY KEY,
        username TEXT,
        balance REAL DEFAULT 0,
        tickets INTEGER DEFAULT 0,
        wallet TEXT
    )`, (err) => {
        if (err) console.error("Tablo oluşturma hatası:", err);
    });

    // 2. 'tickets' sütunu yoksa ekle (Hata almamak için sütun kontrolü)
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

    // Çekim talepleri için tablo (eğer henüz eklemediyseniz)
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

// ... Buradan sonra mevcut Express.js uygulama kodlarınız (app.listen vb.) gelecek ...
