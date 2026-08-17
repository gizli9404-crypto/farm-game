const BOT_TOKEN = "BOT_FATHER_DAN_ALDIGIN_TOKEN";
const CHANNEL_ID = "@kanal_kullanici_adin"; // Örn: @sanal_miner_kanal
const ADMIN_CHAT_ID = "SENIN_TELEGRAM_ID"; // Sana özel bildirim gelmesi için

async function sendTelegram(method, data) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return await response.json();
}

async function runTests() {
    console.log("1. Kanala test mesajı gönderiliyor...");
    let channelRes = await sendTelegram('sendMessage', {
        chat_id: CHANNEL_ID,
        text: "🚨 *Yeni Duyuru:* Sanal Miner Pro kanal test mesajıdır!",
        parse_mode: "Markdown"
    });
    console.log("Kanal Sonucu:", channelRes.ok ? "Başarılı ✅" : "Hata ❌");

    console.log("\n2. Admin paneline çekim onay bildirimi simüle ediliyor...");
    let adminRes = await sendTelegram('sendMessage', {
        chat_id: ADMIN_CHAT_ID,
        text: "💰 *Yeni Çekim Talebi!*\n\nCüzdan: UQv2...81aF\nMiktar: 5,000 PEPE\nDurum: Onay Bekliyor",
        parse_mode: "Markdown"
    });
    console.log("Admin Bildirim Sonucu:", adminRes.ok ? "Başarılı ✅" : "Hata ❌");
}

runTests();
