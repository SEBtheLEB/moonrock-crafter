import { animals as animalData } from '../data/animals.js?v=30';
import { islands } from '../data/islands.js?v=30';
import { islandResourceNodes } from '../data/islandResources.js?v=30';
import { IslandAnimal } from '../entities/IslandAnimal.js';
import { IslandResourceNode } from '../entities/IslandResourceNode.js';

const LAYOUT_OFFSETS = {
  tinyScrap: {
    nodes: [
      { id: 'scrapTree', x: 430 },
      { id: 'ironVein', x: 690 },
      { id: 'glowberryBush', x: 880 },
    ],
    animals: [{ id: 'tinyHopper', x: 1040 }],
  },
  forestRock: {
    nodes: [
      { id: 'spaceTree', x: 380 },
      { id: 'sapTree', x: 620 },
      { id: 'mushroomPatch', x: 850 },
      { id: 'ironVein', x: 1180 },
    ],
    animals: [{ id: 'spaceBoar', x: 1010 }, { id: 'glowbird', x: 1340 }],
  },
  crystalIsland: {
    nodes: [
      { id: 'crystalNode', x: 480 },
      { id: 'glowMossPatch', x: 760 },
      { id: 'rareCrystalNode', x: 1060 },
    ],
    animals: [{ id: 'crystalBug', x: 930 }],
  },
  emberIsland: {
    nodes: [
      { id: 'charcoalTree', x: 420 },
      { id: 'firePepperBush', x: 790 },
      { id: 'emberVein', x: 1150 },
    ],
    animals: [{ id: 'emberLizard', x: 1040 }],
  },
};

export class IslandSystem {
  constructor(game) {
    this.game = game;
    this.islands = islands;
  }

  getIsland(id) {
    return this.islands.find((island) => island.id === id) || this.islands[0];
  }

  createRuntime(island, world) {
    const layout = LAYOUT_OFFSETS[island.layoutId] || LAYOUT_OFFSETS.tinyScrap;
    const nodes = layout.nodes
      .map((entry) => islandResourceNodes[entry.id] ? new IslandResourceNode({
        data: islandResourceNodes[entry.id],
        x: entry.x,
        y: world.floorY,
      }) : null)
      .filter(Boolean);
    const animals = layout.animals
      .map((entry) => animalData[entry.id] ? new IslandAnimal({
        data: animalData[entry.id],
        x: entry.x,
        y: world.floorY,
      }) : null)
      .filter(Boolean);
    return { nodes, animals };
  }

  addDropsToCargo(drops = {}, capacity, scene) {
    const collected = [];
    for (const [materialId, amount] of Object.entries(drops)) {
      const result = this.game.systems.inventory.addToRunCargo(materialId, amount, { capacity });
      if (!result.ok) {
        this.game.ui.showToast('Cargo Full', 'danger');
        this.game.audio.playCargoFull();
        return { ok: false, collected };
      }
      collected.push({ materialId, amount, result });
      this.game.systems.objectives.record('materialCollected', { materialId, amount });
      const material = this.game.systems.materials.getMaterial(materialId);
      scene?.addFloatingText?.(`+${amount} ${this.game.systems.materials.getDisplayName(materialId)}`, material?.color);
      this.game.audio.playIslandPickup?.();
    }
    return { ok: true, collected };
  }
}
