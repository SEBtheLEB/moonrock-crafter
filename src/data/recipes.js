import { items } from './items.js';

export const recipes = items.map((item) => ({
  id: item.id,
  output: item.id,
  ingredients: item.requiredMaterials,
  requiredMiniGames: item.requiredMiniGames,
  difficulty: item.difficulty,
}));
