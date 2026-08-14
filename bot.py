import os
import time
import requests

# Token'ı GitHub ortam değişkenlerinden (Environment Variables) güvenli bir şekilde alır
TOKEN = os.getenv("TOKEN")
URL = f"https://api.telegram.org/bot{TOKEN}/"

# Kullanıcı bakiyelerini tutmak için basit bir sözlük (Örn: {chat_id: bakiye})
user_balances = {}

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
  # Basit bir İngilizce kelime/karakter kontrolü
  english_words = ["hello", "hi", "balance", "send", "mining", "start"]
  return any(word in text.lower() for word in english_words)

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
        if "message" in update and "text" in update["message"]:
          chat_id = update["message"]["chat"]["id"]
          message_text = update["message"]["text"].strip()

          print(f"Mesaj alındı [{chat_id}]: {message_text}")

          # Yeni kullanıcı ise başlangıç bakiyesi tanımlayalım (Örn: 100 Coin)
          if chat_id not in user_balances:
            user_balances[chat_id] = 100.0

          # Dil kontrolü (İngilizce mi Türkçe mi?)
          english = is_english(message_text)

          # Komutlar
          if message_text == "/start" or message_text == "/baslat":
            if english:
              send_message(chat_id, "Hello! Welcome to Virtual Miner Bot. System is active! 🚀\nYour initial balance: 100 coins.")
            else:
              send_message(chat_id, "Selam! Sanal Madenci Bot'a hoş geldin. Sistem aktif! 🚀\nBaşlangıç bakiyen: 100 coin.")

          elif message_text == "/bakiye" or message_text == "/balance":
            bakiye = user_balances[chat_id]
            if english:
              send_message(chat_id, f"💰 Your current balance: {bakiye} coins.")
            else:
              send_message(chat_id, f"💰 Güncel bakiyen: {bakiye} coin.")

          elif message_text.startswith("/gonder") or message_text.startswith("/send"):
            # Örnek kullanım: /gonder [Hedef_ID] [Miktar]
            parts = message_text.split()
            if len(parts) == 3:
              try:
                hedef_id = int(parts[1])
                miktar = float(parts[2])

                if user_balances[chat_id] >= miktar and miktar > 0:
                  # Bakiyeleri güncelle
                  user_balances[chat_id] -= miktar
                  if hedef_id not in user_balances:
                    user_balances[hedef_id] = 0.0
                  user_balances[hedef_id] += miktar

                  # Gönderene bildirim
                  send_message(chat_id, f"✅ Başarılı! {hedef_id} ID'li kullanıcıya {miktar} coin gönderildi.")
                  
                  # Alıcıya bildirim
                  send_message(hedef_id, f"🎉 Hesabınıza {chat_id} ID'li kullanıcıdan {miktar} coin transfer edildi!")
                else:
                  send_message(chat_id, "❌ Yetersiz bakiye veya geçersiz miktar!")
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
