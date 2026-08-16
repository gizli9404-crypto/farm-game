const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// JSON ve form verilerini okuyabilmek için middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 'public' klasörünü statik dosyalar için dış dünyaya aç (index.html buradadır)
app.use(express.static(path.join(__dirname, 'public')));

// Ana dizine istek geldiğinde public klasöründeki index.html'i sun
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Sunucuyu Railway'in atadığı port üzerinden başlat
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});
