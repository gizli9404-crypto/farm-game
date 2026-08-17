from flask import Flask, send_from_directory, request, jsonify
import os
import threading
import telebot

TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', 'SENIN_BOT_TOKENINI_BURAYA_YAZ')
bot = telebot.TeleBot(TOKEN)

app = Flask(__name__, static_folder='public')
withdraw_requests = []

# --- TELEGRAM BOT KOMUTLARI ---
@bot.message_handler(commands=['start'])
def send_welcome(message):
    markup = telebot.types.InlineKeyboardMarkup()
    # Mini uygulamanın web sitesi linkini buraya yaz
    web_app = telebot.types.WebAppInfo(url="https://miner-production-32ee.up.railway.app/")
    markup.add(telebot.types.InlineKeyboardButton(text="🚀 Sanal Miner App Aç", web_app=web_app))
    
    bot.reply_to(message, "Sanal Miner Pro'ya hoş geldin! Aşağıdaki butona tıklayarak madenciliğe başlayabilirsin.", reply_markup=markup)

# Botu arka planda (ayrı bir thread içinde) çalıştır
def run_bot():
    try:
        bot.infinity_polling()
    except Exception as e:
        print(f"Bot hatası: {e}")

# --- FLASK WEB ROTALARI ---
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/admin')
def serve_admin():
    return send_from_directory(app.static_folder, 'admin.html')

@app.route('/api/withdraw', methods=['POST'])
def withdraw():
    try:
        data = request.json
        user_id = data.get('user_id')
        amount = data.get('amount')
        wallet = data.get('wallet')
        
        withdraw_request_item = {
            "user_id": user_id,
            "amount": amount,
            "wallet": wallet,
            "status": "Beklemede"
        }
        withdraw_requests.append(withdraw_request_item)
        return jsonify({"status": "success", "message": "Çekim talebi alındı."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/admin/withdrawals', methods=['GET'])
def get_withdrawals():
    secret = request.args.get('secret')
    if secret != "SizinGucluSifreniz123":
        return jsonify({"error": "Yetkisiz erişim!"}), 403
    return jsonify(withdraw_requests), 200

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

# Program başladığında Telegram botunu arka planda başlat
if __name__ == '__main__':
    bot_thread = threading.Thread(target=run_bot)
    bot_thread.daemon = True
    bot_thread.start()

    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
