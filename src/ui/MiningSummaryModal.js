import { Button } from './Button.js';
import { Modal } from './Modal.js';

export function createMiningSummaryModal(game, summary, onContinue) {
  const cargoLines = renderGroupedCargo(game, summary.cargo || {});
  const lostLines = renderGroupedCargo(game, summary.lostCargo || {});
  const body = summary.type === 'crashed'
    ? 'Ship recovered. A little cargo survived the impact.'
    : summary.type === 'recalled'
      ? 'Recall beacon caught the ship. Cargo transferred to storage.'
      : 'Docking clamps locked. Cargo transferred to storage.';

  const modal = new Modal({
    title: summary.type === 'crashed' ? 'Crash Recovery' : summary.type === 'recalled' ? 'Emergency Recall' : 'Mining Summary',
    body,
    className: 'mining-summary-modal',
    children: [
      new Button('Continue', () => {
        game.ui.hideModal();
        onContinue?.();
      }, { icon: '>', variant: 'success' }).element,
    ],
  }).element;

  const panel = modal.querySelector('.modal-panel');
  const details = document.createElement('div');
  details.className = 'summary-details';
  details.innerHTML = `
    <div><span>Distance</span><strong>${summary.distance || 0}m</strong></div>
    <div><span>Cargo Value</span><strong>$${summary.cargoValue ?? game.systems.materials.getCargoValue(summary.cargo || {})}</strong></div>
    <div><span>Asteroids</span><strong>${summary.asteroidsMined || 0}</strong></div>
    <div><span>Rare Finds</span><strong>${summary.rareFinds || 0}</strong></div>
    <div><span>Farthest Zone</span><strong>${summary.farthestZone || 'Scrap Belt'}</strong></div>
  `;
  const cargo = document.createElement('div');
  cargo.className = 'summary-cargo';
  cargo.innerHTML = `
    <h2>Materials Collected</h2>
    ${cargoLines || '<span>Nothing this run</span>'}
    ${lostLines ? `<h2>Lost In Crash</h2>${lostLines}` : ''}
  `;
  panel.insertBefore(details, panel.querySelector('.modal-actions'));
  panel.insertBefore(cargo, panel.querySelector('.modal-actions'));
  return modal;
}

function renderGroupedCargo(game, cargo) {
  const groups = game.systems.materials.groupCargoByRarity(cargo);
  return ['epic', 'rare', 'uncommon', 'common']
    .filter((rarity) => groups[rarity]?.length)
    .map((rarity) => {
      const color = game.systems.materials.getRarityColor(rarity);
      const items = groups[rarity]
        .map((item) => `<span class="summary-material" data-rarity="${rarity}" style="--material-color:${item.color}"><strong>${item.amount}</strong> ${item.name}</span>`)
        .join('');
      return `<section class="summary-rarity" style="--rarity-color:${color}"><h3>${game.systems.materials.getRarityLabel(rarity)}</h3>${items}</section>`;
    })
    .join('');
}
