from flask import Flask, send_from_directory, request, jsonify
import os

app = Flask(__name__, static_folder='public')

withdraw_requests = []

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
