const express = require('express');
const path = require('path');
const { Telegraf } = require('telegraf');

const app = express();
const PORT = process.env.PORT || 8080;

// Bot Token'ını buraya yaz veya Railway Environment Variables kısmına ekle
const BOT_TOKEN = process.env.BOT_TOKEN || '8970909833:AAGyAASBhKLaGvC0KQQdQMHosVmv6_cs6A';
const CHANNEL_ID = process.env.CHANNEL_ID || '@tiny_farm_adventure_channel'; // Kanal kullanıcı adın

const bot = new Telegraf(BOT_TOKEN);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Telegram Bot Komutları
bot.start((ctx) => {
    ctx.reply("🌾 Tiny Farm Adventure'a hoş geldin! Aşağıdaki butona tıklayarak çiftliğini yönetmeye başlayabilirsin.", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🎮 Oyunu Aç & Oyna", web_app: { url: "https://farm-game-production-b1cb.up.railway.app" } }],
                [{ text: "📢 Duyuru Kanalı", url: "https://t.me/tin_farm_adventure" }, { text: "💬 Sohbet Grubu", url: "https://t.me/tiny_farm_sohbet" }]
            ]
        }
    });
});

bot.help((ctx) => {
    ctx.reply("Komutlar:\n/start - Oyunu başlatır\n/market - Market bilgilerini gösterir");
});

// Botu başlat
bot.launch().then(() => {
    console.log("Telegram botu başarıyla başlatıldı ve dinlemede!");
}).catch(err => {
    console.error("Bot başlatılırken hata oluştu:", err);
});

// Otomatik Duyuru Sistemi (Her 2 saatte bir kanala/gruba otomatik mesaj atar)
setInterval(async () => {
    try {
        await bot.telegram.sendMessage(CHANNEL_ID, "🌾 **Çiftlik Durumu Güncellendi!**\nTarlalarınızı kontrol etmeyi ve hasat yapmayı unutmayın! Yeni tohumlar markette sizi bekliyor. 🚀", {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🌱 Çiftliğe Git", web_app: { url: "https://farm-game-production-b1cb.up.railway.app" } }]
                ]
            }
        });
        console.log("Otomatik duyuru kanala gönderildi.");
    } catch (e) {
        console.log("Duyuru gönderilemedi (Kanal ID veya yetki kontrol edilmeli):", e.message);
    }
}, 2 * 60 * 60 * 1000); // 2 saatte bir

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
