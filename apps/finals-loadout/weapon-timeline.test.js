'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const combat = require('./weapon-timeline.js');
const { createWeaponTimeline: timeline, damageAt, getKillTime: death } = combat;
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const arn = { name: 'ARN-220', bodyDamage: 17, headDamage: 25.5, rpm: 750 };
const r93 = { name: '93R', bodyDamage: 24, headDamage: 36, rpm: 1000,
  burstCount: 3, burstDelay: 0.275, magazineSize: 27, emptyReload: 1.75 };
const cerberus = { name: 'Cerberus 12GA', bodyDamage: 117, headDamage: 117,
  rpm: 100, magazineSize: 3, emptyReload: 2.95 };
const flame = { name: 'Flamethrower', bodyDamage: 30, headDamage: 60,
  rpm: 170, magazineSize: 30, emptyReload: 3.55 };

test('seven deterministic hit patterns use exactly the requested head hit count', () => {
  const patterns = ['BBBBBB', 'BBHBBB', 'BBHBBH', 'BHBHBH', 'HHBHHB', 'HHHBHH', 'HHHHHH'];
  patterns.forEach((pattern, headHits) => {
    assert.equal(combat.getHitPattern(headHits).join(''), pattern);
    assert.equal(combat.getHitPattern(headHits).filter((hit) => hit === 'H').length, headHits);
  });
  const copy = combat.getHitPattern(0);
  copy[0] = 'H';
  assert.equal(combat.getHitPattern(0).join(''), patterns[0]);
});

test('ARN-220 body Medium kill is its 15th real bullet at 1.12 seconds', () => {
  const t = timeline(arn);
  const result = death(t, 250);
  near(result.time, 1.12);
  assert.equal(result.shots, 15);
  assert.ok(damageAt(t, 1.119).total < 250);
  assert.ok(damageAt(t, 1.12).total >= 250);
});

test('93R intra-burst timing and final-bullet-to-next-burst delay', () => {
  const t = timeline(r93);
  [0, 0.06, 0.12, 0.395, 0.455, 0.515, 0.790, 0.850, 0.910, 1.185]
    .forEach((expected, i) => near(t.shots[i].time, expected));
  near(t.burstGaps[0].start, 0.12);
  near(t.burstGaps[0].end, 0.395);
  near(combat.firingDPS(r93), 72 / 0.395);
});

test('2/6 uses identical real B/B/H events for automatic and burst weapons', () => {
  for (const weapon of [arn, r93]) {
    const shots = timeline(weapon, { headHits: 2 }).shots.slice(0, 12);
    assert.equal(shots.map((shot) => shot.placement).join(''), 'BBHBBHBBHBBH');
    shots.forEach((shot) => assert.equal(shot.damage, shot.placement === 'H' ? weapon.headDamage : weapon.bodyDamage));
  }
});

test('hit pattern never restarts at burst or reload boundaries', () => {
  const t = timeline({ ...r93, magazineSize: 5, emptyReload: 2 }, { headHits: 3 });
  assert.equal(t.shots.slice(0, 12).map((shot) => shot.placement).join(''), 'BHBHBHBHBHBH');
  assert.equal(t.shots[3].placement, 'H');
  assert.equal(t.shots[5].placement, 'H');
  near(t.shots[5].time - t.shots[4].time, 2);
});

test('headshot breakpoint rows are actual first kills, including 1/6 to 2/6', () => {
  const rows = combat.getHeadshotBreakpoints(r93, { range: 0, health: 250 });
  assert.deepEqual(rows.map((row) => row.shots), [11, 10, 9, 9, 8, 8, 7]);
  near(rows[1].time, 1.185);
  near(rows[2].time, 0.91);
  rows.forEach((row) => {
    const t = timeline(r93, { headHits: row.headHits });
    assert.ok(damageAt(t, row.time - 0.00001).total < 250);
    assert.ok(damageAt(t, row.time).total >= 250);
  });
});

test('slider endpoints are body/head real-shot counts for all HPs', () => {
  for (const weapon of [arn, r93]) for (const hp of Object.values(combat.HEALTH)) {
    for (const headHits of [0, 6]) {
      const t = timeline(weapon, { headHits });
      const result = death(t, hp);
      const shots = Math.ceil(hp / (headHits ? weapon.headDamage : weapon.bodyDamage));
      assert.equal(result.shots, shots);
      near(result.time, t.shots[shots - 1].time);
    }
  }
});

test('firing DPS measures a complete repeating hit and burst cycle', () => {
  near(combat.firingDPS(r93, { headHits: 1 }), (5 * 24 + 36) / 0.790);
  near(combat.firingDPS(r93, { headHits: 2 }), (4 * 24 + 2 * 36) / 0.790);
  near(combat.firingDPS(arn, { headHits: 2 }), (4 * 17 + 2 * 25.5) / 0.48);
});

test('reload replaces normal shot interval; burst cadence restarts after reload', () => {
  const t = timeline({ ...r93, magazineSize: 4, emptyReload: 2 }, { duration: 4 });
  near(t.shots[3].time, 0.395);
  near(t.shots[4].time, 2.395);
  near(t.shots[5].time, 2.455);
  near(t.shots[7].time, 2.790);
  assert.equal(damageAt(t, 1).activity, 'reload');
  assert.equal(damageAt(t, 1).magazine, 1);
  assert.equal(damageAt(t, 2.395).magazine, 2);
});

test('linked magazines survive parsing and alternate quick swap / full reload', () => {
  for (const value of ['30\u00d72', '30x2', '30 x 2']) assert.deepEqual(combat.parseMagazine(value), { rounds: 30, count: 2 });
  const t = timeline({ ...arn, magazineRaw: '30\u00d72' });
  near(t.shots[30].time - t.shots[29].time, 0.66);
  near(t.shots[60].time - t.shots[59].time, 2.7);
  near(t.shots[90].time - t.shots[89].time, 0.66);
  near(timeline({ ...arn, emptyReload: 3.1 }).shots[60].time - t.shots[59].time, 3.1);
  near(combat.reloadDuration(arn, 29), 2.45);
  assert.equal(damageAt(t, 2.5).activity, 'swap');
  assert.ok(t.events.some((event) => event.type === 'magazine-transition'));
});

test('Cerberus burn is continuous, nonstacking, refreshes and kills between shots', () => {
  const t = timeline(cerberus, { duration: 3.2 });
  near(damageAt(t, 0).total, 117);
  near(damageAt(t, 0.5).burn, 7.5);
  near(damageAt(t, 1).burn, 15);
  near(damageAt(t, 3.2).burn, 48);
  near(death(t, 250).time, 16 / 15);
  assert.equal(death(t, 250).source, 'dot');
  assert.equal(death(t, 250).shots, 2);
  near(death(t, 150).time, 0.6);
  near(death(t, 350).time, 1.2);
  near(timeline(cerberus).shots[3].time, 1.2 + 2.95);
  near(combat.reloadDuration(cerberus, 2), 2.25);
  assert.equal(t.events.filter((event) => event.type === 'dot-start').length, 1);
  assert.equal(t.events.filter((event) => event.type === 'dot-refresh').length, 2);
  near(t.events.find((event) => event.type === 'dot-end').time, 3.2);
  assert.ok(t.events.every((event, i, events) => i === 0 || event.time >= events[i - 1].time));
});

test('DoT supports delayed onset, stack cap, refresh and replacement', () => {
  const weapon = { name: 'Test DoT', bodyDamage: 1, rpm: 60, magazineSize: 2, emptyReload: 10 };
  const dot = { damagePerSecond: 10, duration: 2, startDelay: 0.5, trigger: 'hit', maxStacks: 2 };
  const make = (stackMode, extra = {}) => timeline({ ...weapon, mechanics: { dot: { ...dot, stackMode, ...extra } } }, { duration: 5 });
  for (const mode of ['refresh', 'replace']) {
    near(damageAt(make(mode), 0.4).burn, 0);
    near(damageAt(make(mode), 3.5).burn, 30);
  }
  near(damageAt(make('stack'), 3.5).burn, 40);
  near(damageAt(make('stack', { maxStacks: 1 }), 3.5).burn, 30);
  near(damageAt(make('stack', { trigger: (shot) => shot.index === 1 }), 4).burn, 20);
});

test('burn crossing exactly at a shot time does not count the unnecessary shot', () => {
  const t = timeline({ name: 'Test', bodyDamage: 10, rpm: 60, magazineSize: Infinity,
    mechanics: { dot: { damagePerSecond: 20, duration: 2, startDelay: 0, stackMode: 'refresh' } } });
  assert.deepEqual(death(t, 30), { time: 1, shots: 1, source: 'dot' });
});

test('non-headshot weapons ignore all seven patterns; unknown burn stays explicit', () => {
  for (const weapon of [flame, cerberus]) for (let headHits = 0; headHits <= 6; headHits++) {
    const t = timeline(weapon, { headHits });
    near(death(t, 250).time, death(timeline(weapon), 250).time);
    near(damageAt(t, 2).total, damageAt(timeline(weapon), 2).total);
    assert.ok(t.shots.every((shot) => shot.placement === 'B'));
  }
  const t = timeline(flame);
  assert.equal(t.dotStatus, 'unknown');
  assert.ok(t.warnings.some((warning) => warning.includes('burn duration')));
  assert.equal(t.dotSegments.length, 0);
  near(damageAt(timeline(flame, { range: 8 }), 1).total, 0);
});

test('exposure damage and stepped chart points come from real events', () => {
  const t = timeline(r93, { headHits: 2 });
  const summary = combat.exposureSummary(t);
  assert.deepEqual(summary.samples.map((sample) => sample.total), [48, 84, 132, 252]);
  near(summary.burstDamage, 84);
  near(summary.burstDuration, 0.12);
  near(summary.beforeReload, 756);
  const points = combat.timelinePoints(t, 0.2);
  assert.deepEqual(points.slice(0, 2).map(({ time, damage }) => ({ time, damage })), [{ time: 0, damage: 0 }, { time: 0, damage: 24 }]);
  near(points.at(-1).damage, 84);
  assert.ok(combat.timelinePoints(timeline(cerberus), 2).some((point) => point.kind === 'dot'));
});

test('Kill Window uses player HP and latest Heavy kill, Full Damage includes reloads', () => {
  const timelines = [timeline(arn), timeline(r93)];
  assert.deepEqual(combat.getTimelineBounds(timelines), { maxTime: 2, maxY: 400 });
  const full = combat.getTimelineBounds(timelines, 'Full Damage');
  assert.ok(full.maxTime >= 6 && full.maxY > 1000);
  assert.ok(full.maxTime > timelines[1].reloads[0].end);
  const make = (damage, rpm) => timeline({ name: 'Bounds test', bodyDamage: damage, rpm, magazineSize: Infinity });
  assert.equal(combat.getTimelineBounds([make(400, 60)]).maxTime, 1);
  assert.equal(combat.getTimelineBounds([make(100, 60)]).maxTime, 3.3);
  assert.equal(combat.getTimelineBounds([make(100, 6)]).maxTime, 8);
});

test('falloff affects direct hits only; missing data never fabricates a schedule', () => {
  const weapon = { ...arn, minDropoff: 30, maxDropoff: 40, dropoffModifier: 0.5 };
  near(damageAt(timeline(weapon, { range: 35 }), 0).direct, 17 * 0.75);
  near(damageAt(timeline(weapon, { range: 100 }), 0).direct, 8.5);
  near(damageAt(timeline({ ...cerberus, minDropoff: 10, maxDropoff: 20, dropoffModifier: 0.5 }, { range: 100 }), 1).burn, 15);
  const t = timeline({ name: 'Unknown reload', bodyDamage: 20, rpm: 600, magazineSize: 2 });
  assert.equal(t.shots.length, 2);
  assert.ok(t.warnings.some((warning) => warning.includes('reload')));
  assert.equal(death(t, 100).time, Infinity);
  assert.equal(timeline({ ...arn, name: 'Missing magazine' }).shots.length, 1);
});
