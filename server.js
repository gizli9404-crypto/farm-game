const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Statik dosyalar için (Frontend arayüzü)
app.use(express.static(path.join(__dirname, 'public')));

// Örnek kullanıcı veritabanı (Bellekte tutulur)
let users = {};

// Kullanıcı verisini getir veya oluştur
app.post('/api/sync', (req, res) => {
    const { userId } = req.body;
    if (!users[userId]) {
        users[userId] = {
            balance: 0,
            energy: 100,
            maxEnergy: 100,
            miningPower: 1,
            lastUpdate: Date.now()
        };
    }
    res.json(users[userId]);
});

// Madencilik tıklama / kazanç endpoint'i
app.post('/api/mine', (req, res) => {
    const { userId, clicks } = req.body;
    let user = users[userId];

    if (!user) {
        return res.status(400).json({ error: "Kullanıcı bulunamadı!" });
    }

    // Basit kazanç hesaplama (Tıklama başına güç)
    const earned = (clicks || 1) * user.miningPower;
    user.balance += earned;

    res.json({ success: true, balance: user.balance });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Bot sunucusu ${PORT} portunda çalışıyor!`);
});
