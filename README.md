# Focusgroup V2 scratch proof of concept

A self-contained JavaScript sketch inspired by the
[Open UI Focusgroup V2 proposal](https://open-ui.org/components/focusgroup-v2.explainer/).

The page authors the proposed `focusgroup` tokens and `focusgrouprow` attribute directly.
`scripts.js` approximates enough behavior for discussion and hands-on keyboard testing in
browsers that do not yet ship Focusgroup V2. This is scratch code: it is not a production
polyfill, conformance test, reference implementation, or claim about final browser behavior.

## Concepts explored

- `itemcontrols` and `noitemcontrols`
- `feed`, inferred roles, focus memory, and dynamic insertion
- automatic native-table grid topology
- `grid manual` and `focusgrouprow`
- one-target-per-cell validation and opted-out cell controls
- hard edges, `wrap`, `flow`, `rowwrap`, `colwrap`, `rowflow`, `colflow`, and `nowrap`
- Arrow keys, Home/End, Ctrl+Home/Ctrl+End, `focusgroupstart`, and RTL inline direction
- `nomemory` and horizontal/vertical writing-mode navigation
- live invalid-grid diagnostics
- native V2 feature detection
- a linked issue #1500 page comparing hypothetical `itemcontrols` modes

## Run locally

Open `index.html` directly, or serve the directory:

```powershell
python -m http.server 8080
```

Then open <http://localhost:8080/>.

The issue #1500 exploration is available at
<http://localhost:8080/itemcontrols-modes.html>.

## Scope

The script sketches focus navigation and sequential eligibility. It may intentionally simplify
or omit proposal details. Selection, activation, expansion, scrolling, and content loading
remain author-managed.

This is a behavioral demo rather than a browser-engine polyfill. Closed shadow roots,
top-layer dispatch, CSS flat-tree traversal, and native IDL reflection cannot be reproduced
fully by page JavaScript; those engine-only rules remain represented by authored markup,
feature detection, and diagnostics rather than patched browser prototypes.
