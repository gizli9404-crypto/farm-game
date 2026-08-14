import json
import os
import time
import requests

TOKEN = os.getenv("TOKEN")
LOG_CHANNEL_ID = os.getenv("LOG_CHANNEL_ID", "-1001234567890") 
URL = f"https://api.telegram.org/bot{TOKEN}/"

# Admin ID listesi (Hem sayı hem metin olarak tanımlandı)
ADMIN_IDS = [825653395, "825653395"]
DATA_FILE = "bakiye.json"

def load_data():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

def get_updates(offset=None):
    params = {"timeout": 100, "offset": offset}
    try:
        response = requests.get(URL + "getUpdates", params=params)
        return response.json()
    except Exception as e:
        print(f"Bağlantı hatası: {e}")
        return {}

def send_message(chat_id, text, reply_markup=None):
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        requests.post(URL + "sendMessage", json=payload)
    except Exception as e:
        print(f"Mesaj gönderme hatası: {e}")

def answer_callback_query(callback_query_id, text=""):
    payload = {"callback_query_id": callback_query_id, "text": text}
    try:
        requests.post(URL + "answerCallbackQuery", json=payload)
    except Exception as e:
        print(f"Callback yanıt hatası: {e}")

TRANSLATIONS = {
    "tr": {
        "welcome": "🚀 <b>Sanal Miner Pro</b>'ya hoş geldin!\nAşağıdan dilini seç ve madenciliğe başla:",
        "balance": "💰 <b>Güncel Bakiyeniz:</b> {balance} PTS\n🆔 <b>ID'niz:</b> <code>{chat_id}</code>",
        "lang_set": "🇹🇷 Dil Türkçe olarak ayarlandı!",
        "admin_welcome": "👑 <b>Hoş geldin Patron / Admin!</b>\nSistem seni yönetici olarak tanıdı.\n\n⚙️ <b>Admin Komutları:</b>\n• /gonder [ID] [Miktar] - Bakiye yükle\n• /aktif - Toplam kullanıcıları tara\n• /talepler - Bekleyen çekim taleplerini tara",
        "admin_only": "❌ Bu komutu kullanmaya yetkiniz yok!"
    },
    "en": {
        "welcome": "🚀 Welcome to <b>Sanal Miner Pro</b>!\nChoose your language below and start mining:",
        "balance": "💰 <b>Your Balance:</b> {balance} PTS\n🆔 <b>Your ID:</b> <code>{chat_id}</code>",
        "lang_set": "🇬🇧 Language set to English!",
        "admin_welcome": "👑 <b>Welcome Admin!</b>\nSystem recognized you as an administrator.",
        "admin_only": "❌ You are not authorized!"
    },
    "ar": {
        "welcome": "🚀 أهلاً بك في <b>Sanal Miner Pro</b>!\nاختر لغتك أدناه وابدأ التعدين:",
        "balance": "💰 <b>رصيدك الحالي:</b> {balance} PTS\n🆔 <b>معرفك:</b> <code>{chat_id}</code>",
        "lang_set": "🇸🇦 تم تغيير اللغة إلى العربية!",
        "admin_welcome": "👑 <b>أهلاً بك يا مدير!</b>\nتم التعرف عليك كمسؤول عن النظام.",
        "admin_only": "❌ ليس لديك صلاحية!"
    }
}

def is_admin(chat_id):
    # Gelen ID ister int ister str olsun, yöneticiler listesinde kesin olarak eşleştirir
    return chat_id in ADMIN_IDS or str(chat_id) in ADMIN_IDS or int(chat_id) == 825653395

def main():
    if not TOKEN:
        print("HATA: TOKEN bulunamadı!")
        return

    print("Bot tam sürüm ve kesin admin korumasıyla çalışıyor...")
    offset = None
    while True:
        users_data = load_data()
        updates = get_updates(offset)
        
        if "result" in updates:
            for update in updates["result"]:
                offset = update["update_id"] + 1

                if "callback_query" in update:
                    cq = update["callback_query"]
                    cq_id = cq["id"]
                    chat_id_str = str(cq["message"]["chat"]["id"])
                    chat_id_int = cq["message"]["chat"]["id"]
                    data = cq["data"]
                    
                    if chat_id_str not in users_data:
                        users_data[chat_id_str] = {"balance": 100.0, "lang": "tr"}

                    if data in ["lang_tr", "lang_en", "lang_ar"]:
                        lang = data.split("_")[1]
                        users_data[chat_id_str]["lang"] = lang
                        save_data(users_data)
                        
                        answer_callback_query(cq_id, TRANSLATIONS[lang]["lang_set"])
                        
                        if is_admin(chat_id_int):
                            send_message(chat_id_int, TRANSLATIONS[lang]["admin_welcome"])
                        else:
                            bal = users_data[chat_id_str]["balance"]
                            send_message(chat_id_int, TRANSLATIONS[lang]["balance"].format(balance=bal, chat_id=chat_id_str))

                    continue

                if "message" in update and "text" in update["message"]:
                    chat_id = update["message"]["chat"]["id"]
                    chat_id_str = str(chat_id)
                    message_text = update["message"]["text"].strip()

                    if chat_id_str not in users_data:
                        users_data[chat_id_str] = {"balance": 100.0, "lang": "tr"}
                        save_data(users_data)

                    lang = users_data[chat_id_str]["lang"]

                    if message_text.startswith("/start"):
                        if is_admin(chat_id):
                            send_message(chat_id, TRANSLATIONS[lang]["admin_welcome"])
                        else:
                            keyboard = {
                                "inline_keyboard": [
                                    [
                                        {"text": "🇹🇷 Türkçe", "callback_data": "lang_tr"},
                                        {"text": "🇬🇧 English", "callback_data": "lang_en"},
                                        {"text": "🇸🇦 العربية", "callback_data": "lang_ar"}
                                    ]
                                ]
                            }
                            send_message(chat_id, TRANSLATIONS[lang]["welcome"], reply_markup=keyboard)

                    elif message_text in ["/bakiye", "/balance"]:
                        bal = users_data[chat_id_str]["balance"]
                        send_message(chat_id, TRANSLATIONS[lang]["balance"].format(balance=bal, chat_id=chat_id_str))

                    elif message_text == "/aktif":
                        if not is_admin(chat_id):
                            send_message(chat_id, TRANSLATIONS[lang]["admin_only"])
                        else:
                            toplam_kullanici = len(users_data)
                            aktif_liste = f"📊 <b>Sistem Tarama Raporu</b>\n\n👥 Toplam Kayıtlı Kullanıcı: <b>{toplam_kullanici}</b>\n✅ Sistem aktif ve kusursuz çalışıyor."
                            send_message(chat_id, aktif_liste)

                    elif message_text == "/talepler":
                        if not is_admin(chat_id):
                            send_message(chat_id, TRANSLATIONS[lang]["admin_only"])
                        else:
                            send_message(chat_id, "📥 <b>Tarama Tamamlandı:</b> Şu an bekleyen yeni bir çekim talebi bulunmuyor.")

                    elif message_text.startswith("/cekim"):
                        parts = message_text.split()
                        if len(parts) >= 2:
                             miktar = parts[1]
                             log_text = f"💸 <b>Yeni Çekim Talebi!</b>\n👤 Kullanıcı ID: <code>{chat_id}</code>\n💰 Miktar: {miktar} PTS\n⏳ Durum: Bekliyor..."
                             send_message(LOG_CHANNEL_ID, log_text)
                             send_message(chat_id, "✅ Çekim talebiniz onay için gönderildi!")

                    elif message_text.startswith("/gonder"):
                        if not is_admin(chat_id):
                            send_message(chat_id, TRANSLATIONS[lang]["admin_only"])
                        else:
                            parts = message_text.split()
                            if len(parts) == 3:
                                try:
                                    hedef_id_str = str(int(parts[1]))
                                    miktar = float(parts[2])
                                    if hedef_id_str not in users_data:
                                        users_data[hedef_id_str] = {"balance": 0.0, "lang": "tr"}
                                    
                                    users_data[hedef_id_str]["balance"] += miktar
                                    save_data(users_data)
                                    
                                    send_message(chat_id, f"✅ Başarılı! {hedef_id_str} ID'sine {miktar} PTS eklendi.")
                                    send_message(int(hedef_id_str), f"🎉 Hesabınıza {miktar} PTS eklendi!")
                                    
                                    log_text = f"🎉 <b>Ödeme / Kazanç Dağıtıldı!</b>\n👤 Kullanıcı: <code>{hedef_id_str}</code>\n💎 Tutar: <b>{miktar} PTS</b>"
                                    send_message(LOG_CHANNEL_ID, log_text)
                                except:
                                    send_message(chat_id, "❌ Hatalı format! Kullanım: /gonder [ID] [Miktar]")

        time.sleep(1)

if __name__ == "__main__":
    main()
