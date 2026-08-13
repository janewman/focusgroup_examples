'use strict';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
].join(',');
const MAIN_FOCUSABLE_SELECTOR = FOCUSABLE_SELECTOR
  .split(',')
  .map((selector) => `main ${selector}`)
  .join(',');

const originalTabIndex = new WeakMap();
const managedTabIndexWrites = new WeakMap();
const groupState = new WeakMap();
let sequentialFocusOrderCache = null;

function tokensFor(owner) {
  return new Set((owner.getAttribute('focusgroup') || '').trim().split(/\s+/).filter(Boolean));
}

function isRendered(element) {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
}

function isSequentiallyFocusable(element) {
  return !element.disabled && !element.closest('[inert]') && isRendered(element) && element.tabIndex >= 0;
}

function isAuthoredSequentialTarget(element) {
  if (!originalTabIndex.has(element)) {
    return isSequentiallyFocusable(element);
  }

  const authoredTabIndex = originalTabIndex.get(element);
  const authoredEligible = authoredTabIndex === null || Number(authoredTabIndex) >= 0;
  return !element.disabled && !element.closest('[inert]') && isRendered(element) && authoredEligible;
}

function rememberTabIndex(element) {
  if (!originalTabIndex.has(element)) {
    originalTabIndex.set(element, element.getAttribute('tabindex'));
  }
}

function writeTabIndex(element, value) {
  const current = element.getAttribute('tabindex');
  if (current === value) {
    return;
  }

  const writes = managedTabIndexWrites.get(element) || [];
  writes.push({ oldValue: current, newValue: value });
  managedTabIndexWrites.set(element, writes);
  sequentialFocusOrderCache = null;
  if (value === null) {
    element.removeAttribute('tabindex');
  } else {
    element.setAttribute('tabindex', value);
  }
}

function setSequentialEligibility(element, eligible) {
  rememberTabIndex(element);
  if (!eligible) {
    writeTabIndex(element, '-1');
    return;
  }

  const original = originalTabIndex.get(element);
  writeTabIndex(element, original);
}

function belongsToOwner(element, owner) {
  const nearest = element.closest('[focusgroup]:not([focusgroup="none"])');
  return nearest === owner;
}

function isInsideOptOut(element, owner) {
  const optOut = element.closest('[focusgroup="none"]');
  return Boolean(optOut && owner.contains(optOut));
}

function isInOwnedScope(element, owner) {
  return belongsToOwner(element, owner) && !isInsideOptOut(element, owner);
}

function isInsideTopLayer(element, owner) {
  const boundary = element.closest('dialog[open], [popover]:popover-open');
  return Boolean(boundary && boundary !== owner && owner.contains(boundary));
}

function nestedControls(item, owner) {
  return [...item.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => {
    if (element === item || !isRendered(element)) {
      return false;
    }
    const optOut = element.closest('[focusgroup="none"]');
    if (optOut && owner.contains(optOut)) {
      return true;
    }
    const nearestOwner = element.closest('[focusgroup]:not([focusgroup="none"])');
    return nearestOwner && nearestOwner !== owner && item.contains(nearestOwner);
  });
}

function inferRole(element, role) {
  if (!element.hasAttribute('role') && ['DIV', 'SPAN'].includes(element.tagName)) {
    element.setAttribute('role', role);
    element.dataset.inferredRole = role;
  }
}

function linearItems(owner) {
  const tokens = tokensFor(owner);
  const candidates = tokens.has('feed')
    ? [...owner.children]
    : [...owner.querySelectorAll('[data-focusgroup-item], [tabindex]')];

  return candidates.filter((element) => {
    if (!isInOwnedScope(element, owner) || !isRendered(element) || element.closest('[inert]')) {
      return false;
    }
    return element.matches('[data-focusgroup-item], [tabindex]') && isAuthoredSequentialTarget(element);
  });
}

function directCells(row) {
  return [...row.children].filter((element) => isRendered(element) && !element.closest('[inert]'));
}

function automaticRows(owner) {
  const directRows = [...owner.children].filter((child) => child.tagName === 'TR');
  const groupedRows = [...owner.children]
    .filter((child) => ['THEAD', 'TBODY', 'TFOOT'].includes(child.tagName))
    .flatMap((group) => [...group.children].filter((child) => child.tagName === 'TR'));
  return [...directRows, ...groupedRows];
}

function targetCandidates(cell, owner) {
  const candidates = [];
  if (cell.matches(FOCUSABLE_SELECTOR) && isAuthoredSequentialTarget(cell)) {
    candidates.push(cell);
  }

  for (const element of cell.querySelectorAll(FOCUSABLE_SELECTOR)) {
    if (!isAuthoredSequentialTarget(element)) {
      continue;
    }
    if (element.closest('[focusgroup="none"]')) {
      continue;
    }
    if (!belongsToOwner(element, owner)) {
      continue;
    }
    candidates.push(element);
  }
  return candidates;
}

function buildGrid(owner) {
  const tokens = tokensFor(owner);
  const manual = tokens.has('manual');
  const rows = tokens.has('manual')
    ? [...owner.children].filter((child) => child.hasAttribute('focusgrouprow') && isRendered(child))
    : automaticRows(owner).filter(isRendered);

  const errors = [];
  const warnings = [];
  if (!manual && owner.tagName !== 'TABLE') {
    errors.push('Automatic topology requires a native table owner');
  }
  if (!rows.length) {
    errors.push(manual ? 'No direct focusgrouprow children' : 'No native table rows');
  }

  const cells = rows.map((row) => directCells(row));
  if (!manual) {
    cells.forEach((rowCells, rowIndex) => {
      if (rowCells.some((cell) => !['TD', 'TH'].includes(cell.tagName))) {
        errors.push(`Native row ${rowIndex + 1} contains a non-cell element`);
      }
    });
  }
  const width = cells[0]?.length || 0;
  if (!width || cells.some((rowCells) => rowCells.length !== width)) {
    errors.push('Rows must form a non-empty rectangle');
  }

  const targets = cells.map((rowCells, rowIndex) => rowCells.map((cell, columnIndex) => {
    if (Number(cell.getAttribute('rowspan') || 1) > 1 || Number(cell.getAttribute('colspan') || 1) > 1) {
      errors.push(`Cell ${rowIndex + 1},${columnIndex + 1} spans multiple coordinates`);
    }
    const candidates = targetCandidates(cell, owner);
    if (candidates.length !== 1) {
      errors.push(`Cell ${rowIndex + 1},${columnIndex + 1} has ${candidates.length} targets`);
    }
    return candidates[0] || null;
  }));

  if (owner.matches(FOCUSABLE_SELECTOR) && owner.tabIndex >= 0) {
    errors.push('Grid owner must not be focusable');
  }

  rows.forEach((row, rowIndex) => {
    if (isAuthoredSequentialTarget(row)) {
      errors.push(`Row ${rowIndex + 1} must not be focusable`);
    }
  });

  if (manual) {
    for (const misplaced of owner.querySelectorAll('[focusgrouprow]')) {
      if (misplaced.parentElement !== owner && isInOwnedScope(misplaced, owner)) {
        errors.push('focusgrouprow must be a direct child');
      }
    }
  } else {
    for (const marker of owner.querySelectorAll('[focusgrouprow]')) {
      if (isInOwnedScope(marker, owner)) {
        warnings.push('focusgrouprow is ignored by automatic table topology');
      }
    }
  }

  const flatCells = cells.flat();
  const flatTargets = targets.flat().filter(Boolean);
  for (const element of owner.querySelectorAll(FOCUSABLE_SELECTOR)) {
    if (!isInOwnedScope(element, owner) || element === owner || isInsideTopLayer(element, owner)) {
      continue;
    }
    if (flatTargets.includes(element)) {
      continue;
    }

    const containingCell = flatCells.find((cell) => cell === element || cell.contains(element));
    if (!containingCell) {
      errors.push('A focusable descendant exists outside every grid cell');
      break;
    }

    const authoredTabIndex = originalTabIndex.has(element)
      ? originalTabIndex.get(element)
      : element.getAttribute('tabindex');
    if (authoredTabIndex !== null && Number(authoredTabIndex) < 0) {
      continue;
    }

    errors.push('A grid cell contains a non-target focusable descendant');
    break;
  }

  if (!errors.length) {
    inferRole(owner, 'grid');
    rows.forEach((row) => inferRole(row, 'row'));
    cells.flat().forEach((cell) => inferRole(cell, 'gridcell'));
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    rows,
    cells,
    targets,
    width,
    height: rows.length,
  };
}

function entryTarget(items) {
  return items.find((item) => item.hasAttribute('focusgroupstart')) || items[0] || null;
}

function activeItemForFocus(owner, focus) {
  const state = groupState.get(owner);
  if (!state || !focus || !owner.contains(focus)) {
    return null;
  }

  if (state.grid?.valid) {
    for (const row of state.grid.targets) {
      for (const target of row) {
        const cell = target?.closest('td, th, [role="gridcell"], [data-inferred-role="gridcell"]');
        if (target === focus || target?.contains(focus) || cell?.contains(focus)) {
          return target;
        }
      }
    }
  }

  return state.items.find((item) => item === focus || item.contains(focus)) || null;
}

function updateSequentialState(owner, active) {
  const state = groupState.get(owner);
  if (!state || !state.items.length) {
    return;
  }

  const tokens = tokensFor(owner);
  const selected = active
    || (!tokens.has('nomemory') && state.memory)
    || entryTarget(state.items);
  if (!tokens.has('nomemory') && selected && state.items.includes(selected)) {
    state.memory = selected;
  }

  for (const item of state.items) {
    setSequentialEligibility(item, item === selected);
  }

  const itemControls = (tokens.has('itemcontrols') || tokens.has('feed') || tokens.has('grid'))
    && !tokens.has('noitemcontrols');

  for (const item of state.items) {
    for (const control of nestedControls(item, owner)) {
      setSequentialEligibility(control, !itemControls || item === selected);
    }
  }
}

function refreshGroup(owner) {
  const previous = groupState.get(owner);
  const tokens = tokensFor(owner);
  let grid = null;
  let items = [];

  if (tokens.has('grid')) {
    grid = buildGrid(owner);
    items = grid.valid ? grid.targets.flat() : [];
  } else {
    items = linearItems(owner);
    if (tokens.has('feed')) {
      inferRole(owner, 'feed');
      items.forEach((item) => inferRole(item, 'article'));
    }
  }

  const memory = !tokens.has('nomemory') && previous?.memory && items.includes(previous.memory)
    ? previous.memory
    : null;
  groupState.set(owner, { grid, items, memory });
  const active = activeItemForFocus(owner, document.activeElement);
  updateSequentialState(owner, active);
  owner.dispatchEvent(new CustomEvent('focusgroupstatechange', {
    bubbles: true,
    detail: { grid, items, active: active || memory || entryTarget(items) },
  }));
}

function refreshAll() {
  document.querySelectorAll('[data-focusgroup-demo]').forEach(refreshGroup);
}

function coordinateOf(grid, target) {
  for (let row = 0; row < grid.height; row += 1) {
    const column = grid.targets[row].indexOf(target);
    if (column !== -1) {
      return { row, column };
    }
  }
  return null;
}

function edgeMode(tokens, axis) {
  if (tokens.has('nowrap')) {
    return 'hard';
  }
  const wrap = tokens.has('wrap') || tokens.has(axis === 'row' ? 'rowwrap' : 'colwrap');
  const flow = tokens.has('flow') || tokens.has(axis === 'row' ? 'rowflow' : 'colflow');
  if (wrap === flow) {
    return 'hard';
  }
  return wrap ? 'wrap' : 'flow';
}

function directionalOperation(owner, key) {
  const style = getComputedStyle(owner);
  const rtl = style.direction === 'rtl';
  const vertical = style.writingMode.startsWith('vertical');

  if (!vertical) {
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const right = key === 'ArrowRight';
      return { axis: 'inline', delta: right === rtl ? -1 : 1 };
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      return { axis: 'block', delta: key === 'ArrowDown' ? 1 : -1 };
    }
    return null;
  }

  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const down = key === 'ArrowDown';
    return { axis: 'inline', delta: down === rtl ? -1 : 1 };
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const blockEndsLeft = style.writingMode === 'vertical-rl';
    const towardBlockEnd = key === (blockEndsLeft ? 'ArrowLeft' : 'ArrowRight');
    return { axis: 'block', delta: towardBlockEnd ? 1 : -1 };
  }
  return null;
}

function gridDestination(owner, target, event) {
  const state = groupState.get(owner);
  const grid = state?.grid;
  const coordinate = grid && coordinateOf(grid, target);
  if (!grid?.valid || !coordinate) {
    return null;
  }

  const { row, column } = coordinate;
  const tokens = tokensFor(owner);
  if (event.key === 'Home') {
    return event.ctrlKey ? grid.targets[0][0] : grid.targets[row][0];
  }
  if (event.key === 'End') {
    return event.ctrlKey
      ? grid.targets[grid.height - 1][grid.width - 1]
      : grid.targets[row][grid.width - 1];
  }

  const operation = directionalOperation(owner, event.key);
  if (!operation) {
    return null;
  }

  if (operation.axis === 'inline') {
    const nextColumn = column + operation.delta;
    if (nextColumn >= 0 && nextColumn < grid.width) {
      return grid.targets[row][nextColumn];
    }
    const mode = edgeMode(tokens, 'row');
    if (mode === 'wrap') {
      return grid.targets[row][operation.delta > 0 ? 0 : grid.width - 1];
    }
    if (mode === 'flow') {
      const linear = row * grid.width + column;
      const next = (linear + operation.delta + grid.width * grid.height) % (grid.width * grid.height);
      return grid.targets[Math.floor(next / grid.width)][next % grid.width];
    }
    return null;
  }

  const nextRow = row + operation.delta;
  if (nextRow >= 0 && nextRow < grid.height) {
    return grid.targets[nextRow][column];
  }
  const mode = edgeMode(tokens, 'column');
  if (mode === 'wrap') {
    return grid.targets[operation.delta > 0 ? 0 : grid.height - 1][column];
  }
  if (mode === 'flow') {
    const linear = column * grid.height + row;
    const next = (linear + operation.delta + grid.width * grid.height) % (grid.width * grid.height);
    return grid.targets[next % grid.height][Math.floor(next / grid.height)];
  }
  return null;
}

function linearDestination(owner, target, event) {
  const state = groupState.get(owner);
  const items = state?.items || [];
  const index = items.indexOf(target);
  if (index === -1) {
    return null;
  }

  const tokens = tokensFor(owner);
  const block = tokens.has('feed') || tokens.has('block');
  const operation = directionalOperation(owner, event.key);
  if (!operation || operation.axis !== (block ? 'block' : 'inline')) {
    return null;
  }

  const next = index + operation.delta;
  if (next >= 0 && next < items.length) {
    return items[next];
  }
  if (tokens.has('wrap')) {
    return items[(next + items.length) % items.length];
  }
  return null;
}

function ownerForInteraction(target) {
  const nested = target.closest('[focusgroup]:not([focusgroup="none"])');
  if (nested?.hasAttribute('data-focusgroup-demo')) {
    return nested;
  }
  const optOut = target.closest('[focusgroup="none"]');
  return optOut?.parentElement?.closest('[data-focusgroup-demo]') || null;
}

function nativeClaimsDirectionalKey(element, key) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
    return false;
  }
  return element.matches('input, select, textarea, [contenteditable]:not([contenteditable="false"])');
}

function sequentialFocusOrder() {
  if (sequentialFocusOrderCache) {
    return sequentialFocusOrderCache;
  }

  sequentialFocusOrderCache = [...document.querySelectorAll(MAIN_FOCUSABLE_SELECTOR)]
    .filter(isSequentiallyFocusable)
    .map((element, documentIndex) => ({ element, documentIndex }))
    .sort((left, right) => {
      const leftPositive = left.element.tabIndex > 0;
      const rightPositive = right.element.tabIndex > 0;
      if (leftPositive !== rightPositive) {
        return leftPositive ? -1 : 1;
      }
      if (leftPositive && left.element.tabIndex !== right.element.tabIndex) {
        return left.element.tabIndex - right.element.tabIndex;
      }
      return left.documentIndex - right.documentIndex;
    })
    .map(({ element }) => element);
  return sequentialFocusOrderCache;
}

function handleReverseEntry(event) {
  if (event.key !== 'Tab' || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }

  const eligible = sequentialFocusOrder();
  const currentIndex = eligible.indexOf(document.activeElement);
  const previous = currentIndex > 0 ? eligible[currentIndex - 1] : null;
  const owner = previous?.closest('[data-focusgroup-demo]');
  const state = owner && groupState.get(owner);
  if (!owner || !state || owner.contains(document.activeElement)) {
    return false;
  }

  const selected = (!tokensFor(owner).has('nomemory') && state.memory)
    || entryTarget(state.items);
  if (!selected || previous === selected || !owner.contains(previous)) {
    return false;
  }

  event.preventDefault();
  selected.focus();
  return true;
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.altKey || event.metaKey) {
    return;
  }
  if (handleReverseEntry(event)) {
    return;
  }
  const owner = ownerForInteraction(event.target);
  const state = owner && groupState.get(owner);
  if (!owner || !state) {
    return;
  }

  const active = activeItemForFocus(owner, event.target);
  if (!active || active !== event.target) {
    return;
  }
  if (nativeClaimsDirectionalKey(event.target, event.key)) {
    return;
  }

  const destination = state.grid
    ? gridDestination(owner, active, event)
    : linearDestination(owner, active, event);
  if (destination && destination !== active) {
    event.preventDefault();
    destination.focus();
  }
});

document.addEventListener('focusin', (event) => {
  for (const owner of document.querySelectorAll('[data-focusgroup-demo]')) {
    if (!owner.contains(event.target)) {
      continue;
    }
    const active = activeItemForFocus(owner, event.target);
    if (active) {
      const state = groupState.get(owner);
      if (!tokensFor(owner).has('nomemory')) {
        state.memory = active;
      }
      updateSequentialState(owner, active);
      owner.dispatchEvent(new CustomEvent('focusgroupactivechange', {
        bubbles: true,
        detail: { active, grid: state.grid },
      }));
    }
  }
});

document.addEventListener('focusout', (event) => {
  const owner = event.target.closest?.('[data-focusgroup-demo]');
  if (!owner || !tokensFor(owner).has('nomemory')) {
    return;
  }
  queueMicrotask(() => {
    if (!owner.contains(document.activeElement)) {
      updateSequentialState(owner, null);
    }
  });
});

function setupFeatureDetection() {
  const probe = document.createElement('div');
  const hasFocusgroup = 'focusGroup' in HTMLElement.prototype;
  const checks = [
    ['focusGroup', hasFocusgroup],
    ['grid', hasFocusgroup && probe.focusGroup?.supports?.('grid')],
    ['manual', hasFocusgroup && probe.focusGroup?.supports?.('manual')],
    ['feed', hasFocusgroup && probe.focusGroup?.supports?.('feed')],
    ['itemcontrols', hasFocusgroup && probe.focusGroup?.supports?.('itemcontrols')],
    ['noitemcontrols', hasFocusgroup && probe.focusGroup?.supports?.('noitemcontrols')],
    ['focusGroupRow', 'focusGroupRow' in HTMLElement.prototype],
  ];

  const results = document.querySelector('#detection-results');
  for (const [name, supported] of checks) {
    const card = document.createElement('div');
    card.className = `detection-card${supported ? ' supported' : ''}`;
    card.innerHTML = `<strong>${name}</strong><span>${supported ? 'Native support' : 'Demo layer active'}</span>`;
    results.append(card);
  }

  const nativeV2 = checks.slice(1).every(([, supported]) => supported);
  const summary = document.querySelector('#support-summary');
  summary.textContent = nativeV2
    ? 'Native Focusgroup V2 detected · JavaScript demo layer active'
    : 'Native V2 not detected · JavaScript demo layer active';
  summary.parentElement.classList.toggle('native', nativeV2);
}

function setupControls() {
  const itemcontrolsToggle = document.querySelector('#itemcontrols-toggle');
  const layerGroup = document.querySelector('#layer-group');
  itemcontrolsToggle.addEventListener('change', () => {
    const modifier = itemcontrolsToggle.checked ? 'itemcontrols' : 'noitemcontrols';
    layerGroup.setAttribute('focusgroup', `toolbar block ${modifier}`);
    document.querySelector('#layers-code').textContent = `focusgroup="toolbar block ${modifier}"`;
    refreshGroup(layerGroup);
  });

  let postCount = 3;
  document.querySelector('#add-post').addEventListener('click', () => {
    postCount += 1;
    const post = document.createElement('div');
    post.className = 'post';
    post.tabIndex = 0;
    post.setAttribute('aria-posinset', String(postCount));
    post.setAttribute('aria-setsize', '-1');
    post.innerHTML = `
      <div class="avatar violet" aria-hidden="true">NV</div>
      <div class="post-content">
        <div class="post-meta"><strong>New visitor</strong><span>now</span></div>
        <p>This article joined the focusgroup through a DOM mutation.</p>
        <div class="post-actions" focusgroup="none">
          <button type="button">Like <span>0</span></button>
          <button type="button">Reply</button>
          <button type="button">Share</button>
        </div>
      </div>`;
    document.querySelector('#social-feed').append(post);
  });

  const rtlToggle = document.querySelector('#rtl-toggle');
  const sensorGrid = document.querySelector('#sensor-grid');
  rtlToggle.addEventListener('click', () => {
    const pressed = rtlToggle.getAttribute('aria-pressed') !== 'true';
    rtlToggle.setAttribute('aria-pressed', String(pressed));
    rtlToggle.textContent = pressed ? 'Use LTR direction' : 'Use RTL direction';
    sensorGrid.dir = pressed ? 'rtl' : 'ltr';
  });

  const writingModeToggle = document.querySelector('#writing-mode-toggle');
  writingModeToggle.addEventListener('click', () => {
    const modes = ['horizontal-tb', 'vertical-rl', 'vertical-lr'];
    const current = writingModeToggle.dataset.mode;
    const next = modes[(modes.indexOf(current) + 1) % modes.length];
    sensorGrid.style.writingMode = next;
    writingModeToggle.dataset.mode = next;
    writingModeToggle.textContent = `Use ${modes[(modes.indexOf(next) + 1) % modes.length]}`;
  });

  const edgeGrid = document.querySelector('#edge-grid');
  const edgeModeSelect = document.querySelector('#edge-mode');
  const nomemoryToggle = document.querySelector('#nomemory-toggle');
  const updateEdgeTokens = () => {
    const modifiers = [edgeModeSelect.value, nomemoryToggle.checked ? 'nomemory' : ''].filter(Boolean);
    const attribute = `grid manual${modifiers.length ? ` ${modifiers.join(' ')}` : ''}`;
    edgeGrid.setAttribute('focusgroup', attribute);
    document.querySelector('#edge-code').textContent = `focusgroup="${attribute}"`;
    refreshGroup(edgeGrid);
  };
  edgeModeSelect.addEventListener('change', updateEdgeTokens);
  nomemoryToggle.addEventListener('change', updateEdgeTokens);

  const breakButton = document.querySelector('#break-grid');
  breakButton.addEventListener('click', () => {
    const cell = document.querySelector('#mutable-cell');
    const extra = cell.querySelector('[data-extra-target]');
    if (extra) {
      extra.remove();
      breakButton.textContent = 'Add second target';
      breakButton.setAttribute('aria-pressed', 'false');
    } else {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '4b';
      button.dataset.extraTarget = '';
      cell.append(button);
      breakButton.textContent = 'Repair grid';
      breakButton.setAttribute('aria-pressed', 'true');
    }
  });
}

function setupStatusOutputs() {
  const feed = document.querySelector('#social-feed');
  const feedStatus = document.querySelector('#feed-status');
  const updateFeed = (active) => {
    const title = active?.querySelector('strong')?.textContent || 'none';
    const count = groupState.get(feed)?.items.length || 0;
    feedStatus.textContent = `${count} rendered articles · active: ${title}`;
  };
  feed.addEventListener('focusgroupactivechange', (event) => {
    if (event.target === feed) {
      updateFeed(event.detail.active);
    }
  });
  feed.addEventListener('focusgroupstatechange', (event) => {
    if (event.target === feed) {
      updateFeed(event.detail.active);
    }
  });

  const manual = document.querySelector('#sensor-grid');
  manual.addEventListener('focusgroupactivechange', (event) => {
    if (event.target !== manual || !event.detail.grid) {
      return;
    }
    const coordinate = coordinateOf(event.detail.grid, event.detail.active);
    if (!coordinate) {
      return;
    }
    const label = event.detail.active.querySelector('strong')?.textContent || event.detail.active.textContent.trim();
    document.querySelector('#manual-status').textContent =
      `row ${coordinate.row + 1}, column ${coordinate.column + 1} · ${label}`;
  });

  const diagnostic = document.querySelector('#diagnostic-grid');
  diagnostic.addEventListener('focusgroupstatechange', (event) => {
    if (event.target !== diagnostic || !event.detail.grid) {
      return;
    }
    const output = document.querySelector('#grid-diagnostic');
    const grid = event.detail.grid;
    const summary = grid.valid
      ? `${grid.height} rows × ${grid.width} columns · ${grid.targets.flat().length} cell targets`
      : grid.errors.join(' · ');
    if (output.dataset.summary === summary && output.classList.contains(grid.valid ? 'valid' : 'invalid')) {
      return;
    }
    output.dataset.summary = summary;
    output.classList.toggle('invalid', !grid.valid);
    output.classList.toggle('valid', grid.valid);
    const title = document.createElement('strong');
    const detail = document.createElement('span');
    title.textContent = grid.valid ? 'Valid grid' : 'Invalid grid';
    detail.textContent = summary;
    output.replaceChildren(title, detail);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupFeatureDetection();
  setupControls();
  setupStatusOutputs();

  let refreshQueued = false;
  const queueRefresh = () => {
    if (refreshQueued) {
      return;
    }
    refreshQueued = true;
    sequentialFocusOrderCache = null;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refreshAll();
    });
  };

  const observer = new MutationObserver((records) => {
    sequentialFocusOrderCache = null;
    let relevantChange = false;
    records.forEach((record, recordIndex) => {
      if (record.type === 'attributes' && record.attributeName === 'tabindex') {
        const nextRecord = records.slice(recordIndex + 1).find((candidate) =>
          candidate.type === 'attributes'
          && candidate.attributeName === 'tabindex'
          && candidate.target === record.target);
        const newValue = nextRecord
          ? nextRecord.oldValue
          : record.target.getAttribute('tabindex');
        const pendingWrites = managedTabIndexWrites.get(record.target) || [];
        const writeIndex = pendingWrites.findIndex((write) =>
          write.oldValue === record.oldValue && write.newValue === newValue);
        if (writeIndex !== -1) {
          pendingWrites.splice(writeIndex, 1);
          if (!pendingWrites.length) {
            managedTabIndexWrites.delete(record.target);
          } else {
            managedTabIndexWrites.set(record.target, pendingWrites);
          }
          return;
        }
        originalTabIndex.set(record.target, newValue);
      }

      const inDemo = record.target.closest?.('[data-focusgroup-demo]')
        || [...record.addedNodes, ...record.removedNodes].some((node) =>
          node.nodeType === Node.ELEMENT_NODE
          && (node.matches?.('[data-focusgroup-demo]') || node.querySelector?.('[data-focusgroup-demo]')));
      relevantChange ||= Boolean(inDemo);
    });
    if (relevantChange) {
      sequentialFocusOrderCache = null;
      queueRefresh();
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [
      'focusgroup',
      'focusgrouprow',
      'disabled',
      'hidden',
      'inert',
      'rowspan',
      'colspan',
      'tabindex',
      'style',
      'class',
      'dir',
      'slot',
      'popover',
      'open',
    ],
  });
  document.addEventListener('slotchange', queueRefresh, true);
  window.addEventListener('resize', queueRefresh);
  refreshAll();
});
