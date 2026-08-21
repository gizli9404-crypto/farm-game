const express = require('express');
const path = require('path');
const { Telegraf } = require('telegraf');

const app = express();
const PORT = process.env.PORT || 8080;

// Bot Token ve Kanal Bilgileri
const BOT_TOKEN = process.env.BOT_TOKEN || '8970909833:AAGyAASBhKLaGvC0KQQdQMHosVmv6_cs6A';
const CHANNEL_ID = process.env.CHANNEL_ID || '@tiny_farm_adventure_channel';

const bot = new Telegraf(BOT_TOKEN);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Telegram Bot Komutları (Apex Core S-Tier Uyumlu)
bot.start((ctx) => {
    const userName = ctx.from.first_name || 'Operatör';
    ctx.reply(`🌌 Merhaba ${userName}! Apex Core S-Tier sistemine hoş geldin.\n\nAşağıdaki butona tıklayarak hemen siber çekirdeği çalıştırmaya ve APEX puanları toplamaya başla!`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "💻 Konsolu Aç & Oyna", web_app: { url: "https://farm-game-production-b1cb.up.railway.app" } }],
                [{ text: "📢 Duyuru Kanalı", url: "https://t.me/tin_farm_adventure" }, { text: "💬 Sohbet Grubu", url: "https://t.me/tiny_farm_sohbet" }]
            ]
        }
    });
});

bot.command('market', (ctx) => {
    ctx.reply("🛒 Çekirdek yükseltmeleri ve sistem soğutma modülleri yakında aktif! Oyunu açarak anlık verimliliğini kontrol edebilirsin.");
});

// Express sunucusunu önce ayağa kaldırıyoruz (Railway port health-check için bunu ister)
app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda başarıyla çalışıyor.`);
    
    // Sunucu açıldıktan sonra botu başlatıyoruz
    bot.launch().then(() => {
        console.log("Telegram botu başarıyla başlatıldı ve komutları dinliyor!");
    }).catch(err => {
        console.error("Bot başlatılırken hata oluştu:", err);
    });
});

// Otomatik Kanal/Grup Duyuru Sistemi (Her 1 saatte bir)
setInterval(async () => {
    try {
        await bot.telegram.sendMessage(CHANNEL_ID, "📢 **Sistem Bülteni:** \nÇekirdek kapasiteleri doldu! Enerjini yenilemek, kritik vuruşlar yapmak ve sıralamada zirveye yerleşmek için terminale bağlan! 🚀", {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "⚡ Konsola Dön", web_app: { url: "https://farm-game-production-b1cb.up.railway.app" } }]
                ]
            }
        });
        console.log("Otomatik duyuru kanala gönderildi.");
    } catch (e) {
        console.log("Duyuru gönderilemedi:", e.message);
    }
}, 60 * 60 * 1000);

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
