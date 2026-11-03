import {clamp, MIN_SPAN, TOTAL_YEARS, normalizeRange, zoomRange} from './timeline.js';

const DECAY_MS = 230;
const STOP_SPEED = .025;

// Integrate exponential friction over elapsed time, independent of refresh rate.
export function coastStep(velocity, elapsed) {
  const decay = Math.exp(-elapsed / DECAY_MS);
  return {distance: velocity * DECAY_MS * (1 - decay), velocity: velocity * decay};
}

export function releaseVelocity(samples, releasedAt) {
  if (samples.length < 2 || releasedAt - samples.at(-1).time > 80) return 0;
  const recent = samples.filter(sample => releasedAt - sample.time <= 100);
  if (recent.length < 2) return 0;
  const elapsed = releasedAt - recent[0].time;
  return elapsed > 0 ? clamp((recent.at(-1).position - recent[0].position) / elapsed, -2.4, 2.4) : 0;
}

export function wheelPixels(event, width, height) {
  const mode = event.deltaMode; // Read first: Firefox may adapt deltas to this access.
  return {
    x: event.deltaX * (mode === 1 ? 16 : mode === 2 ? width : 1),
    y: event.deltaY * (mode === 1 ? 16 : mode === 2 ? height : 1),
  };
}

export function pinchBasis(points) {
  if (points.length < 2) return null;
  const [a, b] = points;
  return {distance: Math.hypot(b.x - a.x, b.y - a.y), center: (a.x + b.x) / 2};
}

export function pinchRange(range, initial, current, rect) {
  const span = clamp(range.span * initial.distance / Math.max(1, current.distance), MIN_SPAN, TOTAL_YEARS);
  const year = range.start + (initial.center - rect.left) / rect.width * range.span;
  return normalizeRange(year - (current.center - rect.left) / rect.width * span, span);
}

export function attachNavigation(element, {getRange, setRange}) {
  const doc = element.ownerDocument, win = doc.defaultView;
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const points = new Map();
  let gesture = null, momentum = null, frame = 0, suppressClick = false;
  let wheelAxis = null, lastWheelTime = -Infinity, safariGesture = null, hoverX = null;
  const now = () => win.performance.now();
  const apply = range => setRange(normalizeRange(range.start, range.span));

  function stopMomentum() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    momentum = null;
  }

  function stop() {
    stopMomentum();
    gesture = safariGesture = null;
    const ids = [...points.keys()];
    points.clear();
    for (const id of ids) if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    element.classList.remove('dragging');
    wheelAxis = null;
  }

  function animate(time) {
    frame = 0;
    if (!momentum) return;
    const elapsed = time - momentum.time;
    if (elapsed > 180 || time - momentum.started > 1100 || reducedMotion.matches) return stopMomentum();
    const step = coastStep(momentum.velocity, elapsed);
    const range = getRange();
    const requested = range.start - step.distance / element.clientWidth * range.span;
    const next = normalizeRange(requested, range.span);
    apply(next);
    if (Math.abs(next.start - requested) > 1e-7 || Math.abs(step.velocity) < STOP_SPEED) return stopMomentum();
    momentum.velocity = step.velocity;
    momentum.time = time;
    frame = win.requestAnimationFrame(animate);
  }

  function launch(samples, time) {
    const velocity = releaseVelocity(samples, time);
    if (reducedMotion.matches || Math.abs(velocity) < .12 || getRange().span >= TOTAL_YEARS) return;
    momentum = {velocity, time, started: time};
    frame = win.requestAnimationFrame(animate);
  }

  function begin(point, time) {
    gesture = {range: {...getRange()}, x: point.x, y: point.y, pinch: pinchBasis([...points.values()]), moved: false, vertical: false, samples: [{position: 0, time}]};
  }

  function capturePointers() {
    for (const id of points.keys()) if (!element.hasPointerCapture(id)) element.setPointerCapture(id);
  }

  function record(time, rect) {
    const position = (gesture.range.start - getRange().start) / gesture.range.span * rect.width;
    const samples = gesture.samples;
    const last = samples.at(-1), previous = samples.at(-2);
    // A deliberate reversal should not inherit speed from the previous direction.
    if (previous && (position - last.position) * (last.position - previous.position) < 0) samples.splice(0, samples.length - 1);
    samples.push({position, time});
    while (samples.length > 2 && time - samples[0].time > 100) samples.shift();
  }

  element.addEventListener('pointerdown', event => {
    if (event.button !== 0 && !(event.button === 1 && event.pointerType === 'mouse')) return;
    if (!points.size) suppressClick = !!momentum;
    stopMomentum();
    safariGesture = null;
    if (event.button === 1) event.preventDefault();
    const point = {x: event.clientX, y: event.clientY};
    points.set(event.pointerId, point);
    begin(point, now());
    if (points.size > 1) {
      suppressClick = true;
      capturePointers();
    }
  });

  element.addEventListener('pointermove', event => {
    hoverX = event.clientX;
    if (!gesture || !points.has(event.pointerId)) return;
    points.set(event.pointerId, {x: event.clientX, y: event.clientY});
    const pinch = pinchBasis([...points.values()]), rect = element.getBoundingClientRect();
    if (pinch && gesture.pinch) {
      if (gesture.pinch.distance < 5) { begin(points.values().next().value, now()); return; }
      apply(pinchRange(gesture.range, gesture.pinch, pinch, rect));
      gesture.moved = suppressClick = true;
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (gesture.vertical) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      if (event.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) { gesture.vertical = true; return; }
      if (Math.abs(dx) < 6) return;
      capturePointers();
      gesture.moved = suppressClick = true;
      element.classList.add('dragging');
    }
    apply({start: gesture.range.start - dx / rect.width * gesture.range.span, span: gesture.range.span});
    record(now(), rect);
  });

  function release(event) {
    if (!points.has(event.pointerId)) return;
    const finished = gesture;
    points.delete(event.pointerId);
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    element.classList.remove('dragging');
    if (points.size) {
      // Lifting one finger out of a pinch rebases the remaining finger without a jump.
      begin(points.values().next().value, now());
    } else {
      gesture = null;
      if (finished?.moved && !finished.pinch && !finished.vertical) launch(finished.samples, now());
    }
  }
  win.addEventListener('pointerup', release);
  win.addEventListener('pointercancel', event => { if (points.has(event.pointerId)) stop(); });
  element.addEventListener('lostpointercapture', event => { if (event.target === element && points.has(event.pointerId)) stop(); });
  element.addEventListener('click', event => {
    if (suppressClick && event.detail !== 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }
  }, true);
  element.addEventListener('auxclick', event => { if (event.button === 1) event.preventDefault(); });
  element.addEventListener('dragstart', event => event.preventDefault());

  element.addEventListener('wheel', event => {
    stopMomentum();
    if (points.size || safariGesture) { if (event.cancelable) event.preventDefault(); return; }
    const rect = element.getBoundingClientRect(), delta = wheelPixels(event, rect.width, rect.height), time = now();
    if (event.ctrlKey || event.metaKey) {
      if (!event.cancelable) return;
      event.preventDefault();
      wheelAxis = null;
      const range = getRange();
      apply(zoomRange(range, range.span * Math.exp(clamp(delta.y * .004, -1, 1)), clamp((event.clientX - rect.left) / rect.width, 0, 1)));
    } else {
      if (time - lastWheelTime > 150 || !wheelAxis) wheelAxis = event.shiftKey || Math.abs(delta.x) > Math.abs(delta.y) ? 'x' : 'y';
      if (event.shiftKey) wheelAxis = 'x';
      if (wheelAxis === 'x') {
        if (!event.cancelable) return;
        event.preventDefault();
        const dx = event.shiftKey && Math.abs(delta.y) > Math.abs(delta.x) ? delta.y : delta.x;
        const range = getRange();
        apply({start: range.start + dx / rect.width * range.span, span: range.span});
      }
      // The OS supplies trackpad momentum as wheel events; do not add a second fling.
    }
    lastWheelTime = time;
  }, {passive: false});

  // Safari trackpad pinch fallback; touchscreen pinch stays on Pointer Events.
  if ('ongesturestart' in win) {
    element.addEventListener('gesturestart', event => {
      if (points.size) return;
      event.preventDefault();
      stopMomentum();
      const rect = element.getBoundingClientRect();
      safariGesture = {range: {...getRange()}, scale: event.scale || 1, anchor: clamp(((hoverX ?? (rect.left + rect.width / 2)) - rect.left) / rect.width, 0, 1)};
    }, {passive: false});
    element.addEventListener('gesturechange', event => {
      if (!safariGesture || points.size || !(event.scale > 0)) return;
      event.preventDefault();
      apply(zoomRange(safariGesture.range, safariGesture.range.span * safariGesture.scale / event.scale, safariGesture.anchor));
    }, {passive: false});
    element.addEventListener('gestureend', event => { if (safariGesture) event.preventDefault(); safariGesture = null; }, {passive: false});
  }

  doc.addEventListener('pointerdown', event => { if (!element.contains(event.target)) stop(); }, true);
  doc.addEventListener('keydown', event => { if (event.key === 'Escape') stop(); else stopMomentum(); }, true);
  doc.addEventListener('wheel', event => { if (!element.contains(event.target)) stopMomentum(); }, {passive: true, capture: true});
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) stop(); });
  win.addEventListener('blur', stop);
  win.addEventListener('resize', stop);
  reducedMotion.addEventListener('change', stopMomentum);
  return {stop,isMoving:()=>!!gesture||!!momentum||!!safariGesture};
}
