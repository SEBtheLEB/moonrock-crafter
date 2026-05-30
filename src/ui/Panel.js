export class Panel {
  constructor({ title = '', body = '', className = '', children = [] } = {}) {
    this.element = document.createElement('section');
    this.element.className = `ui-panel ${className}`.trim();
    this.element.innerHTML = `
      <span class="panel-rivet rivet-a" aria-hidden="true"></span>
      <span class="panel-rivet rivet-b" aria-hidden="true"></span>
      <header>
        <h1>${title}</h1>
        ${body ? `<p>${body}</p>` : ''}
      </header>
    `;
    const actions = document.createElement('div');
    actions.className = 'panel-actions';
    children.forEach((child) => actions.append(child));
    this.element.append(actions);
  }
}
