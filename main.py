import os
import threading
from flask import Flask, send_from_directory, request, jsonify
import telebot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

# --- AYARLAR ---
TOKEN = "8854910303:AAFr2j9I06RKv8BJROg4DZd4qud3LFM"
ADMIN_ID = "8256539395" # Senin Telegram ID'n
CHANNEL_ID = "@sanal_miner_duyuru" # Kanalın kullanıcı adı
bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# --- TELEGRAM BOT MANTIĞI ---
@bot.message_handler(commands=['start'])
def send_welcome(message):
    markup = InlineKeyboardMarkup()
    web_app = WebAppInfo(url="https://miner-production-32ee.up.railway.app/")
    markup.add(InlineKeyboardButton("🚀 Sanal Miner App Aç", web_app=web_app))
    bot.reply_to(message, "Hoş geldin! Madenciliğe başlamak için uygulamayı aç:", reply_markup=markup)

# Onaylama/Reddetme Butonları (Callback)
@bot.callback_query_handler(func=lambda call: True)
def callback_query(call):
    if call.data.startswith("approve_"):
        _, user_id, amount = call.data.split("_")
        bot.send_message(call.message.chat.id, f"✅ Çekim onaylandı! Kullanıcıya bildirildi.")
        # Kanala ödeme kanıtı gönder
        bot.send_message(CHANNEL_ID, f"🎉 Ödeme Yapıldı!\n\nKullanıcı: {user_id}\nMiktar: {amount} PEPE\nDurum: ✅ Ödendi")
        bot.send_message(user_id, f"✅ Tebrikler! {amount} PEPE çekim talebin onaylandı ve hesabına gönderildi.")

def run_telegram_bot():
    print("Telegram bot başlatılıyor...")
    bot.infinity_polling(skip_pending=True)

# --- FLASK WEB SUNUCUSU ---
@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('public', path)

# Çekim talebi API'si
@app.route('/api/withdraw', methods=['POST'])
def withdraw():
    data = request.json
    user_id = data.get('user_id')
    amount = data.get('amount')
    wallet = data.get('wallet')

    # Admin'e onay için gönder
    markup = InlineKeyboardMarkup()
    markup.add(InlineKeyboardButton("✅ Onayla", callback_data=f"approve_{user_id}_{amount}"))
    
    bot.send_message(ADMIN_ID, f"🔔 YENİ ÇEKİM TALEBİ\n\nKullanıcı ID: {user_id}\nMiktar: {amount} PEPE\nCüzdan: {wallet}", reply_markup=markup)
    return jsonify({"status": "success"})

# Botu arka planda başlat
if __name__ == "__main__":
    bot_thread = threading.Thread(target=run_telegram_bot)
    bot_thread.daemon = True
    bot_thread.start()
    
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
