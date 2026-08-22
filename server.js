<script>
        // --- DATA YÖNETİMİ ---
        let gameData = {
            skor: 0.00,
            enerji: 100,
            gorevTamamlandi: false
        };

        function saveData() {
            localStorage.setItem('apexGameData', JSON.stringify(gameData));
        }

        function loadData() {
            const saved = localStorage.getItem('apexGameData');
            if (saved) {
                gameData = JSON.parse(saved);
                if (gameData.gorevTamamlandi) {
                    const gBtn = document.getElementById('gorevBtn');
                    gBtn.innerText = "Tamamlandı";
                    gBtn.style.background = "var(--accent)";
                    gBtn.disabled = true;
                }
            }
        }

        // --- DİNAMİK ARKA PLAN EFEKTİ ---
        const canvas = document.getElementById('bgCanvas');
        const ctx = canvas.getContext('2d');
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        let particles = [];
        for(let i=0; i<35; i++) {
            particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, radius: Math.random() * 2 + 1 });
        }

        function animateBg() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(79, 70, 229, 0.15)';
            ctx.strokeStyle = 'rgba(79, 70, 229, 0.08)';
            particles.forEach((p) => {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
                if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
            });
            requestAnimationFrame(animateBg);
        }
        animateBg();

        // --- OYUN MANTIĞI ---
        const tiklamaGucu = 0.10;
        const maxEnerji = 100;

        function sekmeDegis(viewName) {
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.querySelector(`[data-view="${viewName}"]`).classList.add('active');
            document.querySelectorAll('.dock-item').forEach(d => d.classList.remove('active'));
            event.currentTarget.classList.add('active');
        }

        function coreTikla(event) {
            if (gameData.enerji >= 2) {
                gameData.skor += tiklamaGucu;
                gameData.enerji -= 2;
                guncelleUI();
                saveData();
            } else {
                modalAc();
            }
        }

        function guncelleUI() {
            document.getElementById("skorDisplay").innerText = gameData.skor.toFixed(2);
            document.getElementById("listeSkor").innerText = gameData.skor.toFixed(2) + " APEX";
            document.getElementById("enerjiText").innerText = gameData.enerji + " / " + maxEnerji;
            document.getElementById("enerjiBar").style.width = (gameData.enerji / maxEnerji) * 100 + "%";
            
            let badge = document.getElementById("rankBadge");
            if (gameData.skor > 100) badge.innerText = "RÜTBE: APEX LEGEND";
            else if (gameData.skor > 30) badge.innerText = "RÜTBE: MASTER GRID";
        }

        function modalAc() { document.getElementById('overloadModal').classList.add('active'); }
        function modalKapat() { document.getElementById('overloadModal').classList.remove('active'); }

        function gorevTamamla(btn) {
            gameData.gorevTamamlandi = true;
            gameData.skor += 2.00;
            btn.innerText = "Tamamlandı";
            btn.style.background = "var(--accent)";
            btn.disabled = true;
            guncelleUI();
            saveData();
        }

        // --- MONETAG SDK DİNAMİK YÜKLEYİCİ ---
        function loadMonetagSDK() {
            if (document.getElementById('monetag-sdk')) return;
            const script = document.createElement('script');
            script.id = 'monetag-sdk';
            script.src = 'https://alwingulla.com/88/tag.min.js';
            script.setAttribute('data-zone', '11631125');
            script.async = true;
            script.dataset.cfasync = 'false';
            document.head.appendChild(script);
        }
        loadMonetagSDK();

        // --- MONETAG REKLAM ENTEGRASYONU ---
        function reklamIzleBoostAl() {
            if (typeof window.show_11631125 === 'function') {
                window.show_11631125().then(() => {
                    odulVerVeSogut();
                }).catch((err) => {
                    console.warn("Reklam gösterimi hata verdi, yedek ödül:", err);
                    odulVerVeSogut();
                });
            } else {
                console.warn("Monetag fonksiyonu hâlâ yüklenemedi, test ödülü veriliyor.");
                odulVerVeSogut();
            }
        }

        function odulVerVeSogut() {
            gameData.skor += 10.00;
            gameData.enerji = maxEnerji;
            guncelleUI();
            saveData();
            modalKapat();
        }

        // --- BAŞLATICI ---
        loadData();
        guncelleUI();
        setInterval(() => {
            if (gameData.enerji < maxEnerji) {
                gameData.enerji = Math.min(maxEnerji, gameData.enerji + 1);
                guncelleUI();
                saveData();
            }
        }, 2000);
    </script>
