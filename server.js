const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Telegram Bot ve Kanal Bilgileri
const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN || '8854910303:AAFre2j9IO6RKvJ8BJRoG4dZ4quD40d3LFM';
const ADMIN_CHANNEL_ID = process.env.CHANNEL_ID || '@sanal_miner_duyuru';

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite Veritabanı ve Log Dizini Ayarı (Railway Volume Uyumlu)
const dbDir = '/app/data';
if (!fs.existsSync(dbDir)){
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Veritabanı bağlantı hatası:', err.message);
    else console.log('SQLite veritabanına bağlandı:', dbPath);
});

// Tabloların Oluşturulması (Users, Withdrawals, Logs)
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE,
        username TEXT,
        balance REAL DEFAULT 0,
        tickets INTEGER DEFAULT 0,
        wallet TEXT DEFAULT '',
        network TEXT DEFAULT 'BEP20'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT,
        username TEXT,
        amount REAL,
        wallet TEXT,
        network TEXT DEFAULT 'BEP20',
        status TEXT DEFAULT 'Bekliyor',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Otomatik Log Kayıt Yardımcısı
function addSystemLog(action, details) {
    db.run(`INSERT INTO system_logs (action, details) VALUES (?, ?)`, [action, details], (err) => {
        if (err) console.error('Log kayıt hatası:', err.message);
    });
}

// ==========================================
// 1. KULLANICI İŞLEMLERİ (Frontend Entegrasyonu)
// ==========================================

app.post(['/api/user/login', '/api/kullanici/giris'], (req, res) => {
    const { telegram_id, username } = req.body;
    if (!telegram_id) return res.status(400).json({ success: false, error: 'Telegram ID gerekli' });

    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        if (row) {
            db.run(`UPDATE users SET username = ? WHERE telegram_id = ?`, [username || row.username, telegram_id]);
            res.json({ success: true, balance: row.balance, tickets: row.tickets, wallet: row.wallet, username: row.username });
        } else {
            db.run(`INSERT INTO users (telegram_id, username, balance, tickets, wallet) VALUES (?, ?, 0, 0, '')`, [telegram_id, username || 'Kullanıcı'], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                addSystemLog('YENİ_KULLANICI', `Yeni kullanıcı katıldı: @${username || telegram_id} (${telegram_id})`);
                res.json({ success: true, balance: 0, tickets: 0, wallet: '', username: username });
            });
        }
    });
});

app.post(['/api/withdraw', '/api/cekim'], (req, res) => {
    const { telegram_id, username, amount, wallet, network } = req.body;
    
    db.run(`INSERT INTO withdrawals (telegram_id, username, amount, wallet, network) VALUES (?, ?, ?, ?, ?)`,
        [telegram_id, username || 'Bilinmiyor', amount, wallet || 'Belirtilmedi', network || 'BEP20'],
        function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            
            addSystemLog('ÇEKİM_TALEBİ', `@${username || telegram_id} adlı kullanıcı ${amount} PEPE çekim talebi oluşturdu.`);

            const msg = `🔔 **YENİ ÇEKİM TALEBİ**\n\n👤 Kullanıcı: @${username || telegram_id} (\`${telegram_id}\`)\n💰 Miktar: \`${amount} PEPE\`\n💳 Cüzdan: \`${wallet}\`\n🌐 Ağ: \`${network || 'BEP20'}\``;
            axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHANNEL_ID,
                text: msg,
                parse_mode: 'Markdown'
            }).catch(e => console.log('Telegram bildirim hatası:', e.message));

            res.json({ success: true, message: 'Çekim talebi alındı.' });
        }
    );
});

// ==========================================
// 2. ADMIN PANELİ API'LERİ (Detaylı & Otomatik)
// ==========================================

// Genel İstatistikler ve Bekleyen Çekimler
app.get('/api/admin/stats', (req, res) => {
    db.get(`SELECT COUNT(*) as totalUsers, SUM(balance) as totalBalance FROM users`, [], (err, userStats) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        db.get(`SELECT COUNT(*) as pendingWithdraws FROM withdrawals WHERE status = 'Bekliyor'`, [], (err, withdrawStats) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            db.all(`SELECT * FROM withdrawals WHERE status = 'Bekliyor' ORDER BY id DESC`, [], (err, withdraws) => {
                if (err) return res.status(500).json({ success: false, error: err.message });

                res.json({
                    success: true,
                    totalUsers: userStats.totalUsers || 0,
                    totalBalance: userStats.totalBalance || 0,
                    pendingWithdraws: withdrawStats.pendingWithdraws || 0,
                    withdraws: withdraws
                });
            });
        });
    });
});

// Kayıtlı Tüm Kullanıcıları Listeleme
app.get('/api/admin/users', (req, res) => {
    db.all(`SELECT * FROM users ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, users: rows });
    });
});

// Canlı Sistem Loglarını Getirme (Son 50 İşlem)
app.get('/api/admin/logs', (req, res) => {
    db.all(`SELECT * FROM system_logs ORDER BY id DESC LIMIT 50`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, logs: rows });
    });
});

// Toplu Duyuru Otomasyonu (Herkese Telegram Mesajı Gönderir)
app.post('/api/admin/broadcast', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Mesaj boş olamaz.' });

    db.all(`SELECT telegram_id FROM users`, [], async (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        let successCount = 0;
        for (const row of rows) {
            try {
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: row.telegram_id,
                    text: `📢 **DUYURU**\n\n${message}`,
                    parse_mode: 'Markdown'
                });
                successCount++;
            } catch (e) {
                // Engellemiş veya botu başlatmamış kullanıcılar geçilir
            }
        }

        addSystemLog('TOPLU_DUYURU', `Admin tarafından ${successCount} kullanıcıya duyuru gönderildi.`);
        res.json({ success: true, sentCount: successCount });
    });
});

// Tekil Kullanıcı Varlık (Bakiye / Bilet) Tanımlama
app.post('/api/admin/modify', (req, res) => {
    const { telegram_id, amount, type } = req.body;
    if (!telegram_id || amount === undefined || !type) {
        return res.status(400).json({ success: false, error: 'Eksik parametre.' });
    }

    const column = type === 'tickets' ? 'tickets' : 'balance';

    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        if (row) {
            let newValue = (row[column] || 0) + Number(amount);
            db.run(`UPDATE users SET ${column} = ? WHERE telegram_id = ?`, [newValue, telegram_id], (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });

                addSystemLog('VARLIK_GÜNCELLEME', `${telegram_id} ID'li kullanıcıya ${amount} ${type.toUpperCase()} eklendi/güncellendi.`);
                
                // Kullanıcıya otomatik Telegram bildirimi gönder
                axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: telegram_id,
                    text: `🎁 **Hesabınıza Varlık Tanımlandı!**\n\nYönetici tarafından hesabınıza **${amount} ${type === 'tickets' ? 'Bilet 🎫' : 'PEPE 🪙'}** eklendi!`,
                    parse_mode: 'Markdown'
                }).catch(() => {});

                res.json({ success: true, message: 'Güncellendi' });
            });
        } else {
            res.status(404).json({ success: false, error: 'Kullanıcı veritabanında bulunamadı.' });
        }
    });
});

// Çekim Talebini Onaylama Otomasyonu
app.post('/api/admin/withdraw/approve', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID gerekli' });

    db.get(`SELECT * FROM withdrawals WHERE id = ?`, [id], (err, withdraw) => {
        if (err || !withdraw) return res.status(404).json({ success: false, error: 'Talep bulunamadı.' });

        db.run(`UPDATE withdrawals SET status = 'Onaylandı' WHERE id = ?`, [id], (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            addSystemLog('ÇEKİM_ ONAYLANDI', `@${withdraw.username} kullanıcısının ${withdraw.amount} PEPE çekim talebi onaylandı.`);

            // Kullanıcıya otomatik özel mesaj gönder
            axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: withdraw.telegram_id,
                text: `✅ **Çekim Talebiniz Onaylandı!**\n\n🎉 ${withdraw.amount} PEPE miktarındaki ödemeniz \`${withdraw.wallet}\` cüzdan adresinize gönderilmiştir.`,
                parse_mode: 'Markdown'
            }).catch(() => {});

            res.json({ success: true, message: 'Çekim onaylandı.' });
        });
    });
});

// ==========================================
// 3. OTOMATİK SİSTEM SAĞLIĞI & WATCHDOG
// ==========================================

let alertSent = false;
const checkSystemHealth = async () => {
    try {
        await axios.get('https://api.github.com');
        alertSent = false;
    } catch (error) {
        if (!alertSent) {
            addSystemLog('SİSTEM_UYARI', 'Genel ağ/altyapı kesintisi algılandı.');
            const errorMessage = "⚠️ **SİSTEM KESİNTİ UYARISI**\n\nSunucu tarafında geçici bir internet veya altyapı kesintisi tespit edildi. Otomatik sistemler durumu izliyor.";
            
            axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHANNEL_ID,
                text: errorMessage,
                parse_mode: 'Markdown'
            }).catch(() => {});
            
            alertSent = true;
        }
    }
};
setInterval(checkSystemHealth, 300000);

app.listen(PORT, () => {
    console.log(`Gelişmiş Admin Backend ${PORT} portunda çalışıyor.`);
});
