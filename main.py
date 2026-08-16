import os
import threading
from flask import Flask, send_from_directory

# 1. Flask Ayarları
app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')

@app.route('/')
def index():
    return send_from_directory(PUBLIC_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(PUBLIC_DIR, path)

# 2. Telegram Botunu Başlatan Fonksiyon
def run_telegram_bot():
    try:
        # Buraya kendi bot kodunu yazacaksın (Örn: bot.infinity_polling())
        print("Telegram bot arka planda başlatıldı.")
    except Exception as e:
        print(f"Bot başlatılırken hata oluştu: {e}")

# Gunicorn veya doğrudan çalıştırma fark etmeksizin botu arka planda tetikle
bot_thread = threading.Thread(target=run_telegram_bot)
bot_thread.daemon = True
bot_thread.start()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
