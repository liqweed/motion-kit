---
release: minor
---

### Added

- The player's `labels` option also takes a dictionary keyed by locale (`{ en: {…}, nl: {…} }`), chosen by a new `locale` option and falling back to the language subtag, then `en`. The Astro and `<motion-diagram>` adapters pass the locale; the element gains a `labels` attribute.
- Keyboard step changes (←/→/Home/End) are announced to screen readers through a polite live region.

### Fixed

- The Astro adapter now destroys its players on view-transition swaps and mounts the new page's diagrams, instead of mounting once per page load.
