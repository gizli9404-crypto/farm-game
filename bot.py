import os
import time
import requests

# Token'ı GitHub ortam değişkenlerinden alır
TOKEN = os.getenv("TOKEN")
URL = f"https://api.telegram.org/bot{TOKEN}/"

# Kullanıcı verileri: {chat_id: {"balance": 100.0, "lang": "tr"}}
users_data = {}

# SİZE ÖZEL SABİT ANOMALİ/ANA ADMİN ID (Ekran görüntüsündeki ID'niz)
ADMIN_IDS = [825653395]

def get_updates(offset=None):
  params = {"timeout": 100, "offset": offset}
  try:
    response = requests.get(URL + "getUpdates", params=params)
    return response.json()
  except Exception as e:
    print(f"Bağlantı hatası: {e}")
    return {}

def send_message(chat_id, text, reply_markup=None):
  payload = {"chat_id": chat_id, "text": text}
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

def main():
  if not TOKEN:
    print("HATA: TOKEN bulunamadı! Lütfen ortam değişkenlerini kontrol edin.")
    return

  print("Bot çalışıyor ve mesajlar bekleniyor...")
  offset = None
  while True:
    updates = get_updates(offset)
    if "result" in updates:
      for update in updates["result"]:
        offset = update["update_id"] + 1

        # 1. BUTON TIKLAMALARI (CALLBACK QUERY)
        if "callback_query" in update:
          cq = update["callback_query"]
          cq_id = cq["id"]
          chat_id = cq["message"]["chat"]["id"]
          data = cq["data"]
          
          if chat_id not in users_data:
            users_data[chat_id] = {"balance": 100.0, "lang": "tr"}

          if data == "lang_tr":
            users_data[chat_id]["lang"] = "tr"
            answer_callback_query(cq_id, "Dil Türkçe olarak ayarlandı! 🇹🇷")
            send_message(chat_id, f"🇹🇷 Dil Türkçe seçildi.\n🆔 ID'niz: `{chat_id}`\n💰 Bakiyeniz: {users_data[chat_id]['balance']} coin")
          elif data == "lang_en":
            users_data[chat_id]["lang"] = "en"
            answer_callback_query(cq_id, "Language set to English! 🇬🇧")
            send_message(chat_id, f"🇬🇧 Language set to English.\n🆔 Your ID: `{chat_id}`\n💰 Your Balance: {users_data[chat_id]['balance']} coins")

          continue

        # 2. NORMAL MESAJLAR
        if "message" in update and "text" in update["message"]:
          chat_id = update["message"]["chat"]["id"]
          message_text = update["message"]["text"].strip()
          user_name = update["message"]["from"].get("first_name", "Bilinmeyen")

          if chat_id not in users_data:
            users_data[chat_id] = {"balance": 100.0, "lang": "tr"}

          lang = users_data[chat_id]["lang"]
          print(f"[{chat_id}] ({user_name}) Yazdı: {message_text}")

          # Komutlar
          if message_text in ["/start", "/baslat"]:
            # İnteraktif Dil Seçim Butonları
            keyboard = {
              "inline_keyboard": [
                [
                  {"text": "🇹🇷 Türkçe", "callback_data": "lang_tr"},
                  {"text": "🇬🇧 English", "callback_data": "lang_en"}
                ]
              ]
            }
            welcome_text = (
              "Lütfen dil seçiniz / Please select your language:"
              if lang == "en"
              else "Lütfen dilinizi seçiniz:"
            )
            send_message(chat_id, welcome_text, reply_markup=keyboard)

          elif message_text in ["/bakiye", "/balance"]:
            bakiye = users_data[chat_id]["balance"]
            if lang == "en":
              send_message(chat_id, f"💰 Your Balance: {bakiye} coins\n🆔 Your ID: {chat_id}")
            else:
              send_message(chat_id, f"💰 Güncel Bakiyeniz: {bakiye} coin\n🆔 ID'niz: {chat_id}")

          # SADECE SİZİN KULLANABİLECEĞİNİZ /gonder KOMUTU
          elif message_text.startswith("/gonder") or message_text.startswith("/send"):
            if chat_id not in ADMIN_IDS:
              msg = "❌ You are not authorized!" if lang == "en" else "❌ Bu komutu kullanmaya yetkiniz yok!"
              send_message(chat_id, msg)
            else:
              parts = message_text.split()
              if len(parts) == 3:
                try:
                  hedef_id = int(parts[1])
                  miktar = float(parts[2])

                  if miktar > 0:
                    if hedef_id not in users_data:
                      users_data[hedef_id] = {"balance": 0.0, "lang": "tr"}
                    
                    users_data[hedef_id]["balance"] += miktar
                    hedef_lang = users_data[hedef_id]["lang"]

                    # Size bildirim
                    send_message(chat_id, f"✅ [ADMİN] {hedef_id} ID'li kullanıcıya {miktar} coin gönderildi. Yeni bakiye: {users_data[hedef_id]['balance']}")
                    
                    # Alıcıya bildirim (Kendi dilinde)
                    if hedef_lang == "en":
                      send_message(hedef_id, f"🎉 Congratulations! {miktar} coins have been added to your account by admin.")
                    else:
                      send_message(hedef_id, f"🎉 Tebrikler! Hesabınıza admin tarafından {miktar} coin eklendi.")
                  else:
                    send_message(chat_id, "❌ Miktar 0'dan büyük olmalıdır!")
                except ValueError:
                  send_message(chat_id, "❌ Hatalı format! Kullanım: /gonder [ID] [Miktar]")
              else:
                send_message(chat_id, "❌ Eksik parametre! Kullanım: /gonder [ID] [Miktar]")

          # BAŞKA BİR ID'Yİ ADMİN YAPMA KOMUTU (Sadece sizin ID'niz kullanabilir)
          elif message_text.startswith("/admin_yap"):
            if chat_id not in ADMIN_IDS:
              send_message(chat_id, "❌ Bu komut sadece ana yöneticiye aittir!")
            else:
              parts = message_text.split()
              if len(parts) == 2:
                try:
                  yeni_admin_id = int(parts[1])
                  if yeni_admin_id not in ADMIN_IDS:
                    ADMIN_IDS.append(yeni_admin_id)
                    send_message(chat_id, f"👑 Başarılı! {yeni_admin_id} ID'li kullanıcı artık yönetici (admin) yapıldı.")
                    send_message(yeni_admin_id, "👑 Tebrikler! Artık bu botta yönetici (admin) yetkisine sahipsiniz.")
                  else:
                    send_message(chat_id, "⚠️ Bu kullanıcı zaten admin.")
                except ValueError:
                  send_message(chat_id, "❌ Geçersiz ID formatı! Kullanım: /admin_yap [ID]")
              else:
                send_message(chat_id, "❌ Eksik parametre! Kullanım: /admin_yap [ID]")

          else:
            if lang == "en":
              send_message(chat_id, f"I didn't understand that command: {message_text}")
            else:
              send_message(chat_id, f"Dediklerini anladım ama henüz komut değil: {message_text}")

    time.sleep(1)

if __name__ == "__main__":
  main()
