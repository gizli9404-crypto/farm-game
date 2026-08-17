const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Kalıcı Veritabanı Dosyası Yolu
const DB_FILE = path.join(__dirname, 'database.json');

// Veritabanını oku veya yoksa ilk oluştur
function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            users: {
                "8256539395": { telegram_id: "8256539395", username: "Jacker_lord", balance: 120 }
            },
            activeBroadcast: "Sanal Miner Pro'ya hoş geldiniz!"
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

// Veritabanına yaz
function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// 1. Kullanıcı Bilgilerini Getir (Oyun tarafı için)
app.get('/api/user/:telegram_id', (req, res) => {
    let db = readDB();
    let userId = req.params.telegram_id;
    if (!db.users[userId]) {
        db.users[userId] = { telegram_id: userId, username: "Kullanıcı", balance: 0 };
        writeDB(db);
    }
    res.json({ success: true, user: db.users[userId] });
});

// 2. Admin Bakiye Güncelleme (+ / -)
app.post('/api/admin/balance', (req, res) => {
    let db = readDB();
    const { telegram_id, amount } = req.body;
    
    if (!db.users[telegram_id]) {
        db.users[telegram_id] = { telegram_id, username: "Jacker_lord", balance: 0 };
    }
    
    db.users[telegram_id].balance += amount;
    if (db.users[telegram_id].balance < 0) db.users[telegram_id].balance = 0;
    
    writeDB(db);
    res.json({ success: true, new_balance: db.users[telegram_id].balance });
});

// 3. Çekim Onaylama
app.post('/api/admin/withdraw/approve', (req, res) => {
    res.json({ success: true, message: "Ödeme başarıyla onaylandı" });
});

// 4. Duyuru Kaydetme
app.post('/api/admin/broadcast', (req, res) => {
    let db = readDB();
    const { message } = req.body;
    if (message) {
        db.activeBroadcast = message;
        writeDB(db);
        res.json({ success: true, message: "Duyuru güncellendi" });
    } else {
        res.status(400).json({ success: false, error: "Boş duyuru olamaz" });
    }
});

// 5. Duyuruyu Okuma (Oyun tarafı için)
app.get('/api/broadcast', (req, res) => {
    let db = readDB();
    res.json({ broadcast: db.activeBroadcast });
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda ve kalıcı veritabanı aktif!`);
});
