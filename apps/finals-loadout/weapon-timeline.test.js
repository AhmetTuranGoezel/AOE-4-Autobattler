'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const combat = require('./weapon-timeline.js');
const { createWeaponTimeline: timeline, damageAt, killDistribution: deaths } = combat;
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const arn = { name: 'ARN-220', bodyDamage: 17, headDamage: 25.5, rpm: 750 };
const r93 = { name: '93R', bodyDamage: 24, headDamage: 36, rpm: 1000,
  burstCount: 3, burstDelay: 0.275, magazineSize: 27, emptyReload: 1.75 };
const cerberus = { name: 'Cerberus 12GA', bodyDamage: 117, headDamage: 117,
  rpm: 100, magazineSize: 3, emptyReload: 2.95 };
const mixed = (p) => ({ hitMode: 'Mixed', headshotProbability: p });

test('ARN-220 body Medium kill is its 15th real bullet at 1.12 seconds', () => {
  const result = deaths(timeline(arn), 250);
  near(result.expectedTTK, 1.12);
  near(result.expectedShots, 15);
  near(result.probabilityAt(1.119), 0);
  near(result.probabilityAt(1.12), 1);
});

test('93R intra-burst timing and final-bullet-to-next-burst delay', () => {
  const actual = timeline(r93).shots.slice(0, 10).map((shot) => shot.time);
  [0, 0.06, 0.12, 0.395, 0.455, 0.515, 0.790, 0.850, 0.910, 1.185]
    .forEach((expected, i) => near(actual[i], expected));
  near(combat.firingDPS(r93), 72 / 0.395);
});

test('Mixed expected TTK has the exact regression values, without the 9-bullet cliff', () => {
  near(deaths(timeline(r93, mixed(0.35)), 250).expectedTTK, 0.9971538584202091);
  near(deaths(timeline(arn, mixed(0.35)), 250).expectedTTK, 0.9659031287098643);
  const thirty = deaths(timeline(r93, mixed(0.30)), 250).expectedTTK;
  const thirtyFive = deaths(timeline(r93, mixed(0.35)), 250).expectedTTK;
  assert.ok(thirty > thirtyFive && thirty - thirtyFive < 0.08);
  for (let p = 30; p < 35; p += 0.1) {
    assert.ok(Math.abs(deaths(timeline(r93, mixed(p / 100)), 250).expectedTTK
      - deaths(timeline(r93, mixed((p + 0.1) / 100)), 250).expectedTTK) < 0.003);
  }
});

test('exact headshot distribution agrees with exhaustive independent outcomes', () => {
  const weapon = { name: 'Test', bodyDamage: 20, headDamage: 40, rpm: 600, magazineSize: Infinity };
  const p = 0.35;
  let expected = 0;
  let expectedShots = 0;
  const enumerate = (damage, probability, shots) => {
    if (damage >= 90) { expected += probability * (shots - 1) * 0.1; expectedShots += probability * shots; return; }
    enumerate(damage + 20, probability * (1 - p), shots + 1);
    enumerate(damage + 40, probability * p, shots + 1);
  };
  enumerate(0, 1, 0);
  const distribution = deaths(timeline(weapon, mixed(p)), 90);
  near(distribution.expectedTTK, expected);
  near(distribution.expectedShots, expectedShots);
  near(distribution.kills.reduce((sum, k) => sum + k.probability, 0), 1);
  assert.ok(distribution.probabilityAt(distribution.medianTime) >= 0.5);
  assert.ok(distribution.probabilityAt(distribution.medianTime - 0.00001) < 0.5);
});

test('Body and Head match Mixed endpoints with integral real-shot counts for all HPs', () => {
  for (const weapon of [arn, r93]) for (const hp of Object.values(combat.HEALTH)) {
    for (const [hitMode, p] of [['Body', 0], ['Head', 1]]) {
      const result = deaths(timeline(weapon, { hitMode }), hp);
      const shots = Math.ceil(hp / (p ? weapon.headDamage : weapon.bodyDamage));
      near(result.expectedShots, shots);
      near(result.expectedTTK, timeline(weapon).shots[shots - 1].time);
      near(result.expectedTTK, deaths(timeline(weapon, mixed(p)), hp).expectedTTK);
    }
  }
});

test('reload replaces normal shot interval; burst cadence restarts after reload', () => {
  const t = timeline({ ...r93, magazineSize: 4, emptyReload: 2 }, { duration: 4 });
  near(t.shots[3].time, 0.395);
  near(t.shots[4].time, 2.395);
  near(t.shots[5].time, 2.455);
  near(t.shots[7].time, 2.790);
});

test('linked magazines survive parsing and alternate quick swap / full reload', () => {
  for (const value of ['30\u00d72', '30x2', '30 x 2']) assert.deepEqual(combat.parseMagazine(value), { rounds: 30, count: 2 });
  const t = timeline({ ...arn, magazineRaw: '30\u00d72' });
  near(t.shots[30].time - t.shots[29].time, 0.66);
  near(t.shots[60].time - t.shots[59].time, 2.7);
  near(t.shots[90].time - t.shots[89].time, 0.66);
  near(timeline({ ...arn, emptyReload: 3.1 }).shots[60].time - t.shots[59].time, 3.1);
  near(combat.reloadDuration(arn, 29), 2.45);
});

test('Cerberus burn is continuous, nonstacking and refreshed by each full shot', () => {
  const t = timeline(cerberus, { duration: 3.2 });
  near(damageAt(t, 0).total, 117);
  near(damageAt(t, 0.5).burn, 7.5);
  near(damageAt(t, 1).burn, 15);
  near(damageAt(t, 3.2).burn, 48);
  near(deaths(t, 250).expectedTTK, 16 / 15); // After hit 2, before hit 3.
  near(deaths(t, 150).expectedTTK, 0.6);
  near(deaths(t, 350).expectedTTK, 1.2);
  near(timeline(cerberus).shots[3].time, 1.2 + 2.95); // Sheet wins over wiki.
  near(combat.reloadDuration(cerberus, 2), 2.25);
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

test('Mixed continuous burn kills retain exact first-death probability', () => {
  const t = timeline({ name: 'Test', bodyDamage: 10, headDamage: 20, rpm: 60, magazineSize: Infinity,
    mechanics: { dot: { damagePerSecond: 20, duration: 2, startDelay: 0, stackMode: 'refresh' } } }, mixed(0.5));
  const result = deaths(t, 25);
  near(result.expectedTTK, 0.5); // Half die at .25s, half at .75s.
  near(result.medianTime, 0.25);
  near(result.probabilityAt(0.5), 0.5);
});

test('Flamethrower ignores headshots and explicitly reports unknown burn, never invents it', () => {
  const weapon = { name: 'Flamethrower', bodyDamage: 30, headDamage: 60, rpm: 170, magazineSize: 30, emptyReload: 3.55 };
  const t = timeline(weapon, mixed(1));
  near(deaths(t, 250).expectedTTK, deaths(timeline(weapon, mixed(0)), 250).expectedTTK);
  assert.ok(t.warnings.some((warning) => warning.includes('burn duration')));
  assert.equal(t.dotSegments.length, 0);
  near(damageAt(timeline(weapon, { range: 8 }), 1).total, 0);
});

test('exposure damage and chart points come from real events, not DPS times elapsed', () => {
  const t = timeline(r93);
  const summary = combat.exposureSummary(t);
  assert.deepEqual(summary.samples.map((sample) => sample.total), [48, 72, 120, 216]);
  near(summary.burstDamage, 72);
  near(summary.burstDuration, 0.12);
  near(summary.beforeReload, 648);
  const points = combat.timelinePoints(t, 0.2);
  assert.deepEqual(points.slice(0, 2), [{ time: 0, damage: 0 }, { time: 0, damage: 24 }]);
  near(points.at(-1).damage, 72);
});

test('falloff affects direct hits; unknown cadence/reload never fabricates a schedule', () => {
  const weapon = { ...arn, minDropoff: 30, maxDropoff: 40, dropoffModifier: 0.5 };
  near(damageAt(timeline(weapon, { range: 35 }), 0).direct, 17 * 0.75);
  near(damageAt(timeline(weapon, { range: 100 }), 0).direct, 8.5);
  const t = timeline({ name: 'Unknown reload', bodyDamage: 20, rpm: 600, magazineSize: 2 });
  assert.equal(t.shots.length, 2);
  assert.ok(t.warnings.some((warning) => warning.includes('reload')));
  assert.equal(deaths(t, 100).expectedTTK, Infinity);
  assert.equal(timeline({ ...arn, name: 'Missing magazine' }).shots.length, 1);
});
