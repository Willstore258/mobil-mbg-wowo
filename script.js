// --- Inisialisasi Audio Sintetis (Web Audio API) ---
// Pengganti berkas audio eksternal agar game mandiri dan bebas error loading.
const AudioEngine = {
    ctx: null,
    enabled: true,
    bgmNode: null,

    init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    },

    playTone(freq, type, duration, volume = 0.1) {
        if (!this.enabled || !this.ctx) return;
        try {
            let osc = this.ctx.createOscillator();
            let gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(volume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.00001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) { console.log("Audio Error", e); }
    },

    startBGM() {
        if (!this.enabled || this.bgmNode || !this.ctx) return;
        // Membuat loop melodi ceria sederhana menggunakan oscillator
        try {
            let now = this.ctx.currentTime;
            this.bgmNode = this.ctx.createOscillator();
            let gain = this.ctx.createGain();
            
            this.bgmNode.type = 'triangle';
            this.bgmNode.frequency.setValueAtTime(261.63, now); // C4
            
            // Loop melodi sederhana melalui timeline event
            let notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63];
            let time = now;
            for(let i=0; i<100; i++) {
                this.bgmNode.frequency.setValueAtTime(notes[i % notes.length], time);
                time += 0.4;
            }

            gain.gain.setValueAtTime(0.03, now);
            this.bgmNode.connect(gain);
            gain.connect(this.ctx.destination);
            this.bgmNode.start();
        } catch(e) {}
    },

    stopBGM() {
        if (this.bgmNode) {
            try { this.bgmNode.stop(); } catch(e){}
            this.bgmNode = null;
        }
    },

    playEngine() { this.playTone(120, 'sawtooth', 0.1, 0.02); },
    playHorn() { this.playTone(440, 'square', 0.3, 0.1); },
    playScore() { 
        this.playTone(523.25, 'sine', 0.1, 0.1);
        setTimeout(() => this.playTone(659.25, 'sine', 0.2, 0.1), 100);
    },
    playCrash() { this.playTone(80, 'sawtooth', 0.5, 0.2); }
};

// --- Setup Canvas ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Standarisasi resolusi internal canvas
const V_WIDTH = 450;
const V_HEIGHT = 800;
canvas.width = V_WIDTH;
canvas.height = V_HEIGHT;

// --- State Engine Game ---
let gameState = 'MENU'; // MENU, PLAYING, PAUSED, GAMEOVER
let score = 0;
let lives = 3;
let baseSpeed = 3;
let currentLevel = 'medium';
let foodCollected = 0;
const maxFoodCapacity = 3;

// --- Input Tracker ---
const keys = {};
const touchControls = { up: false, down: false, left: false, right: false };

// --- Entity Blueprints ---
class Player {
    constructor() {
        this.w = 40;
        this.h = 75;
        this.x = V_WIDTH / 2 - this.w / 2;
        this.y = V_HEIGHT - 180;
        this.speed = 4.5;
    }

    update() {
        if (keys['ArrowLeft'] || keys['a'] || keys['A'] || touchControls.left) this.x -= this.speed;
        if (keys['ArrowRight'] || keys['d'] || keys['D'] || touchControls.right) this.x += this.speed;
        if (keys['ArrowUp'] || keys['w'] || keys['W'] || touchControls.up) this.y -= this.speed;
        if (keys['ArrowDown'] || keys['s'] || keys['S'] || touchControls.down) this.y += this.speed;

        // Batasan agar tidak keluar jalan raya (Jalan di x: 50 sampai 400)
        if (this.x < 55) this.x = 55;
        if (this.x > V_WIDTH - 55 - this.w) this.x = V_WIDTH - 55 - this.w;
        if (this.y < 100) this.y = 100;
        if (this.y > V_HEIGHT - 100) this.y = V_HEIGHT - 100;

        if (Math.random() < 0.15) AudioEngine.playEngine();
    }

    draw() {
        ctx.save();
        ctx.translate(this.x + this.w/2, this.y + this.h/2);
        
        // Badan Mobil Box Putih (MBG)
        ctx.fillStyle = '#f5f6fa';
        ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);

        // Kepala Mobil Depan
        ctx.fillStyle = '#dcdde1';
        ctx.fillRect(-this.w/2, -this.h/2, this.w, 20);
        ctx.fillStyle = '#2f3640'; // Kaca Depan
        ctx.fillRect(-this.w/2 + 4, -this.h/2 + 5, this.w - 8, 8);

        // Logo MBG (Grafis Vektor Sederhana Bendera + Teks)
        ctx.fillStyle = '#e84118'; // Merah
        ctx.fillRect(-10, 0, 20, 7);
        ctx.fillStyle = '#ffffff'; // Putih
        ctx.fillRect(-10, 7, 20, 7);
        ctx.strokeStyle = '#2f3640';
        ctx.lineWidth = 1;
        ctx.strokeRect(-10, 0, 20, 14);

        // Roda-roda
        ctx.fillStyle = '#111';
        ctx.fillRect(-this.w/2 - 3, -this.h/2 + 10, 3, 12);
        ctx.fillRect(this.w/2, -this.h/2 + 10, 3, 12);
        ctx.fillRect(-this.w/2 - 3, this.h/2 - 20, 3, 12);
        ctx.fillRect(this.w/2, this.h/2 - 20, 3, 12);

        ctx.restore();
    }
}

class Obstacle {
    constructor() {
        this.w = 42;
        this.h = 75;
        // Spawn di salah satu dari 3 lajur utama secara acak
        const lanes = [85, 195, 305];
        this.x = lanes[Math.floor(Math.random() * lanes.length)];
        this.y = -this.h - Math.random() * 300;
        this.speed = baseSpeed * (0.8 + Math.random() * 0.5);
        
        // Variasi warna kendaraan rintangan
        const colors = ['#e84118', '#00a8ff', '#9c88ff', '#fbc531'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
        this.y += this.speed;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = '#2f3640'; // Kaca
        ctx.fillRect(this.x + 4, this.y + 15, this.w - 8, 10);
        ctx.fillRect(this.x + 4, this.y + this.h - 15, this.w - 8, 6);
    }
}

class ItemMBG {
    constructor() {
        this.w = 30;
        this.h = 30;
        this.x = 70 + Math.random() * 280;
        this.y = -this.h - Math.random() * 200;
    }
    update() { this.y += baseSpeed; }
    draw() {
        ctx.fillStyle = '#fbc531'; // Kotak Makanan Emas
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x + 3, this.y + 3, this.w - 6, this.h - 6);
        // Tanda silang paket pita
        ctx.beginPath();
        ctx.moveTo(this.x + 15, this.y); ctx.lineTo(this.x + 15, this.y + 30);
        ctx.moveTo(this.x, this.y + 15); ctx.lineTo(this.x + 30, this.y + 15);
        ctx.stroke();
    }
}

class School {
    constructor() {
        this.w = 120;
        this.h = 90;
        this.x = V_WIDTH - 120; // Di sisi kanan jalan raya
        this.y = -this.h - 400; 
        this.passed = false;
    }
    update() { this.y += baseSpeed; }
    draw() {
        // Bangunan Sekolah
        ctx.fillStyle = '#dcdde1';
        ctx.fillRect(this.x, this.y, this.w, this.h);
        // Atap Segitiga Khas Indonesia (Merah Genteng)
        ctx.fillStyle = '#c23616';
        ctx.beginPath();
        ctx.moveTo(this.x - 10, this.y);
        ctx.lineTo(this.x + this.w / 2, this.y - 30);
        ctx.lineTo(this.x + this.w + 10, this.y);
        ctx.fill();
        // Teks SD/Sekolah
        ctx.fillStyle = '#2f3640';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText("SD NEGERI", this.x + 30, this.y + 40);
        // Bendera Merah Putih di Halaman
        ctx.fillStyle = '#e84118'; ctx.fillRect(this.x + 10, this.y + 60, 15, 6);
        ctx.fillStyle = '#fff'; ctx.fillRect(this.x + 10, this.y + 66, 15, 6);
        ctx.fillStyle = '#7f8c8d'; ctx.fillRect(this.x + 8, this.y + 60, 2, 25);
    }
}

// --- Dekorasi Lingkungan Bergerak ---
class Scenery {
    constructor(isLeft) {
        this.isLeft = isLeft;
        this.x = isLeft ? 10 : V_WIDTH - 40;
        this.y = Math.random() * V_HEIGHT;
        this.type = Math.random() > 0.5 ? 'tree' : 'house';
    }
    update() {
        this.y += baseSpeed;
        if (this.y > V_HEIGHT) {
            this.y = -60;
            this.type = Math.random() > 0.5 ? 'tree' : 'house';
        }
    }
    draw() {
        if (this.type === 'tree') {
            ctx.fillStyle = '#4cd137';
            ctx.beginPath(); ctx.arc(this.x + 15, this.y + 15, 18, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#8c7ae6'; // Batang pohon coklat/gelap
            ctx.fillRect(this.x + 12, this.y + 28, 6, 12);
        } else {
            ctx.fillStyle = '#e1b12c';
            ctx.fillRect(this.x, this.y, 25, 25);
            ctx.fillStyle = '#c23616'; // Atap rumah
            ctx.beginPath(); ctx.moveTo(this.x-3, this.y); ctx.lineTo(this.x+12, this.y-10); ctx.lineTo(this.x+28, this.y); ctx.fill();
        }
    }
}

// --- Kontainer Data Objek ---
let player;
let obstacles = [];
let items = [];
let schools = [];
let sceneries = [];
let roadOffset = 0;

function setupGame() {
    player = new Player();
    obstacles = [];
    items = [];
    schools = [];
    sceneries = [];
    score = 0;
    lives = 3;
    foodCollected = 0;

    // Set tingkat kecepatan awal berdasarkan opsi menu level
    const lvl = document.getElementById('select-level').value;
    currentLevel = lvl;
    if (lvl === 'easy') baseSpeed = 3.5;
    else if (lvl === 'medium') baseSpeed = 5;
    else if (lvl === 'hard') baseSpeed = 7;

    // Inisialisasi dekorasi kiri & kanan jalan
    for (let i = 0; i < 6; i++) {
        sceneries.push(new Scenery(true));
        sceneries.push(new Scenery(false));
    }
    updateUI();
}

// --- Deteksi Tabrakan Kotak (AABB) ---
function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.w &&
           rect1.x + rect1.w > rect2.x &&
           rect1.y < rect2.y + rect2.h &&
           rect1.y + rect1.h > rect2.y;
}

// --- Loop Utama Pembaruan Logika ---
function update() {
    if (gameState !== 'PLAYING') return;

    // Gerakan Marka Jalan
    roadOffset += baseSpeed;
    if (roadOffset >= 40) roadOffset = 0;

    // Update Dekorasi Lingkungan
    sceneries.forEach(s => s.update());

    // Update Player
    player.update();

    // Spawn & Update Kendaraan Rintangan
    if (Math.random() < 0.02 && obstacles.length < 4) {
        obstacles.push(new Obstacle());
    }
    obstacles.forEach((obs, index) => {
        obs.update();
        if (obs.y > V_HEIGHT) obstacles.splice(index, 1);

        // Cek benturan dengan player
        if (checkCollision(player, obs)) {
            AudioEngine.playCrash();
            lives--;
            updateUI();
            obstacles.splice(index, 1);
            if (lives <= 0) {
                endGame();
            }
        }
    });

    // Spawn & Update Makanan MBG
    if (Math.random() < 0.01 && items.length < 2 && foodCollected < maxFoodCapacity) {
        items.push(new ItemMBG());
    }
    items.forEach((itm, index) => {
        itm.update();
        if (itm.y > V_HEIGHT) items.splice(index, 1);

        if (checkCollision(player, itm)) {
            if (foodCollected < maxFoodCapacity) {
                foodCollected++;
                AudioEngine.playScore();
                updateUI();
                items.splice(index, 1);
            }
        }
    });

    // Spawn & Update Sekolah
    if (Math.random() < 0.003 && schools.length === 0) {
        schools.push(new School());
    }
    schools.forEach((sch, index) => {
        sch.update();
        if (sch.y > V_HEIGHT) schools.splice(index, 1);

        // Cek area pengantaran sukses di dekat/sejajar bangunan sekolah
        if (!sch.passed && foodCollected > 0 && checkCollision(player, sch)) {
            score += 100 * foodCollected; // Poin dikali jumlah kotak yang sukses dikirim
            foodCollected = 0;
            sch.passed = true;
            AudioEngine.playScore();
            // Tingkatkan tantangan kecepatan dinamis seiring naiknya skor
            baseSpeed += 0.4; 
            updateUI();
        }
    });
}

// --- Sistem Render Grafis Canvas ---
function draw() {
    // Bersihkan canvas dengan warna dasar tanah hijau Nusantara
    ctx.fillStyle = '#20bf6b';
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    // Gambar Area Aspal Jalan Raya Utama Berjalur 3
    ctx.fillStyle = '#3d3d3d';
    ctx.fillRect(50, 0, V_WIDTH - 100, V_HEIGHT);

    // Bahu Jalan (Trotoar Kiri Kanan bercorak hitam putih)
    ctx.fillStyle = '#dcdde1';
    ctx.fillRect(45, 0, 5, V_HEIGHT);
    ctx.fillRect(V_WIDTH - 50, 0, 5, V_HEIGHT);

    // Garis Marka Putih Putus-putus di Tengah Jalan
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.setLineDash([20, 20]);
    ctx.lineDashOffset = -roadOffset;
    
    // Lajur pembatas kiri
    ctx.beginPath(); ctx.moveTo(165, 0); ctx.lineTo(165, V_HEIGHT); ctx.stroke();
    // Lajur pembatas kanan
    ctx.beginPath(); ctx.moveTo(280, 0); ctx.lineTo(280, V_HEIGHT); ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // Render Semua Komponen
    sceneries.forEach(s => s.draw());
    schools.forEach(s => s.draw());
    items.forEach(i => i.draw());
    obstacles.forEach(o => o.draw());
    player.draw();

    // Render Sistem Mini Map Pojok Kanan Bawah
    drawMiniMap();
}

function drawMiniMap() {
    const mmW = 60;
    const mmH = 120;
    const mmX = V_WIDTH - mmW - 15;
    const mmY = V_HEIGHT - mmH - 120;

    // Background semi transparan untuk Peta Mini
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    // Indikator Posisi Pemain (Titik Hijau)
    let pRelY = (player.y / V_HEIGHT) * mmH;
    ctx.fillStyle = '#4cd137';
    ctx.beginPath(); ctx.arc(mmX + mmW/2, mmY + pRelY, 4, 0, Math.PI*2); ctx.fill();

    // Indikator Target Sekolah terdekat (Titik Merah)
    schools.forEach(s => {
        let sRelY = (s.y / V_HEIGHT) * mmH;
        if (sRelY >= 0 && sRelY <= mmH) {
            ctx.fillStyle = '#e84118';
            ctx.fillRect(mmX + mmW - 12, mmY + sRelY, 8, 8);
        }
    });
}

// --- Interface & Antarmuka UI Utility ---
function updateUI() {
    document.getElementById('ui-score').innerText = score;
    document.getElementById('ui-food').innerText = foodCollected;
    document.getElementById('ui-lives').innerText = '❤️'.repeat(lives);
}

function showScreen(screenId) {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('ui-layer').classList.add('hidden');
    document.getElementById('mobile-controls').classList.add('hidden');

    if (screenId === 'PLAYING') {
        document.getElementById('ui-layer').classList.remove('hidden');
        if ('ontouchstart' in window) {
            document.getElementById('mobile-controls').classList.remove('hidden');
        }
    } else if (screenId === 'MENU') {
        document.getElementById('main-menu').classList.remove('hidden');
        let hs = localStorage.getItem('mbg_highscore') || 0;
        document.getElementById('menu-highscore').innerText = hs;
    } else if (screenId === 'PAUSED') {
        document.getElementById('ui-layer').classList.remove('hidden');
        document.getElementById('pause-screen').classList.remove('hidden');
    } else if (screenId === 'GAMEOVER') {
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('final-score').innerText = score;
    }
}

function endGame() {
    gameState = 'GAMEOVER';
    AudioEngine.stopBGM();
    let currentHS = localStorage.getItem('mbg_highscore') || 0;
    if (score > currentHS) {
        localStorage.setItem('mbg_highscore', score);
    }
    showScreen('GAMEOVER');
}

// --- Manajemen Siklus Detik Loop Game (60 FPS) ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// --- Event Handlers & Input Integrasi ---
window.addEventListener('keydown', e => { keys[e.key] = true; });
window.addEventListener('keyup', e => { keys[e.key] = false; });

// Pengikatan Fungsi Kontrol Tombol Virtual HP (Mobile Touch)
function setupMobileBtn(id, axis) {
    const btn = document.getElementById(id);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); touchControls[axis] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); touchControls[axis] = false; });
}
setupMobileBtn('ctrl-up', 'up');
setupMobileBtn('ctrl-down', 'down');
setupMobileBtn('ctrl-left', 'left');
setupMobileBtn('ctrl-right', 'right');

document.getElementById('ctrl-horn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    AudioEngine.playHorn();
});

// Aksi Klik Menu Utama & Interaksi UI
document.getElementById('btn-start').addEventListener('click', () => {
    AudioEngine.init();
    setupGame();
    gameState = 'PLAYING';
    showScreen('PLAYING');
    AudioEngine.startBGM();
});

document.getElementById('btn-pause').addEventListener('click', () => {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        showScreen('PAUSED');
        AudioEngine.stopBGM();
    }
});

document.getElementById('btn-resume').addEventListener('click', () => {
    gameState = 'PLAYING';
    showScreen('PLAYING');
    AudioEngine.startBGM();
});

document.getElementById('btn-restart').addEventListener('click', () => {
    setupGame();
    gameState = 'PLAYING';
    showScreen('PLAYING');
    AudioEngine.startBGM();
});

document.getElementById('btn-restart-pause').addEventListener('click', () => {
    setupGame();
    gameState = 'PLAYING';
    showScreen('PLAYING');
    AudioEngine.startBGM();
});

document.getElementById('btn-audio-toggle').addEventListener('click', () => {
    AudioEngine.enabled = !AudioEngine.enabled;
    document.getElementById('btn-audio-toggle').innerText = `Audio: ${AudioEngine.enabled ? 'ON' : 'OFF'}`;
});

// Membuka menu awal pertama kali saat game dimuat
showScreen('MENU');
requestAnimationFrame(gameLoop);