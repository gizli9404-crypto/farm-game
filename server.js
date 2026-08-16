const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');

const app = express();
const bot = new Telegraf('8854910303:AAFre2j9IO6RKvJ8BJRoG4dZ4quD40d3LFM'); // BotFather'dan aldığın token

app.use(express.json());
app.use(express.static('public'));

// Mini App için ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Çekim talebi API'si
app.post('/api/withdraw', (req, res) => {
    const { userId, amount, address, network } = req.body;
    
    console.log(`Yeni Çekim Talebi: Kullanıcı=${userId}, Miktar=${amount}, Adres=${address}, Ağ=${network}`);
    
    // Buraya bot ile admin grubuna mesaj atma kodu eklenebilir
    bot.telegram.sendMessage('8256539395', 
        `💰 Yeni Çekim Talebi!\n\nKullanıcı ID: ${userId}\nMiktar: ${amount} PEPE\nAdres: ${address}\nAğ: ${network}`
    );

    res.json({ success: true, message: "Talebiniz admin onayına gönderildi." });
});

// Sunucuyu ve botu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
});

bot.launch();
