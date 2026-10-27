'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { nearestSeries } = require('./weapon-chart.js');

test('vertical shot steps are selectable halfway between pre-hit and post-hit damage', () => {
  const line = { name: 'Burst', points: [{ x: 0, y: 100 }, { x: 40, y: 100 }, { x: 40, y: 30 }, { x: 80, y: 30 }] };
  const result = nearestSeries([line], { x: 42, y: 65 });
  assert.equal(result.name, 'Burst');
  assert.equal(result.x, 40);
  assert.equal(result.y, 65);
  assert.equal(result.distance, 2);
});

test('a nearby unpinned curve wins over a distant pinned curve', () => {
  const lines = [{ name: 'Pinned', pinned: true, points: [{ x: 0, y: 10 }, { x: 100, y: 10 }] },
    { name: 'Nearest', points: [{ x: 0, y: 60 }, { x: 100, y: 60 }] }];
  assert.equal(nearestSeries(lines, { x: 50, y: 59 }).name, 'Nearest');
  assert.equal(nearestSeries(lines, { x: 50, y: 90 }), null);
});

test('sloping damage-over-time segments and their endpoints are selectable', () => {
  const line = { name: 'Burn', points: [{ x: 0, y: 100 }, { x: 100, y: 0 }] };
  const result = nearestSeries([line], { x: 50, y: 50 });
  assert.equal(result.distance, 0);
  assert.equal(nearestSeries([line], { x: 103, y: 0 }).name, 'Burn');
});

test('unknown data breaks the hit area instead of connecting across the gap', () => {
  const line = { name: 'Missing data', points: [{ x: 0, y: 0 }, { x: 10, y: 0 },
    { x: 50, y: NaN }, { x: 90, y: 100 }, { x: 100, y: 100 }] };
  assert.equal(nearestSeries([line], { x: 50, y: 50 }), null);
});

test('overlapping curves prefer pinned weapons only when distances are effectively tied', () => {
  const points = [{ x: 0, y: 20 }, { x: 100, y: 20 }];
  assert.equal(nearestSeries([{ name: 'Other', points }, { name: 'Pinned', pinned: true, points }], { x: 50, y: 20 }).name, 'Pinned');
});
