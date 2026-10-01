(function (root) {
  'use strict';

  const EPS = 1e-9;
  const HEALTH = { Light: 150, Medium: 250, Heavy: 350 };
  // Supplement mechanics only. Damage, RPM, falloff and known reloads stay sheet-owned.
  const WEAPON_MECHANICS_OVERRIDES = {
    'Cerberus 12GA': {
      canHeadshot: false,
      dot: { damagePerSecond: 15, duration: 2, startDelay: 0, stackMode: 'refresh', maxStacks: 1, trigger: 'hit' },
      reload: { byMissingRounds: { 1: 2.1, 2: 2.25, 3: 2.85 } },
      notes: ['Assumes all pellets connect and ignite. Actual ignition requires enough pellets. Burn duration is approximate; full-empty reload uses the sheet.'],
      source: 'https://www.thefinals.wiki/wiki/Cerberus_12GA'
    },
    'Flamethrower': {
      canHeadshot: false,
      maxRange: 7.4,
      dot: { damagePerSecond: 15, duration: null, startDelay: null, stackMode: null, trigger: 'hit' },
      needsData: ['Direct damage only: burn duration, onset and refresh behavior need verification. Burn is NOT simulated.'],
      source: 'https://www.thefinals.wiki/wiki/Flamethrower'
    },
    'ARN-220': {
      magazine: { rounds: 30, count: 2, swapDuration: 0.66 },
      reload: { emptyFallback: 2.7, tacticalFallback: 2.45 },
      notes: ['Linked magazines: wiki 0.66s swap; current sheet note says 0.80s. Using the requested wiki timing pending reconciliation. Sheet reload values take priority.'],
      source: 'https://www.thefinals.wiki/wiki/ARN-220'
    },
    'SA1216': {
      needsData: ['Linked-magazine capacity and transition timings need verified data when missing from the sheet.']
    },
    'M134 Minigun': {
      notes: ['Fully spun up, as in the sheet. Spin-up and accuracy are not simulated.']
    }
  };

  function parseMagazine(value) {
    if (value === Infinity || /^(?:n\/a|-|infinity)$/i.test(String(value).trim())) {
      return { rounds: Infinity, count: 1 };
    }
    const match = String(value ?? '').trim().match(/^(\d+)\s*(?:[x\u00d7*]\s*(\d+))?/i);
    return match && Number(match[1]) > 0
      ? { rounds: Number(match[1]), count: Math.max(1, Number(match[2]) || 1) }
      : { rounds: null, count: 1 };
  }

  function mechanicsFor(weapon) {
    return weapon.mechanics || WEAPON_MECHANICS_OVERRIDES[weapon.name] || {};
  }

  function damageProfile(weapon, options = {}) {
    const mechanics = mechanicsFor(weapon);
    const range = Math.max(0, options.range || 0);
    let multiplier = 1;
    if (Number.isFinite(mechanics.maxRange) && range > mechanics.maxRange) {
      multiplier = 0;
    } else if (weapon.dropoffModifier >= 0 && weapon.dropoffModifier < 1) {
      if (weapon.maxDropoff > weapon.minDropoff) {
        const progress = Math.max(0, Math.min(1, (range - weapon.minDropoff) / (weapon.maxDropoff - weapon.minDropoff)));
        multiplier = 1 - (1 - weapon.dropoffModifier) * progress;
      } else if (weapon.maxDropoff > 0 && range > weapon.maxDropoff) {
        multiplier = weapon.dropoffModifier;
      }
    }
    const body = Math.max(0, weapon.bodyDamage || 0) * multiplier;
    const canHeadshot = mechanics.canHeadshot !== false && weapon.headDamage > weapon.bodyDamage;
    const head = canHeadshot ? weapon.headDamage * multiplier : body;
    const probability = !canHeadshot ? 0 : options.hitMode === 'Head' ? 1
      : options.hitMode === 'Mixed' ? Math.max(0, Math.min(1, options.headshotProbability || 0)) : 0;
    return { body, head, probability, expected: body + probability * (head - body), canHeadshot };
  }

  function reloadDuration(weapon, missingRounds, mechanics = mechanicsFor(weapon)) {
    const magazine = parseMagazine(weapon.magazineRaw ?? weapon.magazineSize);
    const capacity = magazine.rounds || mechanics.magazine?.rounds;
    if (missingRounds === capacity) {
      return weapon.emptyReload > 0 ? weapon.emptyReload
        : mechanics.reload?.emptyFallback || mechanics.reload?.byMissingRounds?.[missingRounds] || null;
    }
    return mechanics.reload?.byMissingRounds?.[missingRounds]
      || (weapon.tacticalReload > 0 ? weapon.tacticalReload : mechanics.reload?.tacticalFallback) || null;
  }

  function isVerifiedDot(dot) {
    return Boolean(dot && dot.duration > 0 && dot.damagePerSecond > 0 && dot.startDelay != null
      && ['refresh', 'stack', 'replace'].includes(dot.stackMode));
  }

  function createDotSegments(shots, dot, duration) {
    if (!isVerifiedDot(dot)) return [];
    const applications = shots.filter((shot) => shot.body > 0 && (typeof dot.trigger !== 'function' || dot.trigger(shot)));
    const intervals = [];
    applications.forEach((shot) => {
      const start = shot.time + Math.max(0, dot.startDelay);
      const end = start + dot.duration;
      const active = intervals.filter((interval) => interval.end > start + EPS);
      if (dot.stackMode === 'refresh' && active.length) {
        active[0].end = Math.max(active[0].end, end);
      } else {
        if (dot.stackMode === 'replace') active.forEach((interval) => { interval.end = start; });
        if (dot.stackMode === 'stack' && active.length >= (dot.maxStacks || Infinity)) {
          active.sort((a, b) => a.end - b.end)[0].end = start;
        }
        intervals.push({ start, end });
      }
    });
    const changes = new Map();
    intervals.forEach(({ start, end }) => {
      changes.set(start, (changes.get(start) || 0) + dot.damagePerSecond);
      changes.set(end, (changes.get(end) || 0) - dot.damagePerSecond);
    });
    const segments = [];
    let rate = 0;
    let previous = 0;
    for (const [time, change] of [...changes].sort((a, b) => a[0] - b[0])) {
      if (time > previous && rate > 0 && previous < duration) {
        segments.push({ start: previous, end: Math.min(time, duration), rate });
      }
      rate += change;
      previous = time;
    }
    return segments;
  }

  function createWeaponTimeline(weapon, options = {}) {
    const duration = Math.max(0, Math.min(options.duration ?? 60, 120));
    const mechanics = mechanicsFor(weapon);
    const profile = damageProfile(weapon, options);
    const warnings = [...(mechanics.needsData || [])];
    const magazine = parseMagazine(weapon.magazineRaw ?? weapon.magazineSize);
    const rounds = magazine.rounds || mechanics.magazine?.rounds;
    const magazineCount = weapon.magazineCount || (magazine.count > 1 ? magazine.count : mechanics.magazine?.count) || 1;
    const rpm = weapon.intraBurstRpm || weapon.rpm;
    const interval = rpm > 0 ? 60 / rpm : Infinity;
    const burstCount = Math.max(1, Math.floor(weapon.burstCount || 1));
    const shots = [];
    const reloads = [];
    let time = 0;
    let magazineIndex = 0;
    let inMagazine = 0;
    let inBurst = 0;
    let burstIndex = 0;
    let knownUntil = duration;
    if (!(rpm > 0)) warnings.push('Firing cadence needs data; only the first hit is known.');
    if (!rounds) warnings.push('Magazine capacity needs data; only the first hit is known.');
    if (burstCount > 1 && !(weapon.burstDelay > 0)) warnings.push('Inter-burst delay needs data.');

    while (time <= duration + EPS && shots.length < 5000) {
      shots.push({ type: 'shot', time, index: shots.length + 1, magazineIndex, burstIndex, ...profile });
      inMagazine++;
      inBurst++;
      let delay;
      if (!rounds || !Number.isFinite(interval)) {
        knownUntil = time;
        break;
      }
      if (inMagazine >= rounds) {
        const swap = magazineIndex % magazineCount < magazineCount - 1;
        delay = swap ? (weapon.magazineSwap || mechanics.magazine?.swapDuration) : reloadDuration(weapon, rounds, mechanics);
        if (!(delay > 0)) {
          warnings.push(`${swap ? 'Magazine swap' : 'Empty reload'} duration needs data; firing stops at the magazine boundary.`);
          knownUntil = time;
          break;
        }
        reloads.push({ type: swap ? 'swap' : 'reload', start: time, end: time + delay, magazineIndex });
        magazineIndex++;
        inMagazine = 0;
        inBurst = 0;
        burstIndex++;
      } else if (inBurst >= burstCount) {
        delay = burstCount > 1 ? weapon.burstDelay : interval;
        if (!(delay > 0)) { knownUntil = time; break; }
        inBurst = 0;
        burstIndex++;
      } else {
        delay = interval;
      }
      time += delay;
    }
    const dotSegments = createDotSegments(shots, mechanics.dot, duration);
    const events = [...shots, ...reloads.map((reload) => ({ ...reload, time: reload.start })),
      ...dotSegments.map((segment) => ({ type: 'dot', time: segment.start, ...segment }))]
      .sort((a, b) => a.time - b.time);
    return { weapon, profile, shots, reloads, dotSegments, events, duration, knownUntil,
      dotStatus: !mechanics.dot ? 'none' : isVerifiedDot(mechanics.dot) ? 'modeled' : 'unknown',
      rounds, magazineCount, burstCount, warnings: [...new Set(warnings)],
      notes: mechanics.notes || [], source: mechanics.source };
  }

  function damageAt(timeline, time) {
    if (time < 0) return { direct: 0, burn: 0, total: 0, shots: 0 };
    const t = Math.min(time, timeline.duration);
    let low = 0;
    let high = timeline.shots.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (timeline.shots[mid].time <= t + EPS) low = mid + 1;
      else high = mid;
    }
    const direct = low * timeline.profile.expected;
    const burn = timeline.dotSegments.reduce((sum, segment) => sum
      + Math.max(0, Math.min(t, segment.end) - segment.start) * segment.rate, 0);
    return { direct, burn, total: direct + burn, shots: low };
  }

  // Surviving probability mass indexed by headshot count. Removing killed paths
  // gives exact first-kill probabilities, including crossings between shots.
  function killDistribution(timeline, health) {
    const { body, head, probability: p } = timeline.profile;
    if (Math.max(body, head) <= 0 && !timeline.dotSegments.length) {
      return { kills: [], complete: false, expectedTTK: Infinity, expectedShots: Infinity,
        medianTime: Infinity, probabilityAt: () => 0 };
    }
    const times = [...new Set([0, timeline.duration, ...timeline.shots.map((s) => s.time),
      ...timeline.dotSegments.flatMap((s) => [s.start, s.end])])].sort((a, b) => a - b);
    const kills = [];
    let alive = [1];
    let count = 0;
    let burn = 0;
    let shotIndex = 0;
    let segmentIndex = 0;
    let previous = 0;
    let rate = 0;
    for (const time of times) {
      const nextBurn = burn + rate * (time - previous);
      alive.forEach((mass, k) => {
        if (!mass) return;
        const remaining = health - count * body - k * (head - body) - burn;
        if (rate > 0 && remaining <= nextBurn - burn + EPS) {
          kills.push({ time: previous + Math.max(0, remaining) / rate, probability: mass, shots: count });
          alive[k] = 0;
        }
      });
      burn = nextBurn;
      while (shotIndex < timeline.shots.length && timeline.shots[shotIndex].time <= time + EPS) {
        const next = Array(alive.length + 1).fill(0);
        alive.forEach((mass, k) => { next[k] += mass * (1 - p); next[k + 1] += mass * p; });
        alive = next;
        count++;
        shotIndex++;
        alive.forEach((mass, k) => {
          if (mass && count * body + k * (head - body) + burn >= health - EPS) {
            kills.push({ time, probability: mass, shots: count });
            alive[k] = 0;
          }
        });
      }
      if (!alive.some((mass) => mass > 0)) break;
      while (segmentIndex < timeline.dotSegments.length && timeline.dotSegments[segmentIndex].end <= time + EPS) segmentIndex++;
      const segment = timeline.dotSegments[segmentIndex];
      rate = segment && segment.start <= time + EPS ? segment.rate : 0;
      previous = time;
    }
    kills.sort((a, b) => a.time - b.time);
    const remaining = alive.reduce((sum, mass) => sum + mass, 0);
    let cumulative = 0;
    let medianTime = Infinity;
    kills.forEach((kill) => {
      cumulative += kill.probability;
      if (!Number.isFinite(medianTime) && cumulative >= 0.5 - EPS) medianTime = kill.time;
    });
    return { kills, complete: remaining === 0,
      expectedTTK: remaining === 0 ? kills.reduce((sum, k) => sum + k.time * k.probability, 0) : Infinity,
      expectedShots: remaining === 0 ? kills.reduce((sum, k) => sum + k.shots * k.probability, 0) : Infinity,
      medianTime,
      probabilityAt: (time) => Math.min(1, kills.reduce((sum, k) => sum + (k.time <= time + EPS ? k.probability : 0), 0)) };
  }

  function timelinePoints(timeline, end) {
    const times = [...new Set([0, Math.min(end, timeline.duration), ...timeline.shots.map((s) => s.time),
      ...timeline.dotSegments.flatMap((s) => [s.start, s.end])])]
      .filter((t) => t <= end + EPS && t <= timeline.knownUntil + EPS).sort((a, b) => a - b);
    const shotTimes = new Set(timeline.shots.map((s) => s.time));
    return times.flatMap((time) => {
      const total = damageAt(timeline, time).total;
      return shotTimes.has(time) ? [{ time, damage: total - timeline.profile.expected }, { time, damage: total }]
        : [{ time, damage: total }];
    });
  }

  function exposureSummary(timeline) {
    const firstBurst = timeline.shots.filter((shot) => shot.burstIndex === 0);
    const last = firstBurst.at(-1);
    const reload = timeline.reloads[0];
    return { samples: [0.1, 0.25, 0.5, 1].map((time) => ({ time, ...damageAt(timeline, time) })),
      burstDamage: last ? damageAt(timeline, last.time).total : 0, burstDuration: last?.time || 0,
      beforeReload: reload ? damageAt(timeline, reload.start).total : null,
      reloadTime: reload?.start ?? null };
  }

  // Preserve Range DPS as firing-cycle DPS (not sustained/reload-adjusted DPS).
  // It uses the same scheduler with an unlimited magazine and includes steady DoT.
  function firingDPS(weapon, options = {}) {
    const mechanics = mechanicsFor(weapon);
    const timeline = createWeaponTimeline({ ...weapon, magazineRaw: Infinity, magazineSize: Infinity,
      magazineCount: 1, mechanics: { ...mechanics, magazine: undefined } }, { ...options, duration: 30 });
    const nextBurst = timeline.shots.find((shot) => shot.burstIndex === 1);
    if (!nextBurst || !nextBurst.time) return NaN;
    const direct = timeline.shots.filter((shot) => shot.burstIndex === 0).length * timeline.profile.expected / nextBurst.time;
    const end = timeline.duration;
    const burn = (damageAt(timeline, end).burn - damageAt(timeline, end - nextBurst.time).burn) / nextBurst.time;
    return direct + burn;
  }

  const api = { HEALTH, WEAPON_MECHANICS_OVERRIDES, parseMagazine, damageProfile, reloadDuration,
    createWeaponTimeline, damageAt, killDistribution, timelinePoints, exposureSummary, firingDPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinalsCombat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
