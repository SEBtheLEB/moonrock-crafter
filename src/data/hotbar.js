export const HOTBAR_SLOT_COUNT = 7;

export const hotbarSlots = [
  {
    id: 'miner',
    label: 'Miner',
    shortLabel: 'Mine',
    icon: 'M',
    iconHtml: '<span class="tool-icon-shape icon-miner"><i></i></span>',
    action: 'mine',
    tone: 'forge',
    description: 'Mining laser for asteroids and voxel terrain.',
  },
  {
    id: 'weapon',
    label: 'Sword',
    shortLabel: 'Slash',
    icon: 'W',
    iconHtml: '<span class="tool-icon-shape icon-sword"><i></i></span>',
    action: 'attack',
    tone: 'tech',
    description: 'Swing a wide energy blade toward the cursor.',
  },
  {
    id: 'stabilizer',
    label: 'Gravity',
    shortLabel: 'Grav',
    icon: 'G',
    iconHtml: '<span class="tool-icon-shape icon-gravity"><i></i></span>',
    action: 'stabilize',
    tone: 'utility',
    description: 'Restabilize island gravity while on foot.',
  },
  {
    id: 'flag',
    label: 'Flag',
    shortLabel: 'Flag',
    icon: 'F',
    iconHtml: '<span class="tool-icon-shape icon-flag"><i></i></span>',
    action: 'placeFlag',
    tone: 'flag',
    description: 'Place a marker flag on voxel terrain.',
  },
  {
    id: 'craftingStation',
    label: 'Crafting Station',
    shortLabel: 'Craft',
    icon: 'Cr',
    iconHtml: '<span class="tool-icon-shape icon-craft"><i></i></span>',
    action: 'placeCraftingStation',
    tone: 'crafting',
    description: 'Place the starter crafting station on voxel terrain.',
  },
  {
    id: 'furnace',
    label: 'Furnace',
    shortLabel: 'Furn',
    icon: 'Fu',
    iconHtml: '<span class="tool-icon-shape icon-furnace"><i></i></span>',
    action: 'placeFurnace',
    tone: 'furnace',
    description: 'Place a crafted furnace blueprint.',
  },
  {
    id: 'empty-7',
    label: 'Empty',
    shortLabel: 'Empty',
    icon: '+',
    iconHtml: '<span class="tool-icon-shape icon-empty"><i></i></span>',
    action: null,
    tone: 'empty',
    description: 'Open tool slot.',
  },
];

export function getHotbarSlot(index) {
  return hotbarSlots[((index % HOTBAR_SLOT_COUNT) + HOTBAR_SLOT_COUNT) % HOTBAR_SLOT_COUNT] || hotbarSlots[0];
}
