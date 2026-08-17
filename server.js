const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Statik dosyaları (oyun ve admin paneli) public klasöründen sun
app.use(express.static(path.join(__dirname, 'public')));

// Geçici Bellek (Veritabanı bağlayana kadar işlemleri burada tutar)
let db = {
    users: {
        "8256539395": { telegram_id: "8256539395", username: "Jacker_lord", balance: 120 }
    },
    activeBroadcast: "Sanal Miner Pro'ya hoş geldiniz!"
};

// 1. Bakiye Güncelleme Rotası (+ / -)
app.post('/api/admin/balance', (req, res) => {
    const { telegram_id, amount } = req.body;
    if (!db.users[telegram_id]) {
        db.users[telegram_id] = { telegram_id, username: "Jacker_lord", balance: 0 };
    }
    
    db.users[telegram_id].balance += amount;
    if (db.users[telegram_id].balance < 0) db.users[telegram_id].balance = 0;

    res.json({ success: true, new_balance: db.users[telegram_id].balance });
});

// 2. Çekim Onaylama Rotası
app.post('/api/admin/withdraw/approve', (req, res) => {
    res.json({ success: true, message: "Ödeme başarıyla onaylandı" });
});

// 3. Duyuru Kaydetme Rotası
app.post('/api/admin/broadcast', (req, res) => {
    const { message } = req.body;
    if (message) {
        db.activeBroadcast = message;
        res.json({ success: true, message: "Duyuru güncellendi" });
    } else {
        res.status(400).json({ success: false, error: "Boş duyuru olamaz" });
    }
});

// 4. Duyuruyu Okuma Rotası (Oyun tarafı için)
app.get('/api/broadcast', (req, res) => {
    res.json({ broadcast: db.activeBroadcast });
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif!`);
});
