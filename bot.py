import os
import time
import requests

# Token'ı GitHub ortam değişkenlerinden (Environment Variables) güvenli bir şekilde alır
TOKEN = os.getenv("TOKEN")
URL = f"https://api.telegram.org/bot{TOKEN}/"


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
          message_text = update["message"]["text"]

          print(f"Mesaj alındı: {message_text}")

          if message_text == "/start":
            send_message(
                chat_id,
                "Selam! Sanal Madenci Bot'a hoş geldin. Sistem aktif! 🚀",
            )
          else:
            send_message(
                chat_id, f"Dediklerini anladım ama henüz komut değil: {message_text}"
            )
    time.sleep(1)


if __name__ == "__main__":
  main()
