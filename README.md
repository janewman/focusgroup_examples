# Scoped Focusgroup Examples

Interactive examples inspired by the Open UI explainer for Scoped Focusgroup: https://open-ui.org/components/scoped-focusgroup.explainer/

## Contents
- index.html — examples and explanations
- styles.css — minimal styling
- scripts.js — no polyfill; only a small feature-detection console note

### Shared classes
- `menubar`, `list-reset`: layout for menubar lists
- `popover-menu`: layout for popover menus
- `visual-reorder`: flex row-reverse helper for reading-flow demos

## Run locally (Windows)
Open `index.html` in your browser, or start a simple local server:

```powershell
# From the c:\focusgroup_examples folder
# Using PowerShell's Start-Process to open default browser
Start-Process .\index.html

# Optional: serve with Python if installed
python -m http.server 8080
# then open http://localhost:8080/index.html
```

## Keyboard behavior (native)
- Linear focus: Arrow keys move within the group; Tab exits.
- Axis limits: `inline` (Left/Right) or `block` (Up/Down).
- Wrapping: `wrap` wraps from ends.
- Memory: remembers last focused item unless `no-memory` is set.
- Entry: `focusgroup-entry-priority` chooses initial focus when memory doesn’t apply.
- Opt-out: `focusgroup="none"` creates sequential navigation segments; arrows skip.
- Reading-flow: when supported, arrow keys follow visual order.
- Shadow DOM: focusgroup can traverse into shadow trees from a host.
- Descendants: non-focusable wrappers are ignored; focusable descendants participate.
- Backward nav: Shift+Tab enters the previous segment; memory applies per segment.

## Notes
- These examples rely on the native `focusgroup` attribute. Support may be behind a browser flag.
- Try enabling “Experimental Web Platform features” (e.g., Chrome/Edge) if needed.
- Add ARIA roles where appropriate for semantics (e.g., `role="tab"`, `role="menuitem"`).
- Popover demos use the HTML Popover API (`popover`, `popovertarget`, `autofocus`). Ensure your browser supports it.
