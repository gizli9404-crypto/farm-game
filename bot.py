import os
import time
import requests

# Token'ı GitHub ortam değişkenlerinden güvenli bir şekilde alır
TOKEN = os.getenv("TOKEN")
URL = f"https://api.telegram.org/bot{TOKEN}/"

# Kullanıcı bakiyelerini tutan sözlük
user_balances = {}

# SİZİN ADMIN TELEGRAM ID'NİZ (Buraya kendi Telegram ID'nizi yazabilirsiniz)
# Not: Botunuza ilk mesaj attığınızda konsolda ID'niz görünecek, oradan öğrenebilirsiniz.
ADMIN_ID = None  # İlk başta boş bırakabilirsiniz, ilk mesaj atan kişi otomatik admin olur veya kendi ID'nizi yazabilirsiniz.

def get_updates(offset=None):
  params = {"timeout": 100, "offset": offset}
  try:
    response = requests.get(URL + "getUpdates", params=params)
    return response.json()
  except Exception as e:
    print(f"Bağlantı hatası: {e}")
    return {}

def send_message(chat_id, text):
  payload = {"chat_id": chat_id, "text": text}
  try:
    requests.post(URL + "sendMessage", json=payload)
  except Exception as e:
    print(f"Mesaj gönderme hatası: {e}")

def is_english(text):
  english_words = ["hello", "hi", "balance", "send", "mining", "start"]
  return any(word in text.lower() for word in english_words)

def main():
  global ADMIN_ID
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
        if "message" in update and "text" in update["message"]:
          chat_id = update["message"]["chat"]["id"]
          message_text = update["message"]["text"].strip()
          
          # Kullanıcı adını ve ID'yi konsola yazdır (Admin olarak kimin yazdığını görmek için)
          user_name = update["message"]["from"].get("first_name", "Bilinmeyen")
          print(f"[{chat_id}] {user_name} yazdı: {message_text}")

          # Eğer sistemde hiç admin yoksa, ilk mesajı atan kişi otomatik admin olsun (isterseniz sonradan sabitleyebilirsiniz)
          if ADMIN_ID is None:
            ADMIN_ID = chat_id
            print(f">>> İLK KULLANICI ADMIN OLARAK ATANDI: {ADMIN_ID} ({user_name}) <<<")

          # Yeni kullanıcı ise başlangıç bakiyesi tanımlayalım
          if chat_id not in user_balances:
            user_balances[chat_id] = 100.0

          english = is_english(message_text)

          # Komutlar
          if message_text == "/start" or message_text == "/baslat":
            if english:
              send_message(chat_id, f"Hello! Welcome. Your ID: `{chat_id}`\nYour balance: {user_balances[chat_id]} coins.")
            else:
              send_message(chat_id, f"Selam! Sanal Madenci Bot'a hoş geldin. ID'n: `{chat_id}`\nBaşlangıç bakiyen: {user_balances[chat_id]} coin.")

          elif message_text == "/bakiye" or message_text == "/balance":
            bakiye = user_balances[chat_id]
            if english:
              send_message(chat_id, f"💰 Your balance: {bakiye} coins. (Your ID: {chat_id})")
            else:
              send_message(chat_id, f"💰 Güncel bakiyen: {bakiye} coin. (ID'n: {chat_id})")

          # SADECE ADMİNİN KULLANABİLECEĞİ PARA GÖNDERME KOMUTU
          elif message_text.startswith("/gonder") or message_text.startswith("/send"):
            if chat_id != ADMIN_ID:
              send_message(chat_id, "❌ Bu komutu kullanmaya yetkiniz yok! Sadece Admin para gönderebilir.")
            else:
              # Kullanım: /gonder [Hedef_ID] [Miktar]
              parts = message_text.split()
              if len(parts) == 3:
                try:
                  hedef_id = int(parts[1])
                  miktar = float(parts[2])

                  if miktar > 0:
                    if hedef_id not in user_balances:
                      user_balances[hedef_id] = 0.0
                    
                    user_balances[hedef_id] += miktar

                    # Admin'e bilgi
                    send_message(chat_id, f"✅ [ADMİN İŞLEMİ] {hedef_id} ID'li kullanıcıya {miktar} coin eklendi. Yeni bakiyesi: {user_balances[hedef_id]}")
                    
                    # Alıcıya bildirim
                    send_message(hedef_id, f"🎉 Tebrikler! Hesabınıza admin tarafından {miktar} coin yatırıldı! Güncel bakiyeniz: {user_balances[hedef_id]}")
                  else:
                    send_message(chat_id, "❌ Miktar 0'dan büyük olmalıdır!")
                except ValueError:
                  send_message(chat_id, "❌ Hatalı format! Kullanım: /gonder [ID] [Miktar]")
              else:
                send_message(chat_id, "❌ Eksik parametre! Kullanım: /gonder [ID] [Miktar]")

          else:
            if english:
              send_message(chat_id, f"I understood you, but it's not a command yet: {message_text}")
            else:
              send_message(chat_id, f"Dediklerini anladım ama henüz komut değil: {message_text}")

    time.sleep(1)

if __name__ == "__main__":
  main()
