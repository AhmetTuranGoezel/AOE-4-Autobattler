# Weapon comparison model

The existing Krome JSONP/CSV integration supplies direct damage, RPM, burst
count/delay, falloff and reloads. `weapon-timeline.js` is a dependency-free pure
calculation module shared by the Range and Timeline views.

## Timing and hit placement

- First connecting hit is at zero. Handling, accuracy, travel time and target
  movement are excluded. Shotgun entries assume the listed full-shot damage.
- Krome's RPM is intra-burst RPM: the live 11.9.0 sheet supplies 1000 for 93R and
  1080 for FAMAS. Its burst delay is applied after the burst's final bullet.
  Range fields are mapped by heading because the sheet added a Stamina column.
- Reloads and linked-magazine swaps replace the normal next-shot interval.
  `magazineRaw` preserves values such as `30x2`; missing capacity is not treated
  as infinite ammo. GViz sometimes drops text cells in numeric columns.
- Hit Placement has seven integer positions: head hits per repeating six-hit
  sequence. Positions 0 through 6 use `BBBBBB`, `BBHBBB`, `BBHBBH`, `BHBHBH`,
  `HHBHHB`, `HHHBHH`, `HHHHHH`. Each shot deals actual body OR head damage;
  there is no averaged bullet, headshot probability or expected TTK.
- All weapons use the same pattern, indexed by total shots fired. It never
  restarts at a burst, reload or magazine swap. Weapons without headshot damage
  always use body damage, independent of the global slider.
- Continuous DoT is integrated over active intervals and can kill between shots.
  The mechanics interface supports hit-triggered or predicate-triggered effects,
  delay, refresh, replace and capped stacking. There are no fabricated ticks.
- `createWeaponTimeline()` schedules shots, burst gaps, reloads, magazine
  transitions and DoT events. `damageAt()`, `getKillTime()`, exposure snapshots,
  chart steps and all seven headshot breakpoint rows consume that same model.
  A burn kill exactly at the next shot time does not count an unnecessary shot.
- Range DPS retains firing-cycle semantics (no reload downtime), using the
  shared schedule over a whole repeating hit-and-burst cycle plus steady burn.
  Range TTK includes reloads and uses exactly the same hits as Timeline.
- Calculations use a 60-second horizon. Unresolved kills are N/A. Missing
  timing/capacity is flagged per weapon; unknown future shots aren't drawn.
  Values following an unknown scheduling boundary are shown as "Needs data".

## Timeline display

- Only pinned weapons are plotted. An empty Timeline keeps the weapon list
  available and displays "Select weapons to compare".
- Kill Window is the default: 0-400 damage, ending 0.3s after the latest known
  Heavy kill, rounded up to a tenth, with a 1s minimum and 8s maximum. Internal
  damage continues beyond the plot ceiling without creating a false plateau.
- Full Damage uses an autoscaled damage axis, at least 6s, and extends past
  the first reload/transition where possible, capped at 20s. These visual caps
  do not limit kill calculations; kills beyond the window stay in the details.
- Light/Medium/Heavy health lines and small death dots replace overlapping
  kill labels. Solid steps represent direct hits; dashed slopes represent burn.
- The 100ms/250ms/500ms/1s buttons set a persistent reference line. Each pinned
  card shows all four actual event totals and all three class kill times.
  Pointer hover temporarily adds elapsed time, damage components, shots,
  magazine and burst; leaving restores the selected exposure checkpoint.
- Raw combat data, source notes and seven-row headshot breakpoint tables are
  collapsible. The tables follow the current range and selected target HP.
  Hit Placement affects both views; Timeline has its own 0-100m distance.

## Mechanics overrides and evidence

Rechecked against the live sheet and wiki on October 1, 2026. Sheet direct
stats and supplied full-empty reloads take priority over wiki values.

- [Cerberus 12GA](https://www.thefinals.wiki/wiki/Cerberus_12GA): no headshots;
  15 burn damage/second for approximately 2 seconds, nonstacking refresh.
  Assumes a full connecting shot ignites; actual ignition requires enough
  pellets. Segmented reload extension provides 2.1s/2.25s for one/two missing
  shells. Full-empty combat uses the sheet (currently 2.95s), with the wiki's
  2.85s only as a fallback if the sheet has no value.
- [ARN-220](https://www.thefinals.wiki/wiki/ARN-220): two linked 30-round mags;
  requested wiki swap 0.66s, full-empty fallback 2.7s, tactical fallback 2.45s.
  **Unresolved source disagreement:** the live sheet note says 0.80s quick swap.
  The app exposes this discrepancy in model assumptions; it does not silently
  present the timings as agreed. Supplied sheet reload fields still win.
- [Flamethrower](https://www.thefinals.wiki/wiki/Flamethrower): no headshots,
  7.4m reach. Known burn rate is 15/s, but burn duration, onset and refresh
  behavior could not be verified. The sheet itself flags uncertainty. The
  override explicitly needs data and **only direct damage is simulated**.
  The Fire page's surface-fire duration is not substituted for weapon afterburn.
- SA1216: an explicit needs-data entry for linked-magazine capacity/transitions
  when absent from the sheet. No guessed reload or unlimited-magazine schedule.
- M134 Minigun: the sheet's fully spun-up cadence, with an explicit assumption.
  Initial spin-up is excluded rather than inventing a ramp curve.

Other rows without cadence (currently several melee attacks) are individually
flagged; a known first hit may still kill, but follow-up timings remain unknown.

## Tests

From the repository root:

```sh
node --test apps/finals-loadout/weapon-timeline.test.js apps/finals-loadout/weapon-stats-parser.test.js
```

Regression examples at 0m against Medium: ARN-220 body = 15 hits / 1.12s;
93R body = 11 hits / 1.245s; 93R 1/6 = 10 hits / 1.185s; 93R 2/6 = 9 hits /
0.91s. Cerberus reaches 250 damage from burn at 1.066667s after two shots.

The 21 automated tests cover all patterns, real-hit breakpoints, burst/reload
boundaries, linked magazines, DoT refresh/stack/delay, between-shot kills,
non-headshot weapons, exposure totals, view bounds, parser shifts and missing
mechanics. Browser checks with the live sheet cover both views, pins/filters,
exposure controls, expandable tables, 390px/320px mobile widths, saving,
item notes, reset, clipboard sharing, phone import and legacy migration.

Known limits: all listed damage is assumed to connect; aim, pellet spread,
latency, travel time, handling and minigun spin-up are not modeled. Mechanics
overrides are documented snapshots and can lag live sheet updates. Flame burn,
missing SA1216 transitions and the ARN swap disagreement remain explicit rather
than being guessed. Shared links carry saved builds and global item notes,
not transient Stats controls or unsaved loadout drafts.
