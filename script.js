// Çark Dilimleri (6 Dilim, Her biri 60 derece)
const wheelSlices = [
    { pts: 10 },
    { pts: 60 },
    { pts: 100 },
    { pts: 250 },
    { pts: 500 },
    { pts: 1000 }
];

let currentRotation = 0;
let isSpinning = false;

function spinWheel() {
    if (isSpinning) return;
    isSpinning = true;

    const sliceAngle = 60; // 360 / 6
    
    // Rastgele bir ödül indeksi seç
    const winningIndex = Math.floor(Math.random() * wheelSlices.length);
    const selectedPrize = wheelSlices[winningIndex];

    // Çarkın tam seçilen dilimde durması için hesaplama
    const extraSpins = 5; // Tam tur sayısı
    // Ok üstte olduğu için açı hesaplaması
    const targetAngle = 360 - (winningIndex * sliceAngle) - (sliceAngle / 2);
    const totalRotation = currentRotation + (360 * extraSpins) + ((targetAngle - (currentRotation % 360) + 360) % 360);

    const wheelElement = document.getElementById("inner-wheel");
    wheelElement.style.transition = "transform 4s cubic-bezier(0.15, 0.75, 0.14, 1)";
    wheelElement.style.transform = `rotate(${totalRotation}deg)`;

    currentRotation = totalRotation;

    setTimeout(() => {
        isSpinning = false;
        showCustomPopup(`🎉 Çark Durdu! Tebrikler, ${selectedPrize.pts} PTS Kazandınız!`);
    }, 4000);
}

// Slot Makinesi Mantığı
const slotSymbols = ["💎", "⭐", "🍒", "🔔", "7️⃣", "🍋"];

function spinSlot() {
    const slots = [
        document.getElementById("slot-1"),
        document.getElementById("slot-2"),
        document.getElementById("slot-3")
    ];

    slots.forEach(slot => slot.classList.add("spinning-slot"));

    let counter = 0;
    const rollInterval = setInterval(() => {
        slots.forEach(slot => {
            slot.innerText = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
        });
        counter++;

        if (counter > 15) {
            clearInterval(rollInterval);
            slots.forEach(slot => slot.classList.remove("spinning-slot"));

            // Sonuçları belirle (Örn: %30 ihtimalle üçlü eşleşme şansı verilebilir veya tamamen rastgele)
            const finalResults = [
                slotSymbols[Math.floor(Math.random() * slotSymbols.length)],
                slotSymbols[Math.floor(Math.random() * slotSymbols.length)],
                slotSymbols[Math.floor(Math.random() * slotSymbols.length)]
            ];

            slots.forEach((slot, index) => {
                slot.innerText = finalResults[index];
            });

            if (finalResults[0] === finalResults[1] && finalResults[1] === finalResults[2]) {
                showCustomPopup(`🎉 BINGO! Üç Eşleşti! 300 PTS Kazandınız!`);
            } else {
                showCustomPopup(`😢 Maalesef, bu sefer kazanamadın. Tekrar dene!`);
            }
        }
    }, 100);
}

// Özel Popup Kontrolleri
function showCustomPopup(message) {
    document.getElementById("modal-text").innerText = message;
    document.getElementById("custom-modal").style.display = "flex";
}

function closeModal() {
    document.getElementById("custom-modal").style.display = "none";
}
