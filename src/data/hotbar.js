export const HOTBAR_SLOT_COUNT = 7;

export const EMPTY_HOTBAR_SLOT = {
  id: 'empty',
  label: 'Empty',
  shortLabel: 'Empty',
  icon: '+',
  iconHtml: '<span class="tool-icon-shape icon-empty"><i></i></span>',
  action: null,
  tone: 'empty',
  description: 'Open tool slot.',
};

export const hotbarSlotCatalog = [
  {
    id: 'miner',
    inventoryItemId: 'minerTool',
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
    inventoryItemId: 'swordWeapon',
    label: 'Sword',
    shortLabel: 'Slash',
    icon: 'W',
    iconHtml: '<span class="tool-icon-shape icon-sword"><i></i></span>',
    action: 'attack',
    tone: 'tech',
    description: 'Swing a wide energy blade toward the cursor.',
  },
  {
    id: 'laserGun',
    inventoryItemId: 'laserGun',
    label: 'Laser Gun',
    shortLabel: 'Laser',
    icon: 'LG',
    iconHtml: '<span class="tool-icon-shape icon-laser-gun"><i></i></span>',
    action: 'attack',
    tone: 'laser',
    description: 'A crafted sidearm that rotates with your aim while equipped.',
  },
  {
    id: 'stabilizer',
    inventoryItemId: 'gravityStabilizer',
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
    inventoryItemId: 'markerFlag',
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
    inventoryItemId: 'craftingStationKit',
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
    inventoryItemId: 'starterFurnace',
    label: 'Furnace',
    shortLabel: 'Furn',
    icon: 'Fu',
    iconHtml: '<span class="tool-icon-shape icon-furnace"><i></i></span>',
    action: 'placeFurnace',
    tone: 'furnace',
    description: 'Place a crafted furnace blueprint.',
  },
];

export const DEFAULT_HOTBAR_SLOT_IDS = [
  'miner',
  'weapon',
  'stabilizer',
  'flag',
  'craftingStation',
  null,
  null,
];

export const hotbarSlots = DEFAULT_HOTBAR_SLOT_IDS.map((slotId) => getHotbarSlotById(slotId));

export function getHotbarSlotById(slotId) {
  if (!slotId) return EMPTY_HOTBAR_SLOT;
  return hotbarSlotCatalog.find((slot) => slot.id === slotId) || EMPTY_HOTBAR_SLOT;
}

export function getHotbarSlotForItem(itemId) {
  if (!itemId) return null;
  return hotbarSlotCatalog.find((slot) => slot.inventoryItemId === itemId) || null;
}

export function getHotbarSlot(index) {
  return hotbarSlots[((index % HOTBAR_SLOT_COUNT) + HOTBAR_SLOT_COUNT) % HOTBAR_SLOT_COUNT] || EMPTY_HOTBAR_SLOT;
}
