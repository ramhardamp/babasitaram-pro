// Timestamp
document.getElementById('ts').textContent =
  'EXECUTED AT ' + new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }) + ' — ' + new Date().toLocaleDateString('en-IN');

// ── FIRE CANVAS ──────────────────────────────────────────
const canvas = document.getElementById('fireCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const particles = [];
function Particle(x) {
  this.x = x;
  this.y = canvas.height;
  this.vx = (Math.random() - 0.5) * 3;
  this.vy = -(Math.random() * 6 + 3);
  this.life = 1;
  this.decay = Math.random() * 0.012 + 0.006;
  this.size = Math.random() * 30 + 10;
}

Particle.prototype.update = function() {
  this.x += this.vx;
  this.y += this.vy;
  this.vy *= 0.99;
  this.life -= this.decay;
  this.size *= 0.995;
};

Particle.prototype.draw = function() {
  const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
  const alpha = this.life;
  grad.addColorStop(0,   'rgba(255, 255, 180, ' + alpha + ')');
  grad.addColorStop(0.2, 'rgba(255, 160, 0, '  + (alpha * 0.9) + ')');
  grad.addColorStop(0.5, 'rgba(255, 50, 0, '   + (alpha * 0.7) + ')');
  grad.addColorStop(1,   'rgba(0, 0, 0, 0)');
  ctx.beginPath();
  ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
};

function spawnParticles() {
  const count = Math.floor(canvas.width / 20);
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(Math.random() * canvas.width));
  }
}

function animateFire() {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 8; i++) {
    particles.push(new Particle(Math.random() * canvas.width));
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].draw();
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
  requestAnimationFrame(animateFire);
}

spawnParticles();
animateFire();

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});
