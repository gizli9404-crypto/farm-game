const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
const path = require('path');

// Kendi Telegram Bot Token'ını buraya yazacaksın (BotFather'dan aldığın token)
const BOT_TOKEN = 'BURAYA_BOT_TOKENINI_YAZ';
const ADMIN_CHAT_ID = 'BURAYA_KENDI_TELEGRAM_ID_YAZ'; // Bildirimlerin geleceği senin veya kanalının ID'si

const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Bellekte tutulan geçici kullanıcı veritabanı
let users = {
    "user_123": { balance: 10000, address: "", network: "" }
};

// Çekim Talebi Oluşturma Endpoint'i (Mini App'ten gelir)
app.post('/api/withdraw', async (req, res) => {
    const { userId, amount, address, network } = req.body;

    if (!users[userId] || users[userId].balance < amount) {
        return res.status(400).json({ success: false, message: "Yetersiz bakiye!" });
    }

    // Kullanıcının bakiyesinden düş
    users[userId].balance -= amount;
    users[userId].address = address;

    // Admin kanalına butonlu bildirim gönder
    try {
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, 
            `📢 **Yeni Çekim Talebi!**\n\n` +
            `👤 **Kullanıcı ID:** \`${userId}\`\n` +
            `💰 **Miktar:** \`${amount} PEPE\`\n` +
            `🌐 **Ağ:** \`${network}\`\n` +
            `📍 **Adres:** \`${address}\``, 
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('Onayla ✅', `approve_${userId}_${amount}`),
                        Markup.button.callback('Reddet ❌', `reject_${userId}_${amount}`)
                    ]
                ])
            }
        );

        res.json({ success: true, message: "Çekim talebiniz alındı, admin onayına gönderildi." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Sunucu hatası oluştu." });
    }
});

// Telegram Admin Buton Yanıtları (Onay / Red)
bot.action(/approve_(.+)_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    const amount = ctx.match[2];

    await ctx.editMessageText(`✅ **Talep Onaylandı!**\n\nKullanıcıya (${userId}) ${amount} PEPE ödemesi yapıldı ve onaylandı.`);
    // İsteğe bağlı: Burada kullanıcıya bot üzerinden özel mesaj atılabilir.
});

bot.action(/reject_(.+)_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    const amount = ctx.match[2];

    // Reddedilirse bakiyeyi kullanıcıya iade et
    if (users[userId]) {
        users[userId].balance += parseFloat(amount);
    }

    await ctx.editMessageText(`❌ **Talep Reddedildi!**\n\nİşlem iptal edildi, miktar kullanıcının hesabına iade edildi.`);
});

// Botu başlat
bot.launch();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Sistem ${PORT} portunda başarıyla çalışıyor!`);
});
