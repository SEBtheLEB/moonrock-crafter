export class AsteroidFragmentationSystem {
  constructor({ config, maxAsteroidCount = 64 } = {}) {
    this.config = config || {};
    this.maxAsteroidCount = maxAsteroidCount;
  }

  chooseTier(distanceFromStation) {
    const bands = this.config.distanceTierWeights || [];
    const band = bands.find((entry) => distanceFromStation >= entry.minDistance && distanceFromStation < entry.maxDistance);
    const weights = band?.weights || { 0: 52, 1: 38, 2: 10 };
    const entries = Object.entries(weights)
      .map(([tier, weight]) => ({ tier: Number(tier), weight }))
      .filter((entry) => entry.weight > 0);
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) return entry.tier;
    }
    return entries[0]?.tier || 1;
  }

  spawn({ asteroid, asteroids, acquireAsteroid }) {
    if (asteroid.fragmentTier <= 0) return { didFragment: false, childCount: 0 };
    const maxAvailable = Math.max(0, this.maxAsteroidCount - (asteroids.length - 1));
    if (maxAvailable <= 0) return { didFragment: false, childCount: 0 };
    const requestedCount = asteroid.getSplitChildCount?.() || 2;
    const childCount = Math.min(maxAvailable, requestedCount);
    if (childCount <= 0) return { didFragment: false, childCount: 0 };

    const childTier = Math.max(0, asteroid.fragmentTier - 1);
    const speed = this.config.childSpreadSpeed || 18;
    const baseAngle = Math.atan2(asteroid.vy || Math.sin(asteroid.seed), asteroid.vx || Math.cos(asteroid.seed)) + Math.PI * 0.5;
    for (let i = 0; i < childCount; i += 1) {
      const spreadAngle = baseAngle + (Math.PI * 2 * i) / childCount + (Math.random() - 0.5) * 0.45;
      const seed = Math.random();
      const child = acquireAsteroid({
        x: asteroid.x,
        y: asteroid.y,
        type: asteroid.type,
        seed,
        fragmentTier: childTier,
        dropScale: Math.max(0.16, asteroid.dropScale * (0.5 + Math.random() * 0.08) / childCount),
      });
      const offset = Math.max(asteroid.radius * 0.36, child.radius * 0.86);
      child.x += Math.cos(spreadAngle) * offset;
      child.y += Math.sin(spreadAngle) * offset;
      child.vx = asteroid.vx * 0.72 + Math.cos(spreadAngle) * speed * (0.42 + seed * 0.18);
      child.vy = asteroid.vy * 0.72 + Math.sin(spreadAngle) * speed * (0.42 + seed * 0.18);
      child.scannerRevealed = asteroid.scannerRevealed;
      asteroids.push(child);
    }
    return { didFragment: true, childCount };
  }
}
