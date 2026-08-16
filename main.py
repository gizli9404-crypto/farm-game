from flask import Flask, send_from_directory, request, jsonify
import os

app = Flask(__name__, static_folder='public')

# Çekim taleplerini geçici olarak hafızada tutmak için liste (İleride veritabanına bağlayabilirsin)
withdraw_requests = []

# Ana sayfa (Mini uygulama index.html'i açar)
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

# Admin Paneli Sayfası (public/admin.html dosyasını açar)
@app.route('/admin')
def serve_admin():
    return send_from_directory(app.static_folder, 'admin.html')

# Çekim talebi alma API'si (Mini uygulamadan buraya istek atılır)
@app.route('/api/withdraw', methods=['POST'])
def withdraw():
    try:
        data = request.json
        user_id = data.get('user_id')
        amount = data.get('amount')
        wallet = data.get('wallet')
        
        # Gelen talebi listeye kaydedelim
        withdraw_request_item = {
            "user_id": user_id,
            "amount": amount,
            "wallet": wallet,
            "status": "Beklemede"
        }
        withdraw_requests.append(withdraw_request_item)
        
        print(f"Yeni Çekim Talebi: User ID: {user_id}, Tutar: {amount}, Cüzdan: {wallet}")
        return jsonify({"status": "success", "message": "Çekim talebi alındı."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

# Admin Paneli için çekim taleplerini listeleyen gizli API
@app.route('/api/admin/withdrawals', methods=['GET'])
def get_withdrawals():
    # Güvenlik için basit bir şifre kontrolü (?secret=SizinSifreniz)
    secret = request.args.get('secret')
    
    # Buradaki şifreyi kendi belirleyeceğin gizli bir kelimeyle değiştirebilirsin
    if secret != "SizinGucluSifreniz123":
        return jsonify({"error": "Yetkisiz erişim! Hatalı şifre."}), 403
        
    return jsonify(withdraw_requests), 200

# Statik dosyalar için genel yönlendirici
@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
