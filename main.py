import os
import sqlite3
import threading
from flask import Flask, jsonify, request, render_template
import telebot

# Bot Token ve Kanal Bilgileri
TOKEN = "8854910303:AAFre2j9IO6RKvJ8BJRoG4dZ4quD40d3LFM"
CHANNEL_ID = "@sanal_miner_duyuru"

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__, template_folder='public')

# --- 1. VERİTABANI KURULUMU ---
def init_db():
    conn = sqlite3.connect('miner.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            full_name TEXT,
            balance REAL DEFAULT 0.0,
            tickets INTEGER DEFAULT 0,
            wallet TEXT DEFAULT ''
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            amount REAL,
            wallet TEXT,
            status TEXT DEFAULT 'Beklemede'
        )
    ''')
    # Reklam aktivitelerini takip etmek için yeni tablo
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ad_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            reward REAL
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# --- 2. TELEBOT / BOT KOMUTLARI ---
@bot.message_handler(commands=['start'])
def send_welcome(message):
    user = message.from_user
    user_id = user.id
    username = user.username or "Bulunmuyor"
    full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    
    conn = sqlite3.connect('miner.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute('SELECT user_id FROM users WHERE user_id = ?', (user_id,))
    if not cursor.fetchone():
        cursor.execute('INSERT INTO users (user_id, username, full_name, balance, tickets, wallet) VALUES (?, ?, ?, ?, ?, ?)', 
                       (user_id, username, full_name, 0.0, 0, ""))
        conn.commit()
    conn.close()
    
    markup = telebot.types.InlineKeyboardMarkup()
    web_app = telebot.types.WebAppInfo(url="https://miner-production-32ee.up.railway.app")
    markup.add(telebot.types.InlineKeyboardButton("🚀 Sanal Miner App Aç", web_app=web_app))
    
    bot.send_message(
        message.chat.id, 
        f"Selam {full_name}! Sanal Miner Pro'ya hoş geldin. Madenciliğe başlamak için aşağıdaki butona tıkla:", 
        reply_markup=markup
    )

# --- 3. FLASK WEB ROUTES & API ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/admin.html')
def admin_page():
    return render_template('admin.html')

@app.route('/api/user/<int:user_id>', methods=['GET'])
def get_user(user_id):
    conn = sqlite3.connect('miner.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute('SELECT balance, tickets FROM users WHERE user_id = ?', (user_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return jsonify({"balance": row[0], "tickets": row[1]}), 200
    return jsonify({"balance": 0.0, "tickets": 0}), 200

@app.route('/api/user/update', methods=['POST'])
def update_user():
    try:
        data = request.json
        user_id = data.get('telegram_id')
        balance = data.get('balance')
        tickets = data.get('tickets')
        
        if not user_id:
            return jsonify({"status": "error", "message": "Kullanıcı ID bulunamadı!"}), 400
            
        conn = sqlite3.connect('miner.db', check_same_thread=False)
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users SET balance = COALESCE(?, balance), tickets = COALESCE(?, tickets)
            WHERE user_id = ?
        ''', (balance, tickets, user_id))
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "message": "Güncellendi"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

# Reklam izlendiğinde tetiklenecek örnek API (Uygulamanızdan buraya istek atabilirsiniz)
@app.route('/api/ad/watched', methods=['POST'])
def ad_watched():
    try:
        data = request.json
        user_id = data.get('user_id')
        reward = data.get('reward', 0.5)
        
        conn = sqlite3.connect('miner.db', check_same_thread=False)
        cursor = conn.cursor()
        
        cursor.execute('SELECT username FROM users WHERE user_id = ?', (user_id,))
        user_row = cursor.fetchone()
        username = user_row[0] if user_row and user_row[0] else "Bilinmiyor"
        
        # Reklam aktivitesini kaydet
        cursor.execute('INSERT INTO ad_activity (user_id, username, reward) VALUES (?, ?, ?)', (user_id, username, reward))
        # Kullanıcı bakiyesini artır
        cursor.execute('UPDATE users SET balance = balance + ? WHERE user_id = ?', (reward, user_id))
        
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Ödül eklendi"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/withdraw', methods=['POST'])
def withdraw():
    try:
        data = request.json
        user_id = data.get('user_id')
        amount = data.get('amount')
        wallet = data.get('wallet')
        
        if not user_id or not amount or not wallet:
            return jsonify({"status": "error", "message": "Eksik parametre!"}), 400
        
        conn = sqlite3.connect('miner.db', check_same_thread=False)
        cursor = conn.cursor()
        
        cursor.execute('SELECT username FROM users WHERE user_id = ?', (user_id,))
        user_row = cursor.fetchone()
        username = user_row[0] if user_row and user_row[0] else "Bilinmiyor"
        
        cursor.execute('INSERT INTO withdrawals (user_id, username, amount, wallet, status) VALUES (?, ?, ?, ?, ?)',
                       (user_id, username, amount, wallet, "Beklemede"))
        conn.commit()
        conn.close()
        
        msg = (f"🚨 **Yeni Çekim Talebi!**\n\n"
               f"👤 Kullanıcı: @{username} (ID: `{user_id}`)\n"
               f"💰 Miktar: `{amount}` PEPE\n"
               f"💳 Cüzdan: `{wallet}`\n"
               f"⏳ Durum: Beklemede")
        try:
            bot.send_message(CHANNEL_ID, msg, parse_mode="Markdown")
        except Exception as ex:
            print(f"Kanal mesajı hatası: {ex}")
            
        return jsonify({"status": "success", "message": "Çekim talebiniz başarıyla alındı."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

# --- 4. ADMIN PANELİ APİ'LERİ ---
SECRET_KEY = "SizinGucluSifreniz123" # Güvenliğiniz için burayı değiştirebilirsiniz

@app.route('/api/admin/users', methods=['GET'])
def admin_users():
    if request.args.get('secret') != SECRET_KEY:
        return jsonify({"error": "Yetkisiz erişim!"}), 403
    
    conn = sqlite3.connect('miner.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute('SELECT user_id, username, full_name, balance, tickets, wallet FROM users')
    rows = cursor.fetchall()
    conn.close()
    
    return jsonify([{"user_id": r[0], "username": r[1], "full_name": r[2], "balance": r[3], "tickets": r[4], "wallet": r[5]} for r in rows]), 200

@app.route('/api/admin/withdrawals', methods=['GET'])
def admin_withdrawals():
    if request.args.get('secret') != SECRET_KEY:
        return jsonify({"error": "Yetkisiz erişim!"}), 403
    
    conn = sqlite3.connect('miner.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute('SELECT id, user_id, username, amount, wallet, status FROM withdrawals')
    rows = cursor.fetchall()
    conn.close()
    
    return jsonify([{"id": r[0], "user_id": r[1], "username": r[2], "amount": r[3], "wallet": r[4], "status": r[5]} for r in rows]), 200

# Anlık reklam izleme loglarını çeken API
@app.route('/api/admin/ads', methods=['GET'])
def admin_ads():
    if request.args.get('secret') != SECRET_KEY:
        return jsonify({"error": "Yetkisiz erişim!"}), 403
        
    conn = sqlite3.connect('miner.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute('SELECT id, user_id, username, timestamp, reward FROM ad_activity ORDER BY id DESC LIMIT 50')
    rows = cursor.fetchall()
    conn.close()
    
    return jsonify([{"id": r[0], "user_id": r[1], "username": r[2], "timestamp": r[3], "reward": r[4]} for r in rows]), 200

# Admin panelinden kullanıcı bakiyesini doğrudan güncelleme API'si
@app.route('/api/admin/update_balance', methods=['POST'])
def admin_update_balance():
    data = request.json
    if data.get('secret') != SECRET_KEY:
        return jsonify({"error": "Yetkisiz erişim!"}), 403
        
    user_id = data.get('user_id')
    new_balance = data.get('balance')
    
    try:
        conn = sqlite3.connect('miner.db', check_same_thread=False)
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET balance = ? WHERE user_id = ?', (new_balance, user_id))
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Bakiye güncellendi"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

# --- 5. BOT POLLING ---
def run_bot():
    try:
        bot.infinity_polling(none_stop=True)
    except Exception as e:
        print(f"Bot polling hatası: {e}")

if __name__ == '__main__':
    bot_thread = threading.Thread(target=run_bot)
    bot_thread.daemon = True
    bot_thread.start()
    
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
