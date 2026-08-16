import os
from flask import Flask, send_from_directory

# Dosya yollarını garantiye almak için mutlak dizin tanımı
basedir = os.path.abspath(os.path.dirname(__file__))
public_dir = os.path.join(basedir, 'public')

app = Flask(__name__, static_folder=public_dir, static_url_path='')

@app.route('/')
def index():
    return send_from_directory(public_dir, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(public_dir, path)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
