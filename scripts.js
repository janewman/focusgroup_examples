// Native focusgroup only: no JS polyfill. Feature detection + gentle note.
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const probe = document.createElement('div');
    const supported = 'focusgroup' in probe;
    if (!supported) {
      // Non-intrusive hint in the console; no behavior simulation.
      console.warn('[focusgroup] Not detected. Some examples require native support.\n' +
        'If available in your browser, enable Experimental Web Platform features.');
    }

    // No header popovers: navigation is via the collapsible TOC (details/summary).

    // Simple syntax highlighter for demo snippets

// Demo custom element to showcase Shadow DOM participation in focusgroup
class XListbox extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <style>
          :host { display: inline-block; border: 1px dashed #374151; border-radius: .5rem; }
          .box { display: inline-flex; flex-direction: column; gap: .5rem; padding: .5rem; }
          button { appearance: none; border: 1px solid #374151; background: #1f2937; color: #e5e7eb; padding: .5rem .75rem; border-radius: .5rem; cursor: pointer; }
        </style>
        <div class="box" role="listbox" aria-label="${this.getAttribute('aria-label') || 'Listbox'}">
          <button role="option" aria-selected="true">Terrier</button>
          <button role="option" aria-selected="false">Dalmatian</button>
          <button role="option" aria-selected="false">Saint Bernard</button>
        </div>
      `;
    }
  }
}

try {
  customElements.define('x-listbox', XListbox);
} catch { /* ignore redefines */ }
    document.querySelectorAll('pre code').forEach(block => {
      let html = block.innerHTML;
      // Highlight tags
      html = html.replace(/(&lt;\/?)([\w-]+)(.*?)(&gt;)/gs, (match, start, tagName, attrs, end) => {
        // Highlight attributes within the tag
        const coloredAttrs = attrs.replace(/(\s+)([\w-]+)(?:(=)(".*?"))?/g, (match, space, name, equals, value) => {
          if (equals && value) {
            return `${space}<span class="token-attr">${name}</span>${equals}<span class="token-string">${value}</span>`;
          }
          return `${space}<span class="token-attr">${name}</span>`;
        });
        return `<span class="token-tag">${start}${tagName}</span>${coloredAttrs}<span class="token-tag">${end}</span>`;
      });
      block.innerHTML = html;
    });
  });
})();
