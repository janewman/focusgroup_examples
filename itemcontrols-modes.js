'use strict';

const modeDescriptions = {
  native: 'With no itemcontrols attribute, authored focusability is unchanged.',
  'no-tab': 'Press Enter to enter. Tab loops inside; Escape returns to the card.',
  'tab-exit': 'Press Enter to enter. Tab from the final control leaves the card.',
  'tab-only': 'Tab enters and exits the card’s nested controls.',
};

const authoredTabIndex = new WeakMap();

function controlsFor(card) {
  return [...card.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])')];
}

function rememberTabIndex(element) {
  if (!authoredTabIndex.has(element)) {
    authoredTabIndex.set(element, element.getAttribute('tabindex'));
  }
}

function setTabEligible(element, eligible) {
  rememberTabIndex(element);
  if (!eligible) {
    element.tabIndex = -1;
    return;
  }
  const original = authoredTabIndex.get(element);
  if (original === null) {
    element.removeAttribute('tabindex');
  } else {
    element.setAttribute('tabindex', original);
  }
}

function configureCard(card, mode) {
  if (mode === 'native') {
    card.removeAttribute('itemcontrols');
  } else {
    card.setAttribute('itemcontrols', mode);
  }
  controlsFor(card).forEach((control) => {
    setTabEligible(control, mode === 'native' || mode === 'tab-only');
  });
  card.dataset.controlsOpen = mode === 'native' || mode === 'tab-only' ? 'true' : 'false';
}

function simplifiedMarkup(mode) {
  const attribute = mode === 'native' ? '' : ` itemcontrols="${mode}"`;
  return `<article tabindex="0"${attribute}>
  <a href="/project">Open</a>
  <button>Pin</button>
  <button>More</button>
</article>`;
}

function openCardControls(card) {
  const controls = controlsFor(card);
  controls.forEach((control) => setTabEligible(control, true));
  card.dataset.controlsOpen = 'true';
  controls[0]?.focus();
}

function closeCardControls(card) {
  controlsFor(card).forEach((control) => setTabEligible(control, false));
  card.dataset.controlsOpen = 'false';
  card.focus();
}

function installCardBehavior(card) {
  card.addEventListener('keydown', (event) => {
    const mode = card.getAttribute('itemcontrols');
    const controls = controlsFor(card);
    const controlIndex = controls.indexOf(event.target);

    if ((mode === 'no-tab' || mode === 'tab-exit') && event.target === card && event.key === 'Enter') {
      event.preventDefault();
      openCardControls(card);
      return;
    }
    if ((mode === 'no-tab' || mode === 'tab-exit') && event.key === 'Escape' && controlIndex !== -1) {
      event.preventDefault();
      closeCardControls(card);
      return;
    }
    if (mode !== 'no-tab' || event.key !== 'Tab' || controlIndex === -1) {
      return;
    }

    event.preventDefault();
    const delta = event.shiftKey ? -1 : 1;
    controls[(controlIndex + delta + controls.length) % controls.length].focus();
  });

  card.addEventListener('focusout', () => {
    queueMicrotask(() => {
      const mode = card.getAttribute('itemcontrols');
      if ((mode === 'no-tab' || mode === 'tab-exit') && !card.contains(document.activeElement)) {
        controlsFor(card).forEach((control) => setTabEligible(control, false));
        card.dataset.controlsOpen = 'false';
      }
    });
  });
}

function setupModeOptions(group) {
  const card = document.querySelector(`#${group.dataset.cardId}`);
  const markup = document.querySelector(`#${group.dataset.markupId}`);
  const instructions = group.dataset.instructionsId
    ? document.querySelector(`#${group.dataset.instructionsId}`)
    : null;
  const options = [...group.querySelectorAll('[data-mode]')];
  const block = group.getAttribute('focusgroup').includes('block');

  function select(option) {
    options.forEach((candidate) => {
      const selected = candidate === option;
      candidate.setAttribute('aria-checked', String(selected));
      candidate.tabIndex = selected ? 0 : -1;
    });
    configureCard(card, option.dataset.mode);
    markup.textContent = simplifiedMarkup(option.dataset.mode);
    if (instructions) {
      instructions.textContent = modeDescriptions[option.dataset.mode];
    }
  }

  group.addEventListener('focusin', (event) => {
    const option = event.target.closest('[data-mode]');
    if (option && group.contains(option)) {
      select(option);
    }
  });

  group.addEventListener('keydown', (event) => {
    const index = options.indexOf(event.target);
    if (index === -1) {
      return;
    }
    const previousKey = block ? 'ArrowUp' : 'ArrowLeft';
    const nextKey = block ? 'ArrowDown' : 'ArrowRight';
    if (event.key !== previousKey && event.key !== nextKey) {
      return;
    }
    event.preventDefault();
    const delta = event.key === nextKey ? 1 : -1;
    options[(index + delta + options.length) % options.length].focus();
  });

  select(options.find((option) => option.getAttribute('aria-checked') === 'true') || options[0]);
}

function setupModeLab() {
  const card = document.querySelector('#mode-card');
  const log = document.querySelector('#mode-log');
  installCardBehavior(card);

  document.querySelector('.mode-stage').addEventListener('focusin', (event) => {
    const label = event.target === card
      ? 'card boundary'
      : event.target.textContent?.trim() || event.target.placeholder || event.target.tagName.toLowerCase();
    log.textContent = `Focus: ${label}`;
  });
}

function setupCrossAxisMenu() {
  const menu = document.querySelector('#cross-axis-menu');
  const parents = [...menu.querySelectorAll('.menu-parent')];
  const status = document.querySelector('#submenu-status');
  let activeParent = parents[0];

  function activate(parent) {
    activeParent = parent;
    parents.forEach((item) => {
      item.tabIndex = item === parent ? 0 : -1;
      const panel = document.querySelector(`#${item.dataset.submenuId}`);
      panel.hidden = item !== parent;
      controlsFor(panel).forEach((control) => setTabEligible(control, false));
    });
    parent.focus();
    status.textContent = `Parent: ${parent.firstElementChild.textContent}`;
  }

  function enterSubmenu() {
    const panel = document.querySelector(`#${activeParent.dataset.submenuId}`);
    const controls = controlsFor(panel);
    controls.forEach((control, index) => {
      rememberTabIndex(control);
      control.tabIndex = index === 0 ? 0 : -1;
    });
    controls[0]?.focus();
    status.textContent = `Submenu entered: ${activeParent.firstElementChild.textContent}`;
  }

  menu.addEventListener('keydown', (event) => {
    const index = parents.indexOf(event.target);
    if (index === -1) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      activate(parents[(index + delta + parents.length) % parents.length]);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      enterSubmenu();
    }
  });

  menu.addEventListener('keydown', (event) => {
    const nestedGroup = event.target.closest('[data-nested-focusgroup]');
    const nestedItems = nestedGroup ? controlsFor(nestedGroup) : [];
    const nestedIndex = nestedItems.indexOf(event.target);
    if (nestedIndex !== -1 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = nestedItems[(nestedIndex + delta + nestedItems.length) % nestedItems.length];
      nestedItems.forEach((item) => {
        item.tabIndex = item === next ? 0 : -1;
      });
      next.focus();
      status.textContent = `Nested focusgroup: ${next.textContent}`;
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      event.preventDefault();
      const panel = event.target.closest('.submenu-panel');
      controlsFor(panel).forEach((control) => setTabEligible(control, false));
      activeParent.focus();
      status.textContent = `Returned to parent: ${activeParent.firstElementChild.textContent}`;
    }
  });

  activate(parents[0]);
}

document.addEventListener('DOMContentLoaded', () => {
  setupModeLab();
  setupCrossAxisMenu();
  document.querySelectorAll('[data-mode-options]').forEach(setupModeOptions);
});
