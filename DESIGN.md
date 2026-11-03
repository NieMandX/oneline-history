# OneLine History — design contract

Direction: Swiss editorial atlas. Pure white #fff, ink #171717, red #e52a25; neutral gray only as ink opacity. No colored categories, images, gradients or decorative shadows.

Typography: system Helvetica Neue / Arial / sans-serif for interface and headings; Georgia for large years. System fonts mean zero font downloads. Event heading 29px / 1.1, body 14px / 1.6, control 13px / 1.2, date 100px.

Composition: slim masthead immediately followed by the filter / zoom toolbar; open timeline with century dividers, native selectable event labels and connectors; compact century navigator; three-column selected event detail; quiet footer. No card grid.

Controls: monochrome category tabs, red selected event, square zoom buttons, scale select, keyboard and pointer navigation. 44px minimum controls on touch. Focus ring visible. Reduced motion respected. Horizontal gestures pan the timeline; vertical gestures scroll the page. Pinch and modifier-wheel zoom preserve the focal year. Short exponential inertia follows pointer drags only, with immediate interruption and no overshoot. OS wheel momentum is never duplicated. Visible earlier/later buttons provide a non-drag alternative.

Timeline: 20 complete centuries from 1 through 2000, then 2001–2026, 26% of a full century. No year zero. Date range arithmetic uses exclusive right boundary 2027. Visible range is clipped; labels are placed in collision-free lanes. Zoom anchored at pointer, pan via pointer or horizontal wheel. DOM work coalesced into requestAnimationFrame. No continuous animation loop. Event list remains available at all scales.

Reference: ImageGen built-in concept exec-7c4ce07e-7120-44d5-91a6-9d8e4971a34a.png. User palette overrides initial brown/cream concept. Native target 1536×1024. Concept date placements are illustrative; implementation uses mathematically correct century positions and data.

Phone orientation: both orientations start with the controls immediately after the masthead. Landscape at up to 1100px wide and 500px high uses a 48px masthead, a single scrolling toolbar row and a 252px timeline. CSS supplies the axis and event lane offsets to rendering. ResizeObserver reflows the same range and selected event on rotation. Respect safe-area insets.
