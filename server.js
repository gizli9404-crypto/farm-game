const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbDir = '/app/data';
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new sqlite3.Database(path.join(dbDir, 'database.db'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (telegram_id TEXT PRIMARY KEY, username TEXT, balance REAL DEFAULT 0)`);
});

app.post('/api/login', (req, res) => {
    const { telegram_id, username } = req.body;
    db.get(`SELECT * FROM users WHERE telegram_id = ?`, [telegram_id], (err, row) => {
        if (row) {
            res.json({ success: true, balance: row.balance });
        } else {
            db.run(`INSERT INTO users (telegram_id, username, balance) VALUES (?, ?, 0)`, [telegram_id, username || 'User'], () => {
                res.json({ success: true, balance: 0 });
            });
        }
    });
});

app.post('/api/update-balance', (req, res) => {
    const { telegram_id, amount } = req.body;
    db.run(`UPDATE users SET balance = balance + ? WHERE telegram_id = ?`, [amount, telegram_id], (err) => {
        if (err) res.status(500).json({ success: false });
        else res.json({ success: true });
    });
});

app.get('/api/users', (req, res) => {
    db.all(`SELECT * FROM users`, [], (err, rows) => {
        res.json(rows || []);
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
