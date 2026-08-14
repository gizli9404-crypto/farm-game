function spinWheel() {
    if (isSpinning) return;
    isSpinning = true;

    const sliceAngle = 360 / wheelSlices.length;
    const winningIndex = Math.floor(Math.random() * wheelSlices.length);
    const selectedPrize = wheelSlices[winningIndex];

    const extraSpins = 5;
    const targetAngle = 360 - (winningIndex * sliceAngle) - (sliceAngle / 2);
    const totalRotation = currentRotation + (360 * extraSpins) + ((targetAngle - (currentRotation % 360) + 360) % 360);

    const wheelElement = document.getElementById("inner-wheel");
    // Yumuşak ve gerçekçi yavaşlama efekti (cubic-bezier)
    wheelElement.style.transition = "transform 4s cubic-bezier(0.15, 0.75, 0.14, 1)";
    wheelElement.style.transform = `rotate(${totalRotation}deg)`;

    currentRotation = totalRotation;

    setTimeout(() => {
        isSpinning = false;
        // Tarayıcı alert'i yerine senin kendi şık modal fonksiyonunu buraya yazabilirsin
        showCustomPopup(`🎉 Çark Durdu! Tebrikler, ${selectedPrize.pts} PTS Kazandınız!`);
    }, 4000);
}
