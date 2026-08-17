import os
import sqlite3
import threading
from flask import Flask, jsonify, request, render_template_string
import telebot

# Bot Token ve Kanal Bilgileri
TOKEN = "8854910303:AAFre2j9IO6RKvJ8BJRoG4dZ4quD40d3LFM"  # Kendi bot tokenini buraya yaz
CHANNEL_ID = "@sanal_miner_duyuru"  # Duyuru kanalının kullanıcı adı

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)


# --- 1. VERİTABANI KURULUMU ---
def init_db():
  conn = sqlite3.connect("miner.db", check_same_thread=False)
  cursor = conn.cursor()
  # Kullanıcılar Tablosu
  cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            full_name TEXT,
            balance REAL DEFAULT 0.0,
            wallet TEXT DEFAULT ''
        )
    """)
  # Çekim Talepleri Tablosu
  cursor.execute("""
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            amount REAL,
            wallet TEXT,
            status TEXT DEFAULT 'Beklemede'
        )
    """)
  conn.commit()
  conn.close()


init_db()


# --- 2. TELEBOT / BOT KOMUTLARI ---
@bot.message_handler(commands=["start"])
def send_welcome(message):
  user = message.from_user
  user_id = user.id
  username = user.username or "Bulunmuyor"
  full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()

  # Kullanıcıyı veritabanına kaydet (Eğer yoksa)
  conn = sqlite3.connect("miner.db", check_same_thread=False)
  cursor = conn.cursor()
  cursor.execute("SELECT user_id FROM users WHERE user_id = ?", (user_id,))
  if not cursor.fetchone():
    cursor.execute(
        "INSERT INTO users (user_id, username, full_name, balance, wallet)"
        " VALUES (?, ?, ?, ?, ?)",
        (user_id, username, full_name, 0.0, ""),
    )
    conn.commit()
  conn.close()

  markup = telebot.types.InlineKeyboardMarkup()
  # WebApp linkini kendi Railway linkinle güncellemeyi unutma!
  web_app = telebot.types.WebAppInfo(
      url="https://miner-production-32ee.up.railway.app"
  )
  markup.add(
      telebot.types.InlineKeyboardButton("🚀 Sanal Miner App Aç", web_app=web_app)
  )

  bot.send_message(
      message.chat.id,
      f"Selam {full_name}! Sanal Miner Pro'ya hoş geldin. Madenciliğe"
      " başlamak için aşağıdaki buton.",
      reply_markup=markup,
  )


# --- 3. FLASK WEB ROUTES & API ---


@app.route("/")
def index():
  # Basit bir Mini App arayüzü veya HTML döndürebilirsin
  return (
      "Sanal Miner Pro Backend Çalışıyor! Bot ve Mini App Aktif.",
      200,
  )


# Çekim Talebi Oluşturma API
@app.route("/api/withdraw", methods=["POST"])
def withdraw():
  try:
    data = request.json
    user_id = data.get("user_id")
    amount = data.get("amount")
    wallet = data.get("wallet")

    if not user_id or not amount or not wallet:
      return (
          jsonify(
              {
                  "status": "error",
                  "message": "Eksik parametre gönderildi!",
              }
          ),
          400,
      )

    conn = sqlite3.connect("miner.db", check_same_thread=False)
    cursor = conn.cursor()

    # Kullanıcı adını veritabanından çek
    cursor.execute(
        "SELECT username, balance FROM users WHERE user_id = ?", (user_id,)
    )
    user_row = cursor.fetchone()

    username = user_row[0] if user_row and user_row[0] else "Bilinmiyor"

    # Çekim talebini kaydet
    cursor.execute(
        "INSERT INTO withdrawals (user_id, username, amount, wallet, status)"
        " VALUES (?, ?, ?, ?, ?)",
        (user_id, username, amount, wallet, "Beklemede"),
    )
    conn.commit()
    conn.close()

    # Kanala otomatik bildirim at
    msg = (
        f"🚨 **Yeni Çekim Talebi!**\n\n"
        f"👤 Kullanıcı: @{username} (ID: `{user_id}`)\n"
        f"💰 Miktar: `{amount}` PEPE\n"
        f"💳 Cüzdan: `{wallet}`\n"
        f"⏳ Durum: Beklemede"
    )
    try:
      bot.send_message(CHANNEL_ID, msg, parse_mode="Markdown")
    except Exception as ex:
      print(f"Kanal mesajı gönderilemedi: {ex}")

    return (
        jsonify(
            {
                "status": "success",
                "message": "Çekim talebiniz başarıyla alındı ve kanala bildirildi.",
            }
        ),
        200,
    )
  except Exception as e:
    return jsonify({"status": "error", "message": str(e)}), 400


# --- 4. GELİŞMİŞ ADMIN PANELİ APİ'LERİ ---


# Tüm kullanıcıları, ID'lerini, isimlerini, cüzdanlarını ve bakiyelerini listeleyen admin API
@app.route("/api/admin/users", methods=["GET"])
def admin_users():
  secret = request.args.get("secret")
  if secret != "SizinGucluSifreniz123":  # Güvenlik şifren
    return jsonify({"error": "Yetkisiz erişim!"}), 403

  conn = sqlite3.connect("miner.db", check_same_thread=False)
  cursor = conn.cursor()
  cursor.execute(
      "SELECT user_id, username, full_name, balance, wallet FROM users"
  )
  rows = cursor.fetchall()
  conn.close()

  users_list = []
  for row in rows:
    users_list.append({
        "user_id": row[0],
        "username": row[1],
        "full_name": row[2],
        "balance": row[3],
        "wallet": row[4],
    })
  return jsonify(users_list), 200


# Tüm çekim taleplerini listeleyen admin API
@app.route("/api/admin/withdrawals", methods=["GET"])
def admin_withdrawals():
  secret = request.args.get("secret")
  if secret != "SizinGucluSifreniz123":
    return jsonify({"error": "Yetkisiz erişim!"}), 403

  conn = sqlite3.connect("miner.db", check_same_thread=False)
  cursor = conn.cursor()
  cursor.execute(
      "SELECT id, user_id, username, amount, wallet, status FROM withdrawals"
  )
  rows = cursor.fetchall()
  conn.close()

  withdrawals_list = []
  for row in rows:
    withdrawals_list.append({
        "id": row[0],
        "user_id": row[1],
        "username": row[2],
        "amount": row[3],
        "wallet": row[4],
        "status": row[5],
    })
  return jsonify(withdrawals_list), 200


# --- 5. BOT POLLING (ARKA PLAN THREAD) ---
def run_bot():
  try:
    bot.infinity_polling(none_stop=True)
  except Exception as e:
    print(f"Bot polling hatası: {e}")


if __name__ == "__main__":
  # Telegram botunu ayrı bir thread'de (arkaplanda) başlatıyoruz
  bot_thread = threading.Thread(target=run_bot)
  bot_thread.daemon = True
  bot_thread.start()

  # Flask uygulamasını Railway'in atadığı port üzerinden başlatıyoruz
  port = int(os.environ.get("PORT", 5000))
  app.run(host="0.0.0.0", port=port)
