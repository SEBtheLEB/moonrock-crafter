export class Modal {
  constructor({ title = '', body = '', className = '', children = [] } = {}) {
    this.element = document.createElement('div');
    this.element.className = `modal-backdrop ${className}`.trim();
    this.element.innerHTML = `
      <section class="modal-panel" role="dialog" aria-modal="true" aria-label="${title}">
        <span class="panel-rivet rivet-a" aria-hidden="true"></span>
        <span class="panel-rivet rivet-b" aria-hidden="true"></span>
        <h1>${title}</h1>
        ${body ? `<p>${body}</p>` : ''}
        <div class="modal-actions"></div>
      </section>
    `;
    const actions = this.element.querySelector('.modal-actions');
    children.forEach((child) => actions.append(child));
  }
}
