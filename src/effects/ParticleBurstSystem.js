export class ParticleBurstSystem {
  constructor({ maxParticles = 150 } = {}) {
    this.maxParticles = maxParticles;
    this.particles = [];
    this.pool = [];
  }

  update(delta) {
    let writeIndex = 0;
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];
      particle.age += delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= Math.max(0, 1 - delta * 1.4);
      particle.vy *= Math.max(0, 1 - delta * 1.4);
      if (particle.age < particle.life) {
        this.particles[writeIndex] = particle;
        writeIndex += 1;
      } else {
        this.release(particle);
      }
    }
    this.particles.length = writeIndex;
  }

  spawnHit(x, y, color) {
    this.spawnBurst(x, y, color, 3, 55);
  }

  spawnBurst(x, y, color, count, speed = 115) {
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length >= this.maxParticles) return;
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.35 + Math.random() * 0.8);
      const particle = this.pool.pop() || {};
      Object.assign(particle, {
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        color,
        age: 0,
        life: 0.35 + Math.random() * 0.45,
      });
      this.particles.push(particle);
    }
  }

  draw(ctx, camera) {
    this.particles.forEach((particle) => {
      const screen = camera.worldToScreen(particle.x, particle.y);
      const alpha = 1 - particle.age / particle.life;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 2 + alpha * 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  release(particle) {
    if (this.pool.length < this.maxParticles) this.pool.push(particle);
  }

  clear() {
    this.particles.length = 0;
    this.pool.length = 0;
  }
}
