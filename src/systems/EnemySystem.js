import { enemies, enemySpawnProfiles } from '../data/enemies.js?v=115';
import { FlyingDroneEnemy } from '../entities/enemies/FlyingDroneEnemy.js?v=115';

const TAU = Math.PI * 2;
const FLYING_ENEMY_ID = 'sentryDrone';

function hashString(value = '') {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seedValue) {
  let seed = seedValue >>> 0;
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export class EnemySystem {
  constructor(scene) {
    this.scene = scene;
    this.activeIslandId = '';
    this.enemies = [];
    this.spawnTimer = 0;
    this.random = Math.random;
  }

  clear() {
    this.activeIslandId = '';
    this.enemies.length = 0;
    this.spawnTimer = 0;
  }

  setActiveIsland(island) {
    if (!island) {
      this.clear();
      return;
    }
    if (this.activeIslandId === island.id) return;
    this.activeIslandId = island.id;
    this.random = createRandom(hashString(`enemy-spawns:${island.id}:${island.biome}`));
    this.enemies = this.createEnemiesForIsland(island);
    this.spawnTimer = this.getFlyingSpawnDelay();
  }

  createEnemiesForIsland(island) {
    const profile = enemySpawnProfiles[island.id] || enemySpawnProfiles[island.biome] || enemySpawnProfiles.scrap;
    const random = createRandom(hashString(`enemies:${island.id}:${island.biome}`));
    const items = [];
    Object.entries(profile).forEach(([enemyId, count]) => {
      const data = enemies[enemyId];
      if (!data || data.type !== 'flyingDrone') return;
      if (count <= 0) return;
      const cappedCount = Math.min(count, data.maxPerIsland || count);
      for (let index = 0; index < cappedCount; index += 1) {
        const safeGap = TAU / Math.max(1, cappedCount + 1);
        const baseAngle = -Math.PI / 2 + safeGap * (index + 1);
        const angle = baseAngle + (random() - 0.5) * 0.55;
        items.push(this.createEnemy(enemyId, island, angle, random));
      }
    });
    return items.filter(Boolean);
  }

  createEnemy(enemyId, island, angle, random = Math.random) {
    const data = enemies[enemyId];
    if (!data) return null;
    const options = {
      data,
      island,
      angle,
      seed: hashString(`${island.id}:${enemyId}:${Math.round(angle * 1000)}:${Math.round(random() * 100000)}`),
    };
    if (data.type === 'flyingDrone') return new FlyingDroneEnemy(options);
    return null;
  }

  spawnEnemy(enemyId, island, angle = -Math.PI / 2) {
    if (!island) return null;
    this.setActiveIsland(island);
    const enemy = this.createEnemy(enemyId, island, angle, Math.random);
    if (!enemy) return null;
    this.enemies.push(enemy);
    return enemy;
  }

  update(delta, { island, player, viewRotation = 0, toWorld, onPlayerDamage } = {}) {
    if (!island || !player) return;
    this.setActiveIsland(island);
    this.updateFlyingSpawner(delta, island, player);
    const converter = toWorld || ((x, y) => island.localToWorldRotated(x, y, viewRotation));
    for (const enemy of this.enemies) {
      enemy.update(delta, {
        island,
        player,
        viewRotation,
        toWorld: converter,
        onPlayerDamage,
      });
    }
    this.enemies = this.enemies.filter((enemy) => enemy.isActive());
  }

  updateFlyingSpawner(delta, island, player) {
    const data = enemies[FLYING_ENEMY_ID];
    if (!data || data.type !== 'flyingDrone') return;
    const activeFlyers = this.enemies.filter((enemy) => enemy.enemyId === FLYING_ENEMY_ID && enemy.isActive()).length;
    const maxActive = Math.max(1, data.maxActive || 2);
    if (activeFlyers >= maxActive) {
      if (this.spawnTimer <= 0) this.spawnTimer = this.getFlyingSpawnDelay();
      return;
    }
    this.spawnTimer -= delta;
    if (this.spawnTimer > 0) return;
    const center = island.getCenterLocal?.() || { x: island.width * 0.5, y: island.height * 0.5 };
    const playerAngle = Math.atan2(player.centerY - center.y, player.centerX - center.x);
    const side = this.random() < 0.5 ? -1 : 1;
    const angle = playerAngle + side * (1.25 + this.random() * 0.85);
    this.spawnEnemy(FLYING_ENEMY_ID, island, angle);
    this.spawnTimer = this.getFlyingSpawnDelay();
  }

  getFlyingSpawnDelay() {
    const data = enemies[FLYING_ENEMY_ID] || {};
    const min = data.spawnIntervalMin ?? 20;
    const max = Math.max(min, data.spawnIntervalMax ?? 30);
    return min + this.random() * (max - min);
  }

  syncWorldPositions(island, viewRotation = 0, toWorld = null) {
    if (!island) return;
    const converter = toWorld || ((x, y) => island.localToWorldRotated(x, y, viewRotation));
    for (const enemy of this.enemies) {
      enemy.updateWorldPosition({ toWorld: converter });
    }
  }

  getThreats() {
    return this.enemies.filter((enemy) => (enemy.isTargetable ? enemy.isTargetable() : enemy.isActive()));
  }

  getDrawableEnemies() {
    return this.enemies.filter((enemy) => enemy.isActive());
  }
}
