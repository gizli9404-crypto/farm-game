import os
import telebot
from flask import Flask, send_from_directory

TOKEN = os.environ.get('BOT_TOKEN', 'BURAYA_BOT_TOKEN_YAZABİLİRSİN')
bot = telebot.TeleBot(TOKEN)
app = Flask(__name__, static_folder='public', static_url_path='')

@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('public', path)

# Telegram'dan /start komutu gelince çalışacak kısım
@bot.message_handler(commands=['start'])
def send_welcome(message):
    bot.reply_to(message, "Sanal Miner Pro'ya hoş geldin! Aşağıdaki butondan Mini App'i açabilirsin.")

# Flask ve botu aynı anda başlatmak için webhook yerine basit bir polling (veya temel yanıt) yapısı kuruyoruz
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    # Botu arka planda dinlemesi için Railway web sunucusu ile tetikliyoruz
    app.run(host='0.0.0.0', port=port)
