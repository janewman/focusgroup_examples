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
  });
})();
