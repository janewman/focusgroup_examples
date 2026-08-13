'use strict';

const modeDescriptions = {
  native: 'With no itemcontrols attribute, authored focusability is unchanged.',
  'no-tab': 'Press Enter to enter. Tab loops inside; Escape returns to the item.',
  'tab-exit': 'Press Enter to enter. Tab from the final control leaves the item.',
  'tab-only': 'Tab enters and exits the item’s nested controls.',
  inlinedirection: 'Inline-end enters nested controls; inline-start returns to the item.',
  blockdirection: 'Block-end enters nested controls; block-start returns to the item.',
};

const authoredTabIndex = new WeakMap();
let currentMode = 'inlinedirection';

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
  return ['no-tab', 'tab-exit', 'inlinedirection', 'blockdirection'].includes(mode);
}

function entryKey(mode) {
  if (mode === 'no-tab' || mode === 'tab-exit') {
    return 'Enter';
  }
  if (mode === 'inlinedirection') {
    return 'ArrowRight';
  }
  if (mode === 'blockdirection') {
    return 'ArrowDown';
  }
  return null;
}

function reverseDirectionKey(mode) {
  return mode === 'inlinedirection' ? 'ArrowLeft'
    : mode === 'blockdirection' ? 'ArrowUp'
      : null;
}

function forwardDirectionKey(mode) {
  return mode === 'inlinedirection' ? 'ArrowRight'
    : mode === 'blockdirection' ? 'ArrowDown'
      : null;
}

function sequentiallyFocusableElements() {
  return [...document.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]',
  )].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
}

function handleReverseItemcontrolsEntry(event) {
  if (event.key !== 'Tab' || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }

  const order = sequentiallyFocusableElements();
  const currentIndex = order.indexOf(document.activeElement);
  const previous = currentIndex > 0 ? order[currentIndex - 1] : null;
  const item = previous?.closest('[itemcontrols]');
  if (!item || item === previous || item.contains(document.activeElement)) {
    return;
  }

  event.preventDefault();
  item.focus();
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

function handleManagedControlsKey(event, item, mode) {
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

  const reverseKey = reverseDirectionKey(mode);
  const forwardKey = forwardDirectionKey(mode);
  if (!reverseKey || (event.key !== reverseKey && event.key !== forwardKey)) {
    return false;
  }

  event.preventDefault();
  if (event.key === reverseKey && controlIndex === 0) {
    closeControls(item);
    return true;
  }
  const nextIndex = controlIndex + (event.key === forwardKey ? 1 : -1);
  if (nextIndex >= 0 && nextIndex < controls.length) {
    controls[nextIndex].focus();
  }
  return true;
}

function configureStandaloneCard(card, mode) {
  setItemcontrols(card, mode);
  const controlsAvailable = mode === 'native' || mode === 'tab-only';
  controlsFor(card).forEach((control) => setTabEligible(control, controlsAvailable));
  card.dataset.controlsOpen = String(controlsAvailable);
}

function installStandaloneCard(card) {
  card.addEventListener('keydown', (event) => {
    const mode = card.getAttribute('itemcontrols') || 'native';
    if (event.target === card && event.key === entryKey(mode)) {
      event.preventDefault();
      openControls(card);
      return;
    }
    handleManagedControlsKey(event, card, mode);
  });

  card.addEventListener('focusout', () => {
    queueMicrotask(() => {
      const mode = card.getAttribute('itemcontrols') || 'native';
      if (isClosedMode(mode) && !card.contains(document.activeElement)) {
        controlsFor(card).forEach((control) => setTabEligible(control, false));
        card.dataset.controlsOpen = 'false';
      }
    });
  });
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

function directionMarkup(mode, placement) {
  const ownerAttribute = placement === 'owner' ? attributeFragment(mode) : '';
  const itemAttribute = placement === 'item' ? attributeFragment(mode) : '';
  return `<div focusgroup="menu block"${ownerAttribute}>
  <div tabindex="0"${itemAttribute}>
    Projects
    <div focusgroup="menu block">
      <button>Recent</button>
      <button>Starred</button>
      <button>Active</button>
    </div>
  </div>
  <div tabindex="0"${itemAttribute}>…</div>
</div>`;
}

function actionMarkup(mode, placement) {
  const ownerAttribute = placement === 'owner' ? attributeFragment(mode) : '';
  const itemAttribute = placement === 'item' ? attributeFragment(mode) : '';
  return `<div focusgroup="toolbar block"${ownerAttribute}>
  <div tabindex="0"${itemAttribute}>
    Background
    <span focusgroup="none">
      <button>Hide</button>
      <button>More</button>
    </span>
  </div>
  <div tabindex="0"${itemAttribute}>…</div>
</div>`;
}

function feedMarkup(mode, placement) {
  const ownerAttribute = placement === 'owner' ? attributeFragment(mode) : '';
  const itemAttribute = placement === 'item' ? attributeFragment(mode) : '';
  return `<div focusgroup="feed"${ownerAttribute}>
  <article tabindex="0"${itemAttribute}>
    Post content
    <span focusgroup="none">
      <button>Like</button>
      <button>Reply</button>
    </span>
  </article>
  <article tabindex="0"${itemAttribute}>…</article>
</div>`;
}

function gridMarkup(mode, placement) {
  const ownerAttribute = placement === 'owner' ? attributeFragment(mode) : '';
  const itemAttribute = placement === 'item' ? attributeFragment(mode) : '';
  return `<div focusgroup="grid manual"${ownerAttribute}>
  <div focusgrouprow>
    <div tabindex="0"${itemAttribute}>
      Design spec
      <button focusgroup="none">Open</button>
    </div>
    <div tabindex="0"${itemAttribute}>…</div>
  </div>
</div>`;
}

function renderAllMarkup(mode) {
  document.querySelector('#mode-markup').textContent = standaloneMarkup(mode);
  document.querySelector('#direction-item-markup').textContent = directionMarkup(mode, 'item');
  document.querySelector('#direction-owner-markup').textContent = directionMarkup(mode, 'owner');
  document.querySelector('#layers-item-markup').textContent = actionMarkup(mode, 'item');
  document.querySelector('#layers-owner-markup').textContent = actionMarkup(mode, 'owner');
  document.querySelector('#feed-item-markup').textContent = feedMarkup(mode, 'item');
  document.querySelector('#feed-owner-markup').textContent = feedMarkup(mode, 'owner');
  document.querySelector('#grid-item-markup').textContent = gridMarkup(mode, 'item');
  document.querySelector('#grid-owner-markup').textContent = gridMarkup(mode, 'owner');
}

function setupModeLab() {
  const card = document.querySelector('#mode-card');
  const log = document.querySelector('#mode-log');
  installStandaloneCard(card);
  document.querySelector('.mode-stage').addEventListener('focusin', (event) => {
    const label = event.target === card
      ? 'card boundary'
      : event.target.textContent?.trim() || event.target.tagName.toLowerCase();
    log.textContent = `Focus: ${label}`;
  });
  return {
    applyMode(mode) {
      configureStandaloneCard(card, mode);
      document.querySelector('#mode-instructions').textContent = modeDescriptions[mode];
    },
  };
}

function setupDirectionMenu() {
  const menu = document.querySelector('#cross-axis-menu');
  const parents = [...menu.querySelectorAll('.menu-parent')];
  const status = document.querySelector('#submenu-status');
  let activeIndex = 0;

  function configureParent(parent, active) {
    setItemcontrols(parent, currentMode);
    const controls = controlsFor(parent);
    const sequentialEntry = active && (currentMode === 'native' || currentMode === 'tab-only');
    controls.forEach((control, index) => setTabEligible(control, sequentialEntry && index === 0));
    parent.dataset.controlsOpen = String(sequentialEntry);
  }

  function activate(index, moveFocus) {
    activeIndex = index;
    parents.forEach((parent, parentIndex) => {
      const active = parentIndex === activeIndex;
      parent.tabIndex = active ? 0 : -1;
      parent.querySelector('.submenu-panel').hidden = !active;
      configureParent(parent, active);
    });
    if (moveFocus) {
      parents[activeIndex].focus();
    }
    status.textContent = `Parent: ${parents[activeIndex].querySelector('.menu-parent-label span').textContent}`;
  }

  menu.addEventListener('keydown', (event) => {
    const parent = event.target.closest('.menu-parent');
    const parentIndex = parents.indexOf(parent);
    if (parentIndex === -1) {
      return;
    }

    if (event.target === parent) {
      if (event.key === entryKey(currentMode)) {
        event.preventDefault();
        const controls = controlsFor(parent);
        controls.forEach((control, index) => {
          rememberTabIndex(control);
          control.tabIndex = index === 0 ? 0 : -1;
        });
        parent.dataset.controlsOpen = 'true';
        controls[0]?.focus();
        status.textContent = `Submenu entered: ${parent.querySelector('.menu-parent-label span').textContent}`;
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        activate((parentIndex + delta + parents.length) % parents.length, true);
      }
      return;
    }

    const nestedGroup = event.target.closest('[data-nested-focusgroup]');
    const nestedItems = nestedGroup ? controlsFor(nestedGroup) : [];
    const nestedIndex = nestedItems.indexOf(event.target);
    if (nestedIndex === -1) {
      return;
    }

    if (isClosedMode(currentMode) && event.key === 'Escape') {
      event.preventDefault();
      closeControls(parent);
      status.textContent = `Returned to parent: ${parent.querySelector('.menu-parent-label span').textContent}`;
      return;
    }
    if (currentMode === 'no-tab' && event.key === 'Tab') {
      event.preventDefault();
      const delta = event.shiftKey ? -1 : 1;
      nestedItems[(nestedIndex + delta + nestedItems.length) % nestedItems.length].focus();
      return;
    }
    if (currentMode === 'inlinedirection' && event.key === 'ArrowLeft') {
      event.preventDefault();
      closeControls(parent);
      status.textContent = `Returned to parent: ${parent.querySelector('.menu-parent-label span').textContent}`;
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (currentMode === 'blockdirection' && event.key === 'ArrowUp' && nestedIndex === 0) {
        event.preventDefault();
        closeControls(parent);
        status.textContent = `Returned to parent: ${parent.querySelector('.menu-parent-label span').textContent}`;
        return;
      }
      const nextIndex = nestedIndex + (event.key === 'ArrowDown' ? 1 : -1);
      if (nextIndex >= 0 && nextIndex < nestedItems.length) {
        event.preventDefault();
        nestedItems.forEach((item, index) => {
          item.tabIndex = index === nextIndex ? 0 : -1;
        });
        nestedItems[nextIndex].focus();
        status.textContent = `Nested focusgroup: ${nestedItems[nextIndex].textContent}`;
      }
    }
  });

  menu.addEventListener('focusout', (event) => {
    const parent = event.target.closest('.menu-parent');
    if (!parent) {
      return;
    }
    queueMicrotask(() => {
      if (isClosedMode(currentMode) && !parent.contains(document.activeElement)) {
        configureParent(parent, parents.indexOf(parent) === activeIndex);
      }
    });
  });

  activate(0, false);
  return {
    applyMode(mode) {
      currentMode = mode;
      activate(activeIndex, false);
    },
  };
}

function setupComposedFocusgroup(owner) {
  const items = [...owner.querySelectorAll('[data-composed-item]')];
  const columns = Number(owner.dataset.columns || 1);
  let activeIndex = 0;

  function configureItem(item, active) {
    setItemcontrols(item, currentMode);
    const controlsAvailable = currentMode === 'native' || (currentMode === 'tab-only' && active);
    controlsFor(item).forEach((control) => setTabEligible(control, controlsAvailable));
    item.dataset.controlsOpen = String(controlsAvailable);
    item.classList.toggle('active', active);
  }

  function activate(index, moveFocus) {
    activeIndex = index;
    items.forEach((item, itemIndex) => {
      const active = itemIndex === activeIndex;
      item.tabIndex = active ? 0 : -1;
      configureItem(item, active);
    });
    if (moveFocus) {
      items[activeIndex].focus();
    }
  }

  owner.addEventListener('focusin', (event) => {
    const item = event.target.closest('[data-composed-item]');
    const index = items.indexOf(item);
    if (index !== -1 && index !== activeIndex) {
      activate(index, false);
    }
  });

  owner.addEventListener('keydown', (event) => {
    const activeItem = items[activeIndex];
    if (event.target === activeItem && event.key === entryKey(currentMode)) {
      event.preventDefault();
      openControls(activeItem);
      return;
    }
    if (activeItem.contains(event.target) && event.target !== activeItem
        && handleManagedControlsKey(event, activeItem, currentMode)) {
      return;
    }
    if (event.target !== activeItem) {
      return;
    }

    let nextIndex = activeIndex;
    if (columns > 1) {
      if (event.key === 'ArrowLeft' && activeIndex % columns > 0) {
        nextIndex -= 1;
      } else if (event.key === 'ArrowRight' && activeIndex % columns < columns - 1) {
        nextIndex += 1;
      } else if (event.key === 'ArrowUp' && activeIndex >= columns) {
        nextIndex -= columns;
      } else if (event.key === 'ArrowDown' && activeIndex + columns < items.length) {
        nextIndex += columns;
      }
    } else if (event.key === 'ArrowUp' && activeIndex > 0) {
      nextIndex -= 1;
    } else if (event.key === 'ArrowDown' && activeIndex < items.length - 1) {
      nextIndex += 1;
    }

    if (nextIndex !== activeIndex) {
      event.preventDefault();
      activate(nextIndex, true);
    }
  });

  owner.addEventListener('focusout', (event) => {
    const item = event.target.closest('[data-composed-item]');
    if (!item) {
      return;
    }
    queueMicrotask(() => {
      if (isClosedMode(currentMode) && !item.contains(document.activeElement)) {
        configureItem(item, items.indexOf(item) === activeIndex);
      }
    });
  });

  activate(0, false);
  return {
    applyMode() {
      activate(activeIndex, false);
    },
  };
}

function setupGlobalModeControl(components) {
  const group = document.querySelector('[data-global-mode-options]');
  const options = [...group.querySelectorAll('[data-mode]')];

  function apply(option) {
    currentMode = option.dataset.mode;
    options.forEach((candidate) => {
      const selected = candidate === option;
      candidate.setAttribute('aria-checked', String(selected));
      candidate.tabIndex = selected ? 0 : -1;
    });
    components.forEach((component) => component.applyMode(currentMode));
    document.querySelectorAll('[data-global-value-label]').forEach((label) => {
      label.textContent = currentMode === 'native'
        ? 'items: itemcontrols absent'
        : `items: itemcontrols="${currentMode}"`;
    });
    renderAllMarkup(currentMode);
  }

  group.addEventListener('focusin', (event) => {
    const option = event.target.closest('[data-mode]');
    if (option) {
      apply(option);
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

  apply(options.find((option) => option.getAttribute('aria-checked') === 'true') || options[0]);
}

document.addEventListener('DOMContentLoaded', () => {
  const components = [
    setupModeLab(),
    setupDirectionMenu(),
    ...[...document.querySelectorAll('[data-composed-focusgroup]')].map(setupComposedFocusgroup),
  ];
  setupGlobalModeControl(components);
});

document.addEventListener('keydown', handleReverseItemcontrolsEntry);
