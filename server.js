// Örnek Express.js Backend Rotaları

// 1. Kullanıcı bakiye güncelleme rotası
app.post('/api/admin/balance', async (req, res) => {
    try {
        const { telegram_id, amount } = req.body;
        // Veritabanınızda kullanıcıyı bulup bakiyesini güncelleyin (Örn: MongoDB / PostgreSQL / SQLite)
        let user = await User.findOne({ telegram_id });
        if (!user) {
            // Kullanıcı yoksa geçici oluştur veya hata dön
            return res.status(404).json({ success: false, error: "Kullanıcı bulunamadı" });
        }
        
        user.balance += amount;
        if (user.balance < 0) user.balance = 0;
        await user.save();

        res.json({ success: true, new_balance: user.balance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Çekim onayla rotası
app.post('/api/admin/withdraw/approve', async (req, res) => {
    try {
        // Çekim kuyruğunu güncelleyin veya veritabanından düşüm yapın
        res.json({ success: true, message: "Ödeme onaylandı" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Duyuru yayınla rotası
let activeBroadcast = "";
app.post('/api/admin/broadcast', async (req, res) => {
    try {
        const { message } = req.body;
        activeBroadcast = message; // Anlık duyuruyu hafızada veya DB'de saklayın
        res.json({ success: true, message: "Duyuru kaydedildi" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Mini uygulama tarafının duyuruyu okuması için rota
app.get('/api/broadcast', (req, res) => {
    res.json({ broadcast: activeBroadcast });
});
