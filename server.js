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

// Tabloların Oluşturulması
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
// 1. KULLANICI İŞLEMLERİ & SENKRONİZASYON
// ==========================================

app.post(['/api/user/login', '/api/kullanici/giris'], (req, res) => {
    let { telegram_id, username } = req.body;
    if (!telegram_id) return res.status(400).json({ success: false, error: 'Telegram ID gerekli' });

    telegram_id = String(telegram_id); // ID'yi garanti string yap

    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        if (row) {
            db.run(`UPDATE users SET username = ? WHERE telegram_id = ?`, [username || row.username, telegram_id]);
            res.json({ success: true, balance: row.balance, tickets: row.tickets, wallet: row.wallet, username: row.username });
        } else {
            db.run(`INSERT INTO users (telegram_id, username, balance, tickets, wallet) VALUES (?, ?, 0, 0, '')`, [telegram_id, username || 'Kullanici'], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                addSystemLog('YENİ_KULLANICI', `Yeni kullanıcı katıldı: @${username || telegram_id} (${telegram_id})`);
                res.json({ success: true, balance: 0, tickets: 0, wallet: '', username: username });
            });
        }
    });
});

// Kullanıcı Verisi Getirme (Mini App Yenileme Sorunu İçin)
app.get('/api/user/data', (req, res) => {
    let telegram_id = req.query.telegram_id;
    if (!telegram_id) return res.status(400).json({ success: false, error: 'Telegram ID gerekli' });
    telegram_id = String(telegram_id);

    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!row) {
            return res.json({ success: true, balance: 0, tickets: 0, wallet: '', username: 'Kullanici' });
        }
        res.json({ success: true, balance: row.balance, tickets: row.tickets, wallet: row.wallet, username: row.username });
    });
});

// ==========================================
// 2. LİDERLİK TABLOSU (RANK) & OTOMATİK YARIŞ
// ==========================================

app.get('/api/rankings', (req, res) => {
    let currentTelegramId = req.query.telegram_id ? String(req.query.telegram_id) : '';

    db.all(`SELECT telegram_id, username, balance, tickets FROM users ORDER BY tickets DESC, balance DESC LIMIT 10`, [], (err, topUsers) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        // Kullanıcının kendi sırasını bulma
        db.all(`SELECT telegram_id, tickets, balance FROM users ORDER BY tickets DESC, balance DESC`, [], (err, allUsers) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            let userRank = -1;
            let userData = null;

            allUsers.forEach((u, index) => {
                if (String(u.telegram_id) === currentTelegramId) {
                    userRank = index + 1;
                    userData = u;
                }
            });

            res.json({
                success: true,
                topUsers: topUsers.map((u, index) => ({
                    rank: index + 1,
                    username: u.username || 'Gizli Kullanıcı',
                    tickets: u.tickets,
                    balance: u.balance,
                    isMe: String(u.telegram_id) === currentTelegramId
                })),
                myRank: userRank !== -1 ? userRank : null,
                myTickets: userData ? userData.tickets : 0,
                myBalance: userData ? userData.balance : 0
            });
        });
    });
});

// Günlük Liderlik Tablosunu Telegram Kanalına Otomatik Gönderme Fonksiyonu
async function sendDailyLeaderboardToChannel() {
    db.all(`SELECT username, tickets, balance FROM users ORDER BY tickets DESC, balance DESC LIMIT 3`, [], async (err, rows) => {
        if (err || !rows || rows.length === 0) return;

        let msg = `🏆 **GÜNLÜK MADENCİLİK LİDERLİK TABLOSU** 🏆\n\nEn çok bilet ve kazanç sağlayan şanslı madencilerimiz:\n\n`;
        rows.forEach((r, i) => {
            const medals = ['🥇', '🥈', '🥉'];
            msg += `${medals[i]} @${r.username || 'Madenci'} — **${r.tickets} Bilet** 🎫 (${r.balance} PEPE)\n`;
        });
        msg += `\n🚀 Sen de yarışa katıl, ödülleri kap! Kanalda kalmaya devam edin.`;

        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: ADMIN_CHANNEL_ID,
                text: msg,
                parse_mode: 'Markdown'
            });
            addSystemLog('OTOMATİK_LİDERLİK', 'Günlük liderlik tablosu kanala başarıyla gönderildi.');
        } catch (e) {
            console.error('Kanal duyuru hatası:', e.message);
        }
    });
}

// Her 24 saatte bir otomatik kanal liderlik tablosu paylaşımı tetikleyicisi
setInterval(sendDailyLeaderboardToChannel, 86400000);

// ==========================================
// 3. ÇEKİM VE ADMIN İŞLEMLERİ
// ==========================================

app.post(['/api/withdraw', '/api/cekim'], (req, res) => {
    let { telegram_id, username, amount, wallet, network } = req.body;
    telegram_id = String(telegram_id);
    
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

app.get('/api/admin/users', (req, res) => {
    db.all(`SELECT * FROM users ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, users: rows });
    });
});

app.get('/api/admin/logs', (req, res) => {
    db.all(`SELECT * FROM system_logs ORDER BY id DESC LIMIT 50`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, logs: rows });
    });
});

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
            } catch (e) {}
        }

        addSystemLog('TOPLU_DUYURU', `Admin tarafından ${successCount} kullanıcıya duyuru gönderildi.`);
        res.json({ success: true, sentCount: successCount });
    });
});

// Admin Varlık (Bakiye / Bilet) Tanımlama (Anında Yansıma Garantili)
app.post('/api/admin/modify', (req, res) => {
    let { telegram_id, amount, type } = req.body;
    if (!telegram_id || amount === undefined || !type) {
        return res.status(400).json({ success: false, error: 'Eksik parametre.' });
    }
    telegram_id = String(telegram_id);
    const column = type === 'tickets' ? 'tickets' : 'balance';

    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        if (row) {
            let newValue = Number(row[column] || 0) + Number(amount);
            db.run(`UPDATE users SET ${column} = ? WHERE telegram_id = ?`, [newValue, telegram_id], (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });

                addSystemLog('VARLIK_GÜNCELLEME', `${telegram_id} ID'li kullanıcıya ${amount} ${type.toUpperCase()} eklendi.`);
                
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

app.post('/api/admin/withdraw/approve', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'ID gerekli' });

    db.get(`SELECT * FROM withdrawals WHERE id = ?`, [id], (err, withdraw) => {
        if (err || !withdraw) return res.status(404).json({ success: false, error: 'Talep bulunamadı.' });

        db.run(`UPDATE withdrawals SET status = 'Onaylandı' WHERE id = ?`, [id], (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            addSystemLog('ÇEKİM_ONAYLANDI', `@${withdraw.username} kullanıcısının ${withdraw.amount} PEPE çekim talebi onaylandı.`);

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
// 4. TELEGRAM BOT KOMUT DİNLEYİCİSİ (LONG POLLING)
// ==========================================

let lastUpdateId = 0;

async function checkTelegramUpdates() {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`, {
            params: { offset: lastUpdateId, timeout: 30 }
        });

        if (response.data && response.data.ok) {
            const updates = response.data.result;
            for (const update of updates) {
                lastUpdateId = update.update_id + 1;

                if (update.message && update.message.text) {
                    const chatId = update.message.chat.id;
                    const text = update.message.text.trim();
                    const user = update.message.from;
                    const telegramId = String(user.id);
                    const username = user.username || user.first_name || 'Kullanici';

                    // /start komutu algılandığında
                    if (text.startsWith('/start')) {
                        db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegramId], (err, row) => {
                            if (!row) {
                                db.run(`INSERT INTO users (telegram_id, username, balance, tickets, wallet) VALUES (?, ?, 0, 0, '')`, 
                                    [telegramId, username], (err) => {
                                        if (!err) addSystemLog('YENİ_KULLANICI', `Start ile katıldı: @${username} (${telegramId})`);
                                    });
                            }
                        });

                        // Kullanıcıya Hoş Geldin Mesajı ve Mini App Açma Butonu Gönder
                        axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                            chat_id: chatId,
                            text: `👋 **Merhaba ${username}, Sanal Miner Pro'ya hoş geldin!**\n\nMadencilik yapmak, şans çarkı çevirmek ve kazanç sağlamak için aşağıdaki butona tıkla:`,
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: "🚀 Madenciliği Aç (Mini App)", web_app: { url: "https://miner-production-32ee.up.railway.app" } }],
                                    [{ text: "📢 Duyuru Kanalı", url: "https://t.me/sanal_miner_duyuru" }]
                                ]
                            }
                        }).catch(e => console.error('Start mesajı gönderme hatası:', e.message));
                    }
                }
            }
        }
    } catch (error) {
        // Hataların sunucuyu düşürmesi engellendi
    }
}

// Bot mesajlarını arka planda sürekli dinle
setInterval(checkTelegramUpdates, 3000);

app.listen(PORT, () => {
    console.log(`Gelişmiş Backend ${PORT} portunda başarıyla çalışıyor.`);
});
