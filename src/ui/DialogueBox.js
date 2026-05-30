export class DialogueBox {
  constructor({ speaker = '', text = '' } = {}) {
    this.element = document.createElement('article');
    this.element.className = 'dialogue-box';
    this.element.innerHTML = `
      ${speaker ? `<strong>${speaker}</strong>` : ''}
      <p>${text}</p>
    `;
  }
}
