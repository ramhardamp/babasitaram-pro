// BABA SITARAM — PRO LEVEL BURN ENGINE
const canvas = document.getElementById('fire-canvas');
const ctx = canvas.getContext('2d');

let width, height;
const particles = [];
const particleCount = 120;

function initCanvas() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}

window.addEventListener('resize', initCanvas);
initCanvas();

class Particle {
    constructor() {
        this.reset();
    }
    reset() {
        this.x = Math.random() * width;
        this.y = height + Math.random() * 100;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = -(Math.random() * 3 + 2);
        this.size = Math.random() * 15 + 5;
        this.life = 1;
        this.death = Math.random() * 0.05 + 0.01;

        const colors = ['#ff4400', '#ff0000', '#ffaa00', '#440000'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.death;
        this.size *= 0.96;
        if (this.life <= 0 || this.size < 1) this.reset();
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
    }
}

for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
}

function animate() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
        p.update();
        p.draw();
    });
    requestAnimationFrame(animate);
}
animate();

// ── ERASE LOGIC ──────────────────────────────────────────────
async function startErase() {
    const pBar = document.getElementById('progressBar');
    const flare = document.getElementById('burnFlare');

    // Background ko fireWipe trigger karo (fireproof-aware)
    chrome.runtime.sendMessage({ action: 'fireWipe' }, (r) => {
        if(r) console.log('FireWipe done. Restored URLs:', r.restoredUrls);
    });

    // Close other tabs instantly
    chrome.storage.local.get({fireproofSites:[], whitelist:[]}, (d) => {
        const allProtected = [...new Set([...d.fireproofSites,...d.whitelist])];
        chrome.tabs.query({}, (tabs) => {
            chrome.tabs.getCurrent((current) => {
                tabs.forEach(t => {
                    if (t.id === current.id) return;
                    try {
                        const h = new URL(t.url).hostname.replace(/^www\./,"");
                        if (allProtected.some(fp => h===fp || h.endsWith("."+fp))) return;
                    } catch(e) {}
                    chrome.tabs.remove(t.id);
                });
            });
        });
    });

    for (let i = 0; i < 5; i++) {
        const row = document.getElementById('row' + i);
        row.classList.add('active');
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
        row.classList.remove('active');
        row.classList.add('done');
        pBar.style.width = ((i + 1) * 20) + '%';
    }

    // FINAL FLARE ANIMATION
    flare.style.display = 'block';
    flare.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(500)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1000)', opacity: 0 }
    ], {
        duration: 800,
        easing: 'ease-out'
    }).onfinish = () => {
        chrome.storage.local.set({ lastBurn: Date.now() }, () => {
            chrome.tabs.getCurrent(current => {
                chrome.tabs.update(current.id, { url: chrome.runtime.getURL('burned.html') });
            });
        });
    };
}

setTimeout(startErase, 500);
