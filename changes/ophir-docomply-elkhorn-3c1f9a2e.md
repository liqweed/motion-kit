### Added

- A style can name the curves its diagrams move on. `motion.enter` (entrances) and `motion.move` (movement between visible states, fills, draw-on) are each the four numbers of a CSS `cubic-bezier(x1, y1, x2, y2)`, every number from 0 to 1 so nothing overshoots. A diagram can now match the page it sits on; durations and step times do not change, so step frames stay settled. A style without `motion` moves as before. Custom scenes read the curves with `kit.easings(style.motion)`. **Consumer action:** none. To match a site's easing, add `"motion": { "move": [0.23, 1, 0.32, 1] }` to the style file.

### Changed

- The `animated-diagram` skill's description says what it is not for (page and component micro-interactions, faux product-UI demos, hero illustrations, decorative effects), and `motion-vocabulary.md` records where the motion vocabulary departs from interface-motion standards such as Emil Kowalski's `choreograph`, so an agent with both installed does not "fix" a scene's uniform stagger or settled steps. **Consumer action:** none.
