import os
import threading
from flask import Flask, send_from_directory
import telebot

# --- TELEGRAM BOT AYARLARI ---
TOKEN = "8854910303:AAH1tF_zCo_B2RKBdE8HQs9apvtxF_rM5TI"
bot = telebot.TeleBot(TOKEN)

@bot.message_handler(commands=['start'])
def send_welcome(message):
    markup = telebot.types.InlineKeyboardMarkup()
    # Mini App'i açan buton
    web_app = telebot.types.WebAppInfo(url="https://miner-production-32ee.up.railway.app/")
    markup.add(telebot.types.InlineKeyboardButton("🚀 Sanal Miner App Aç", web_app=web_app))
    
    bot.reply_to(message, "Hoş geldin! Aşağıdaki butona tıklayarak Sanal Miner uygulamasını açabilirsin:", reply_markup=markup)

def run_telegram_bot():
    try:
        print("Telegram bot başlatılıyor...")
        bot.infinity_polling(skip_pending=True)
    except Exception as e:
        print(f"Bot çalışırken hata oluştu: {e}")

# --- FLASK WEB SUNUCUSU AYARLARI ---
app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')

@app.route('/')
def index():
    return send_from_directory(PUBLIC_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(PUBLIC_DIR, path)

# Botu arka planda (Thread ile) başlatıyoruz
bot_thread = threading.Thread(target=run_telegram_bot)
bot_thread.daemon = True
bot_thread.start()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
