'use strict';

const MODE_DESCRIPTIONS = {
  native: 'With no itemcontrols attribute, authored focusability is unchanged.',
  'no-tab': 'Press Enter to enter. Tab loops inside; Escape returns to the item.',
  'tab-exit': 'Press Enter to enter. Tab from the final control leaves the item.',
  'tab-only': 'Tab enters and exits the item’s nested controls.',
  inlineentry: 'Inline-end enters nested content; inline-start returns to the item.',
  blockentry: 'Block-end enters nested content; block-start returns to the item.',
};

const authoredTabIndex = new WeakMap();

function controlsFor(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])',
  )];
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

function setItemcontrols(element, mode) {
  if (mode === 'native') {
    element.removeAttribute('itemcontrols');
  } else {
    element.setAttribute('itemcontrols', mode);
  }
}

function isClosedMode(mode) {
  return ['no-tab', 'tab-exit', 'inlineentry', 'blockentry'].includes(mode);
}

function entryKey(mode) {
  if (mode === 'no-tab' || mode === 'tab-exit') {
    return 'Enter';
  }
  if (mode === 'inlineentry') {
    return 'ArrowRight';
  }
  if (mode === 'blockentry') {
    return 'ArrowDown';
  }
  return null;
}

function exitKey(mode) {
  if (mode === 'inlineentry') {
    return 'ArrowLeft';
  }
  if (mode === 'blockentry') {
    return 'ArrowUp';
  }
  return null;
}

function openControls(item) {
  const controls = controlsFor(item);
  controls.forEach((control) => setTabEligible(control, true));
  item.dataset.controlsOpen = 'true';
  controls[0]?.focus();
}

function closeControls(item) {
  controlsFor(item).forEach((control) => setTabEligible(control, false));
  item.dataset.controlsOpen = 'false';
  item.focus();
}

function handleNestedControlKey(event, item, mode) {
  const controls = controlsFor(item);
  const controlIndex = controls.indexOf(event.target);
  if (controlIndex === -1) {
    return false;
  }
  if (isClosedMode(mode) && event.key === 'Escape') {
    event.preventDefault();
    closeControls(item);
    return true;
  }
  if (mode === 'no-tab' && event.key === 'Tab') {
    event.preventDefault();
    const delta = event.shiftKey ? -1 : 1;
    controls[(controlIndex + delta + controls.length) % controls.length].focus();
    return true;
  }
  if (event.key === exitKey(mode)) {
    event.preventDefault();
    closeControls(item);
    return true;
  }
  return false;
}

function sequentiallyFocusableElements() {
  return [...document.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]',
  )].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
}

function handleReverseEntry(event) {
  if (event.key !== 'Tab' || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }
  const order = sequentiallyFocusableElements();
  const currentIndex = order.indexOf(document.activeElement);
  const previous = currentIndex > 0 ? order[currentIndex - 1] : null;
  const item = previous?.closest('#mode-card, .menu-parent, [data-composed-item], [data-mixed-item]');
  const controller = item?.hasAttribute('itemcontrols') ? item : item?.closest('[itemcontrols]');
  if (!item || !controller || item === previous || item.contains(document.activeElement)) {
    return;
  }
  event.preventDefault();
  item.focus();
}

function attributeFragment(mode) {
  return mode === 'native' ? '' : ` itemcontrols="${mode}"`;
}

function standaloneMarkup(mode) {
  return `<article tabindex="0"${attributeFragment(mode)}>
  <a href="/project">Open</a>
  <button>Pin</button>
  <button>More</button>
</article>`;
}

function pairedMarkup(owner, item, mode) {
  const itemAttribute = attributeFragment(mode);
  const ownerAttribute = attributeFragment(mode);
  if (owner === 'menu') {
    return {
      item: `<div focusgroup="menu block">
  <div tabindex="0"${itemAttribute}>
    Projects
    <div focusgroup="menu block">…</div>
  </div>
</div>`,
      owner: `<div focusgroup="menu block"${ownerAttribute}>
  <div tabindex="0">
    Projects
    <div focusgroup="menu block">…</div>
  </div>
</div>`,
    };
  }
  const tag = owner === 'feed' ? 'article' : 'div';
  const ownerValue = owner === 'toolbar' ? 'toolbar block' : owner === 'grid' ? 'grid manual' : 'feed';
  const label = owner === 'feed' ? 'Post content' : owner === 'grid' ? 'Design spec' : 'Background';
  const controls = owner === 'feed'
    ? '<button focusgroup="none">Like</button>\n    <button focusgroup="none">Reply</button>'
    : owner === 'toolbar'
      ? '<button focusgroup="none">Hide</button>\n    <button focusgroup="none">More</button>'
      : '<button focusgroup="none">Open</button>';
  return {
    item: `<div focusgroup="${ownerValue}">
  <${tag} tabindex="0"${itemAttribute}>
    ${label}
    ${controls}
  </${tag}>
</div>`,
    owner: `<div focusgroup="${ownerValue}"${ownerAttribute}>
  <${tag} tabindex="0">
    ${label}
    ${controls}
  </${tag}>
</div>`,
  };
}

function setupChoiceGroup(group, onChange) {
  const options = [...group.querySelectorAll('[data-mode]')];
  function select(option) {
    options.forEach((candidate) => {
      const selected = candidate === option;
      candidate.setAttribute('aria-checked', String(selected));
      candidate.tabIndex = selected ? 0 : -1;
    });
    onChange(option.dataset.mode);
  }
  group.addEventListener('focusin', (event) => {
    const option = event.target.closest('[data-mode]');
    if (option) {
      select(option);
    }
  });
  group.addEventListener('keydown', (event) => {
    const index = options.indexOf(event.target);
    if (index === -1 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    options[(index + delta + options.length) % options.length].focus();
  });
  select(options.find((option) => option.getAttribute('aria-checked') === 'true') || options[0]);
}

function setupStandalone() {
  const card = document.querySelector('#mode-card');
  const status = document.querySelector('#mode-log');
  let mode = 'inlineentry';
  card.addEventListener('keydown', (event) => {
    if (event.target === card && event.key === entryKey(mode)) {
      event.preventDefault();
      openControls(card);
      return;
    }
    handleNestedControlKey(event, card, mode);
  });
  card.addEventListener('focusout', () => {
    setTimeout(() => {
      if (isClosedMode(mode) && !card.contains(document.activeElement)) {
        controlsFor(card).forEach((control) => setTabEligible(control, false));
      }
    });
  });
  document.querySelector('.mode-stage').addEventListener('focusin', (event) => {
    status.textContent = `Focus: ${event.target === card ? 'card boundary' : event.target.textContent.trim()}`;
  });
  setupChoiceGroup(document.querySelector('[data-standalone-mode-options]'), (newMode) => {
    mode = newMode;
    setItemcontrols(card, mode);
    const available = mode === 'native' || mode === 'tab-only';
    controlsFor(card).forEach((control) => setTabEligible(control, available));
    document.querySelector('#mode-instructions').textContent = MODE_DESCRIPTIONS[mode];
    document.querySelector('#mode-markup').textContent = standaloneMarkup(mode);
  });
}

function setupMenuFocusgroup(menu) {
  const items = [...menu.querySelectorAll('.menu-parent')];
  const status = menu.closest('.submenu-shell').querySelector('.status-line');
  let mode = 'tab-only';
  let activeIndex = 0;
  function configure(item, active) {
    setItemcontrols(item, mode);
    const available = active && (mode === 'native' || mode === 'tab-only');
    controlsFor(item).forEach((control, index) => setTabEligible(control, available && index === 0));
  }
  function activate(index, focus) {
    activeIndex = index;
    items.forEach((item, itemIndex) => {
      const active = itemIndex === activeIndex;
      item.tabIndex = active ? 0 : -1;
      item.querySelector('.submenu-panel').hidden = !active;
      configure(item, active);
    });
    if (focus) {
      items[activeIndex].focus();
    }
    status.textContent = `Parent: ${items[activeIndex].querySelector('.menu-parent-label span').textContent}`;
  }
  menu.addEventListener('keydown', (event) => {
    const item = event.target.closest('.menu-parent');
    const index = items.indexOf(item);
    if (index === -1) {
      return;
    }
    if (event.target === item) {
      if (event.key === entryKey(mode)) {
        event.preventDefault();
        openControls(item);
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        activate((index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length, true);
      }
      return;
    }
    if (handleNestedControlKey(event, item, mode)) {
      return;
    }
    const nested = event.target.closest('[data-nested-focusgroup]');
    const nestedItems = nested ? controlsFor(nested) : [];
    const nestedIndex = nestedItems.indexOf(event.target);
    if (nestedIndex !== -1 && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const next = nestedIndex + (event.key === 'ArrowDown' ? 1 : -1);
      if (next >= 0 && next < nestedItems.length) {
        nestedItems.forEach((control, controlIndex) => {
          control.tabIndex = controlIndex === next ? 0 : -1;
        });
        nestedItems[next].focus();
      }
    }
  });
  activate(0, false);
  return {
    setMode(newMode) {
      mode = newMode;
      activate(activeIndex, false);
    },
  };
}

function setupLinearOrGrid(owner) {
  const items = [...owner.querySelectorAll('[data-composed-item]')];
  const columns = Number(owner.dataset.columns || 1);
  let mode = 'tab-only';
  let activeIndex = 0;
  function configure(item, active) {
    setItemcontrols(item, mode);
    const available = mode === 'native' || (mode === 'tab-only' && active);
    controlsFor(item).forEach((control) => setTabEligible(control, available));
    item.classList.toggle('active', active);
  }
  function activate(index, focus) {
    activeIndex = index;
    items.forEach((item, itemIndex) => {
      const active = itemIndex === activeIndex;
      item.tabIndex = active ? 0 : -1;
      configure(item, active);
    });
    if (focus) {
      items[activeIndex].focus();
    }
  }
  owner.addEventListener('focusin', (event) => {
    const index = items.indexOf(event.target.closest('[data-composed-item]'));
    if (index !== -1 && index !== activeIndex) {
      activate(index, false);
    }
  });
  owner.addEventListener('keydown', (event) => {
    const item = items[activeIndex];
    if (event.target === item && event.key === entryKey(mode)) {
      event.preventDefault();
      openControls(item);
      return;
    }
    if (item.contains(event.target) && event.target !== item && handleNestedControlKey(event, item, mode)) {
      return;
    }
    if (event.target !== item) {
      return;
    }
    let next = activeIndex;
    if (columns > 1) {
      if (event.key === 'ArrowLeft' && activeIndex % columns > 0) next -= 1;
      if (event.key === 'ArrowRight' && activeIndex % columns < columns - 1) next += 1;
      if (event.key === 'ArrowUp' && activeIndex >= columns) next -= columns;
      if (event.key === 'ArrowDown' && activeIndex + columns < items.length) next += columns;
    } else {
      if (event.key === 'ArrowUp' && activeIndex > 0) next -= 1;
      if (event.key === 'ArrowDown' && activeIndex < items.length - 1) next += 1;
    }
    if (next !== activeIndex) {
      event.preventDefault();
      activate(next, true);
    }
  });
  activate(0, false);
  return {
    setMode(newMode) {
      mode = newMode;
      activate(activeIndex, false);
    },
  };
}

function setupCompositionGallery() {
  const menu = setupMenuFocusgroup(document.querySelector('[data-direction-menu]'));
  const widgets = [...document.querySelectorAll('[data-composed-focusgroup]')].map(setupLinearOrGrid);
  setupChoiceGroup(document.querySelector('[data-composed-mode-options]'), (mode) => {
    menu.setMode(mode);
    widgets.forEach((widget) => widget.setMode(mode));
    document.querySelectorAll('[data-live-value-label]').forEach((label) => {
      label.textContent = mode === 'native' ? 'itemcontrols absent' : `itemcontrols="${mode}"`;
    });
    const direction = pairedMarkup('menu', 'div', mode);
    const action = pairedMarkup('toolbar', 'div', mode);
    const feed = pairedMarkup('feed', 'article', mode);
    const grid = pairedMarkup('grid', 'div', mode);
    const conflicts = {
      inlineentry: ['Grid cells'],
      blockentry: ['Nested submenu', 'Action list', 'Feed', 'Grid cells'],
    };
    const conflictSet = new Set(conflicts[mode] || []);
    document.querySelectorAll('.composed-demo').forEach((demo) => {
      const name = demo.querySelector('.composed-heading > div > span').textContent;
      demo.classList.toggle('axis-conflict', conflictSet.has(name));
      let warning = demo.querySelector('.axis-conflict-note');
      if (conflictSet.has(name)) {
        if (!warning) {
          warning = document.createElement('p');
          warning.className = 'axis-conflict-note';
          demo.querySelector('.composed-heading > div').append(warning);
        }
        warning.textContent = `${mode} conflicts with this focusgroup’s own directional axis.`;
      } else {
        warning?.remove();
      }
    });
    document.querySelector('#direction-item-markup').textContent = direction.item;
    document.querySelector('#direction-owner-markup').textContent = direction.owner;
    document.querySelector('#layers-item-markup').textContent = action.item;
    document.querySelector('#layers-owner-markup').textContent = action.owner;
    document.querySelector('#feed-item-markup').textContent = feed.item;
    document.querySelector('#feed-owner-markup').textContent = feed.owner;
    document.querySelector('#grid-item-markup').textContent = grid.item;
    document.querySelector('#grid-owner-markup').textContent = grid.owner;
  });
}

function setupMixedWorkspace() {
  const owner = document.querySelector('[data-mixed-workspace]');
  const items = [...owner.querySelectorAll('[data-mixed-item]')];
  const status = document.querySelector('#mixed-status');
  let activeIndex = 0;
  const modeFor = (item) => item.getAttribute('itemcontrols') || 'native';
  function configure(item, active) {
    const mode = modeFor(item);
    const available = mode === 'native'
      || (mode === 'tab-only' && active)
      || (isClosedMode(mode) && active && item.dataset.controlsOpen === 'true');
    controlsFor(item).forEach((control) => setTabEligible(control, available));
    item.classList.toggle('active', active);
  }
  function activate(index, focus) {
    activeIndex = index;
    items.forEach((item, itemIndex) => {
      const active = itemIndex === activeIndex;
      item.tabIndex = active ? 0 : -1;
      if (!active && isClosedMode(modeFor(item))) item.dataset.controlsOpen = 'false';
      configure(item, active);
    });
    if (focus) items[activeIndex].focus();
    status.textContent = `Active item: ${items[activeIndex].querySelector('strong').textContent}`;
  }
  owner.addEventListener('focusin', (event) => {
    const index = items.indexOf(event.target.closest('[data-mixed-item]'));
    if (index !== -1 && index !== activeIndex) activate(index, false);
  });
  owner.addEventListener('keydown', (event) => {
    const item = items[activeIndex];
    const mode = modeFor(item);
    if (event.target === item) {
      if (event.key === entryKey(mode)) {
        event.preventDefault();
        openControls(item);
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        activate((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length, true);
      }
      return;
    }
    if (!item.contains(event.target)) return;
    const grid = event.target.closest('[data-mixed-grid]');
    const gridItems = grid ? controlsFor(grid) : [];
    const gridIndex = gridItems.indexOf(event.target);
    if (gridIndex !== -1 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const columns = Number(grid.dataset.columns);
      let next = gridIndex;
      if (event.key === 'ArrowLeft' && gridIndex % columns > 0) next -= 1;
      if (event.key === 'ArrowRight' && gridIndex % columns < columns - 1) next += 1;
      if (event.key === 'ArrowUp' && gridIndex >= columns) next -= columns;
      if (event.key === 'ArrowDown' && gridIndex + columns < gridItems.length) next += columns;
      if (next !== gridIndex) {
        event.preventDefault();
        gridItems[next].focus();
      }
      return;
    }
    const nested = event.target.closest('[data-mixed-nested]');
    const nestedItems = nested ? controlsFor(nested) : [];
    const index = nestedItems.indexOf(event.target);
    if (index !== -1 && event.key === 'Escape') {
      event.preventDefault();
      closeControls(item);
      return;
    }
    if (index !== -1 && event.key === 'ArrowLeft' && index === 0) {
      event.preventDefault();
      closeControls(item);
      return;
    }
    if (index !== -1 && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const next = index + (event.key === 'ArrowRight' ? 1 : -1);
      if (next >= 0 && next < nestedItems.length) {
        nestedItems.forEach((control, controlIndex) => {
          control.tabIndex = controlIndex === next ? 0 : -1;
        });
        nestedItems[next].focus();
      }
      return;
    }
    handleNestedControlKey(event, item, mode);
  });
  owner.addEventListener('focusout', (event) => {
    const item = event.target.closest('[data-mixed-item]');
    if (!item) return;
    setTimeout(() => {
      if (isClosedMode(modeFor(item)) && !item.contains(document.activeElement)) {
        item.dataset.controlsOpen = 'false';
        configure(item, items.indexOf(item) === activeIndex);
      }
    });
  });
  owner.addEventListener('click', (event) => {
    const toggle = event.target.closest('[aria-pressed]');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(toggle.getAttribute('aria-pressed') !== 'true'));
    }
  });
  items.forEach((item) => {
    item.dataset.controlsOpen = ['native', 'tab-only'].includes(modeFor(item)) ? 'true' : 'false';
  });
  activate(0, false);
}

document.addEventListener('DOMContentLoaded', () => {
  setupStandalone();
  setupCompositionGallery();
  setupMixedWorkspace();
});

document.addEventListener('keydown', handleReverseEntry);
