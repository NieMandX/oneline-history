import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attachNavigation, coastStep, releaseVelocity, wheelPixels, pinchBasis, pinchRange} from './navigation.js';

class Surface extends EventTarget {
  emit(type, properties = {}) {
    const event = new Event(type, {cancelable: true});
    Object.assign(event, properties);
    this.dispatchEvent(event);
    return event;
  }
}

function fixture({reduced = false, safari = false, start = 800, span = 500} = {}) {
  let time = 0, range = {start, span}, sequence = 0;
  const callbacks = new Map(), captures = new Set();
  const win = new Surface(), doc = new Surface(), element = new Surface(), motion = new Surface();
  motion.matches = reduced;
  win.matchMedia = () => motion;
  win.performance = {now: () => time};
  win.requestAnimationFrame = callback => { callbacks.set(++sequence, callback); return sequence; };
  win.cancelAnimationFrame = id => callbacks.delete(id);
  if (safari) win.ongesturestart = null;
  doc.defaultView = win;
  element.ownerDocument = doc;
  element.clientWidth = 1000;
  element.getBoundingClientRect = () => ({left: 0, top: 0, width: 1000, height: 400});
  element.classList = {add() {}, remove() {}};
  element.contains = target => target === element;
  element.setPointerCapture = id => captures.add(id);
  element.hasPointerCapture = id => captures.has(id);
  element.releasePointerCapture = id => captures.delete(id);
  const control = attachNavigation(element, {getRange: () => range, setRange: next => { range = next; }});
  return {
    element, doc, win, motion, control,
    range: () => ({...range}), pending: () => callbacks.size,
    advance(ms) { time += ms; const batch = [...callbacks.values()]; callbacks.clear(); for (const callback of batch) callback(time); },
    point(type, x, y = 150, pointerId = 1, pointerType = 'mouse') {
      return (type === 'pointerup' || type === 'pointercancel' ? win : element).emit(type, {pointerId, pointerType, clientX: x, clientY: y, button: 0});
    },
    wheel(x, y, extra = {}) { return element.emit('wheel', {deltaMode: 0, deltaX: x, deltaY: y, clientX: 300, ...extra}); },
  };
}

function flick(f) {
  f.point('pointerdown', 500);
  for (const x of [520, 550, 590]) { f.advance(16); f.point('pointermove', x); }
  f.advance(8); f.point('pointerup', 590);
}

test('coasting travels the same distance at 30, 60 and 120 Hz', () => {
  const distances = [30, 60, 120].map(hz => {
    let velocity = 1.5, distance = 0;
    for (let frame = 0; frame < hz; frame++) {
      const step = coastStep(velocity, 1000 / hz);
      distance += step.distance; velocity = step.velocity;
    }
    return distance;
  });
  assert.ok(Math.max(...distances) - Math.min(...distances) < 1e-8);
  assert.equal(releaseVelocity([{position: 0, time: 0}, {position: 100, time: 50}], 150), 0);
});

test('a flick continues after release, decelerates, and comes to rest', () => {
  const f = fixture(); flick(f);
  const released = f.range().start;
  assert.equal(f.pending(), 1);
  f.advance(16); const first = released - f.range().start;
  const beforeSecond = f.range().start;
  f.advance(16); const second = beforeSecond - f.range().start;
  assert.ok(first > second && second > 0);
  for (let i = 0; i < 80; i++) f.advance(16);
  assert.equal(f.pending(), 0);
});

test('new input, blur, rotation and explicit controls interrupt inertia', () => {
  for (const interrupt of [f => f.point('pointerdown', 300), f => f.doc.emit('keydown'), f => f.win.emit('blur'), f => f.win.emit('resize'), f => f.control.stop(), f => f.wheel(10, 0)]) {
    const f = fixture(); flick(f); interrupt(f);
    const stopped = f.range(); f.advance(100);
    assert.deepEqual(f.range(), stopped); assert.equal(f.pending(), 0);
  }
});

test('stationary release, cancellation, full view and reduced motion do not coast', () => {
  for (const options of [{reduced: true}, {start: 1, span: 2026}]) {
    const f = fixture(options); flick(f); assert.equal(f.pending(), 0);
  }
  for (const cancel of [false, true]) {
    const f = fixture(); f.point('pointerdown', 500); f.advance(20); f.point('pointermove', 600);
    if (!cancel) f.advance(120);
    f.point(cancel ? 'pointercancel' : 'pointerup', 600);
    assert.equal(f.pending(), 0);
  }
});

test('inertia stops at domain boundaries without a bounce', () => {
  const f = fixture({start: 50}); flick(f);
  for (let i = 0; i < 50; i++) f.advance(16);
  assert.equal(f.range().start, 1); assert.equal(f.pending(), 0);
});

test('vertical touch scroll belongs to the page and remains locked', () => {
  const f = fixture(); const before = f.range();
  f.point('pointerdown', 400, 100, 1, 'touch');
  assert.equal(f.point('pointermove', 402, 140, 1, 'touch').defaultPrevented, false);
  f.point('pointermove', 480, 150, 1, 'touch');
  f.point('pointerup', 480, 150, 1, 'touch');
  assert.deepEqual(f.range(), before); assert.equal(f.pending(), 0);
});

test('pinching works with vertically separated fingers and preserves the focal year', () => {
  const initial = pinchBasis([{x: 400, y: 100}, {x: 400, y: 200}]);
  const current = pinchBasis([{x: 450, y: 50}, {x: 450, y: 250}]);
  const range = pinchRange({start: 500, span: 500}, initial, current, {left: 0, width: 1000});
  assert.equal(range.span, 250);
  assert.equal(range.start + .45 * range.span, 700);
});

test('lifting one finger out of a pinch continues panning without a jump', () => {
  const f = fixture();
  f.point('pointerdown', 400, 100, 1, 'touch'); f.point('pointerdown', 400, 200, 2, 'touch');
  f.advance(20); f.point('pointermove', 400, 300, 2, 'touch');
  assert.equal(f.range().span, 250);
  f.point('pointerup', 400, 300, 2, 'touch');
  const before = f.range();
  f.advance(20); f.point('pointermove', 440, 100, 1, 'touch');
  assert.equal(f.range().start, before.start - 10); assert.equal(f.range().span, before.span);
  f.point('pointercancel', 440, 100, 1, 'touch'); assert.equal(f.pending(), 0);
});

test('a drag suppresses its click, but a subsequent tap and keyboard click work', () => {
  const f = fixture(); flick(f);
  assert.equal(f.element.emit('click', {detail: 1}).defaultPrevented, true);
  f.control.stop(); f.point('pointerdown', 400); f.point('pointerup', 400);
  assert.equal(f.element.emit('click', {detail: 1}).defaultPrevented, false);
  assert.equal(f.element.emit('click', {detail: 0}).defaultPrevented, false);
});

test('wheel units, axis lock and trackpad momentum avoid extra animation', () => {
  assert.deepEqual(wheelPixels({deltaMode: 1, deltaX: 2, deltaY: 3}, 1000, 400), {x: 32, y: 48});
  assert.deepEqual(wheelPixels({deltaMode: 2, deltaX: 1, deltaY: 1}, 1000, 400), {x: 1000, y: 400});
  const f = fixture(); const before = f.range();
  assert.equal(f.wheel(2, 30).defaultPrevented, false);
  assert.equal(f.wheel(20, 3).defaultPrevented, false);
  assert.deepEqual(f.range(), before);
  f.advance(160);
  for (const dx of [40, 20, 10, 4, 1]) { assert.equal(f.wheel(dx, 0).defaultPrevented, true); f.advance(16); }
  assert.equal(f.range().start, before.start + 75 / 1000 * before.span);
  assert.equal(f.pending(), 0);
  assert.equal(f.wheel(0, 30, {shiftKey: true}).defaultPrevented, true);
});

test('modifier-wheel zoom is anchored under the cursor', () => {
  const f = fixture(); const before = f.range();
  f.wheel(0, -100, {ctrlKey: true});
  assert.ok(f.range().span < before.span);
  assert.ok(Math.abs(f.range().start + .3 * f.range().span - (before.start + .3 * before.span)) < 1e-9);
});

test('Safari gesture fallback is scoped to the timeline and does not double-handle touch', () => {
  const f = fixture({safari: true});
  f.element.emit('pointermove', {clientX: 400});
  f.element.emit('gesturestart', {scale: 1});
  f.element.emit('gesturechange', {scale: 2});
  assert.equal(f.range().span, 250);
  const after = f.range(); f.wheel(0, -100, {ctrlKey: true}); assert.deepEqual(f.range(), after);
  f.element.emit('gestureend');
  f.point('pointerdown', 300, 100, 1, 'touch'); f.point('pointerdown', 500, 100, 2, 'touch');
  f.element.emit('gesturestart', {scale: 1}); f.element.emit('gesturechange', {scale: 2});
  assert.deepEqual(f.range(), after);
});
