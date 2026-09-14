#!/usr/bin/env node
"use strict";

// Poland's Astronomy is three different map interactions: inspect private
// cardboard, select one capital-edge ORIGIN, then freely hold one ghost tile
// over the map. This real-browser test protects those boundaries. In
// particular it would fail if the UI again painted every legal anchor or
// silently snapped the ghost to the first legal answer.

const { CHROME, startServer, Tab, waitUntil, reporter } = require("./browser-harness.js");
const R = reporter();

async function clickHex(tab, hexKey) {
  const point = await tab.eval(`UI.hexPoint(${JSON.stringify(hexKey)})`);
  if (!point) return false;
  await tab.cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved", x: point.x, y: point.y, button: "none"
  });
  await tab.cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1
  });
  await tab.cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1
  });
  return true;
}

async function moveToHex(tab, hexKey) {
  const point = await tab.eval(`UI.hexPoint(${JSON.stringify(hexKey)})`);
  if (!point) return false;
  await tab.cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved", x: point.x, y: point.y, button: "none"
  });
  return true;
}

const wizardMetrics = `(() => {
  const wizard = document.getElementById("wizard");
  const rect = wizard.getBoundingClientRect();
  return {
    left: Math.round(rect.left), top: Math.round(rect.top),
    transform: getComputedStyle(wizard).transform,
    imageTransforms: [...wizard.querySelectorAll(".astro-faces img")]
      .map((img) => getComputedStyle(img).transform),
    text: wizard.innerText
  };
})()`;

(async function main() {
  if (!CHROME) {
    console.log("No Chrome/Edge found; skipping Astronomy browser test.");
    return;
  }
  const { child: server, port } = await startServer();
  const url = `http://127.0.0.1:${port}/`;
  let tab = null;
  try {
    tab = await Tab.open("astronomy", url);
    const booted = await waitUntil(async () =>
      await tab.eval("typeof UI === 'object' && typeof Game === 'object'"), 20000);
    R.ok("page booted", booted >= 0);

    await tab.eval(`(() => {
      const solo = [...document.querySelectorAll("button")]
        .find((button) => /solo/i.test(button.textContent));
      if (solo) solo.click();
      return true;
    })()`);
    const seated = await waitUntil(async () =>
      !!(await tab.eval("UI.debugInfo().localPlayerId")), 10000);
    R.ok("local browser owns a real seat", seated >= 0);

    const seeded = await tab.eval(`(() => {
      const playerId = UI.debugInfo().localPlayerId;
      const p = Game.createPlayer(playerId, "Poland", "#8b62b5");
      const st = Game.createState([p], {});
      Game.finalizeSetup(st);
      const me = Game.getPlayer(st, playerId);
      me.leaderId = "poland";
      me.uniqueTaken = true;
      me.cardTiers.science = 2;
      me.cardLevels.science = 2;
      me.focusRow = ["culture", "growth", "science", "economy", "military", "industry"];
      me.cardPlayed = false;
      me.tech = 0;
      st.pendingChoices = [];
      st.cardResolution = null;
      st.turn.order = [playerId];
      st.turn.index = 0;
      st.phase = "playing";
      const active = Object.entries(st.map.hexes).filter(([, h]) => h.active);
      const tileIds = [...new Set(active.map(([, h]) => h.tileId).filter(Boolean))];
      const capitalTileId = tileIds.find((tileId) => active.filter(([, h]) => h.tileId === tileId)
        .filter(([, h]) => Game.hexNeighborKeys(h.q, h.r)
          .some((key) => !st.map.hexes[key] || !st.map.hexes[key].active)).length >= 2);
      const capitalSpaces = active.filter(([, h]) => h.tileId === capitalTileId);
      capitalSpaces.forEach(([, h]) => { h.city = null; });
      capitalSpaces[0][1].city = {
        ownerId: playerId, isCapital: true, developed: false,
        hasWonder: false, wonder: null
      };
      st.tileStack = st.setup.tileStack.slice();
      st.tileDeck = st.tileStack.slice();
      st.tiles = st.setup.tiles;
      UI.debugSetState(st);
      return { playerId, capitalTileId, stack: st.tileStack.slice(),
        slot: Game.getSlotValue(me, "science", st) };
    })()`);
    R.ok("Poland/Astronomy state seeded", !!seeded.capitalTileId && seeded.stack.length >= 2,
      JSON.stringify(seeded));
    await tab.eval(`(() => {
      document.querySelector('[data-camera="fit"]')?.click();
      return true;
    })()`);

    await tab.eval(`(() => {
      const card = document.querySelector('.fcard[data-card="science"]');
      if (card) card.click();
      return !!card;
    })()`);
    R.ok("Astronomy selection waits for explicit Start Action", await tab.eval(`UI.debugInfo().subPhase === "card_selected" && !!document.querySelector("#wiz-start") && !UI.debugState().pendingChoices.some(choice => choice.kind === "astronomy_count")`));
    await require("./playtest-browser-helpers.js").click(tab, "#wiz-start");
    const countShown = await waitUntil(async () =>
      await tab.eval(`UI.debugState().pendingChoices.some((choice) => choice.kind === "astronomy_count")`), 8000);
    R.ok("starting the real Astronomy focus card opens inspection count", countShown >= 0);
    const countButtons = await tab.eval(`(() => [...document.querySelectorAll(".pending-option")]
      .map((button) => button.dataset.option))()`);
    R.ok("up to two is rendered as 0, 1, and 2", ["0", "1", "2"].every((id) => countButtons.includes(id)),
      JSON.stringify(countButtons));
    await tab.eval(`(() => {
      const button = document.querySelector('.pending-option[data-option="2"]');
      if (button) button.click();
      return !!button;
    })()`);

    const compared = await waitUntil(async () =>
      await tab.eval(`UI.debugState().pendingChoices.some((choice) => choice.kind === "astronomy_tiles")`), 8000);
    R.ok("two inspected tiles reach the comparison step", compared >= 0);
    const comparison = await tab.eval(`(() => {
      const st = UI.debugState();
      const choice = st.pendingChoices.find((entry) => entry.kind === "astronomy_tiles");
      return {
        tileIds: choice.tileIds.slice(), edgeSpaces: choice.edgeSpaces.slice(),
        stack: st.tileStack.slice(), candidates: document.querySelectorAll(".astro-candidate").length,
        faceImages: document.querySelectorAll(".astro-faces img").length,
        ghost: UI.debugInfo().astronomyPreview.rendered
      };
    })()`);
    R.ok("both candidates and both faces are visible at useful browser scale",
      comparison.tileIds.length === 2 && comparison.candidates === 2 && comparison.faceImages === 4,
      JSON.stringify(comparison));
    R.ok("comparison has no map ghost and does not mutate the tile stack",
      comparison.ghost === null && JSON.stringify(comparison.stack) === JSON.stringify(seeded.stack));

    const plan = await tab.eval(`(() => {
      const st = UI.debugState();
      const choice = st.pendingChoices.find((entry) => entry.kind === "astronomy_tiles");
      const canvas = document.querySelector("canvas");
      for (const tileId of choice.tileIds) {
        for (const fromKey of choice.edgeSpaces) {
          const point = UI.hexPoint(fromKey);
          const placement = Game.getAstronomyPlacements(st, tileId, fromKey)
            .find((entry) => {
              const anchorPoint = UI.hexPoint(entry.anchorKey);
              return anchorPoint && document.elementFromPoint(anchorPoint.x, anchorPoint.y) === canvas;
            });
          if (placement && point && document.elementFromPoint(point.x, point.y) === canvas) {
            return { tileId, fromKey, placement, point,
              anchorPoint: UI.hexPoint(placement.anchorKey) };
          }
        }
      }
      return null;
    })()`);
    R.ok("test map contains a normal legal placement from a capital edge", !!plan, JSON.stringify(plan));
    if (!plan) throw new Error("No Astronomy placement available on the seeded board");

    await tab.eval(`(() => {
      const candidate = [...document.querySelectorAll(".astro-candidate")]
        .find((button) => button.dataset.astroTile === ${JSON.stringify(plan.tileId)});
      if (candidate) candidate.click();
      document.getElementById("astro-choose-origin")?.click();
      return !!candidate;
    })()`);
    const originMode = await waitUntil(async () =>
      await tab.eval(`UI.debugState().pendingChoices.some((choice) => choice.kind === "astronomy_edge")`), 8000);
    R.ok("candidate selection enters an explicit origin step", originMode >= 0);
    const originHighlights = await tab.eval(`(() => {
      const choice = UI.debugState().pendingChoices.find((entry) => entry.kind === "astronomy_edge");
      return { expected: choice.hexKeys.slice().sort(), shown: UI.debugInfo().boardHighlights.slice().sort(),
        text: document.getElementById("wizard").innerText };
    })()`);
    R.ok("only capital-edge ORIGIN choices are highlighted in origin mode",
      originHighlights.expected.length > 0 &&
      JSON.stringify(originHighlights.expected) === JSON.stringify(originHighlights.shown),
      JSON.stringify(originHighlights));

    R.ok("browser clicked the actual chosen capital-edge hex", await clickHex(tab, plan.fromKey));
    const placementMode = await waitUntil(async () =>
      await tab.eval(`UI.debugState().pendingChoices.some((choice) => choice.kind === "astronomy_place") &&
        !!document.getElementById("astro-place")`), 8000);
    const placementDetail = await tab.eval(`({ pending: UI.debugState().pendingChoices.map((choice) => choice.kind),
        point: ${JSON.stringify(plan.point)}, hit: (() => { const p = ${JSON.stringify(plan.point)};
          const e = document.elementFromPoint(p.x, p.y); return e && (e.id || e.className || e.tagName); })(),
        wizard: document.getElementById("wizard").innerText })`);
    placementDetail.errors = tab.errors.slice();
    R.ok("the clicked origin advances to free tile preview", placementMode >= 0, placementDetail);
    if (placementMode < 0) throw new Error("The real canvas click did not resolve astronomy_edge");
    const initialPreview = await tab.eval(`(() => {
      const st = UI.debugState();
      const choice = st.pendingChoices.find((entry) => entry.kind === "astronomy_place");
      const info = UI.debugInfo();
      return { selectedFromKey: choice.selectedFromKey, preview: info.astronomyPreview,
        highlights: info.boardHighlights, stack: st.tileStack.slice(),
        placeDisabled: document.getElementById("astro-place").disabled,
        forbiddenCopy: /legal map positions|positions? .*highlighted|choose .*highlighted legal/i
          .test(document.getElementById("wizard").innerText) };
    })()`);
    R.ok("the player's exact origin is visibly and authoritatively retained",
      initialPreview.selectedFromKey === plan.fromKey &&
      initialPreview.preview.selectedFromKey === plan.fromKey,
      JSON.stringify(initialPreview));
    R.ok("preview does not auto-snap to a legal answer",
      initialPreview.preview.anchorKey === plan.fromKey &&
      initialPreview.preview.rendered && initialPreview.preview.rendered.valid === false &&
      initialPreview.placeDisabled === true, JSON.stringify(initialPreview));
    R.ok("placement mode renders no collection of legal anchor highlights",
      initialPreview.highlights.length === 0 && !initialPreview.forbiddenCopy,
      JSON.stringify(initialPreview));
    R.ok("origin and initial preview leave the authoritative stack untouched",
      JSON.stringify(initialPreview.stack) === JSON.stringify(seeded.stack));

    const beforeWizard = await tab.eval(wizardMetrics);
    const firstRotation = initialPreview.preview.rotation;
    for (let i = 0; i < 6; i++) {
      await tab.eval(`(() => { document.getElementById("astro-rot-inc")?.click(); return true; })()`);
    }
    await tab.eval(`(() => { document.getElementById("astro-side")?.click(); return true; })()`);
    const alternate = comparison.tileIds.find((tileId) => tileId !== plan.tileId);
    if (alternate) {
      await tab.eval(`(() => {
        const candidate = [...document.querySelectorAll(".astro-candidate")]
          .find((button) => button.dataset.astroTile === ${JSON.stringify(alternate)});
        candidate?.click();
        return !!candidate;
      })()`);
      await tab.eval(`(() => {
        const candidate = [...document.querySelectorAll(".astro-candidate")]
          .find((button) => button.dataset.astroTile === ${JSON.stringify(plan.tileId)});
        candidate?.click();
        return !!candidate;
      })()`);
    }
    const afterWizard = await tab.eval(wizardMetrics);
    const afterManipulation = await tab.eval("UI.debugInfo().astronomyPreview");
    R.ok("six map rotations change the ghost and return it to its starting angle",
      afterManipulation.rotation === firstRotation, JSON.stringify(afterManipulation));
    R.ok("the wizard never rotates or moves with the map tile",
      beforeWizard.left === afterWizard.left && beforeWizard.top === afterWizard.top &&
      beforeWizard.transform === afterWizard.transform &&
      afterWizard.imageTransforms.every((value) => value === "none"),
      JSON.stringify({ beforeWizard, afterWizard }));

    // Put the fixed face/angle back on the plan using the real controls.
    let current = await tab.eval("UI.debugInfo().astronomyPreview");
    if (current.side !== plan.placement.side) {
      await tab.eval(`(() => { document.getElementById("astro-side")?.click(); return true; })()`);
    }
    current = await tab.eval("UI.debugInfo().astronomyPreview");
    for (let i = 0; i < 6 && current.rotation !== plan.placement.rotation; i++) {
      await tab.eval(`(() => { document.getElementById("astro-rot-inc")?.click(); return true; })()`);
      current = await tab.eval("UI.debugInfo().astronomyPreview");
    }

    const invalidKey = plan.fromKey;
    R.ok("moving over an invalid anchor still moves the physical ghost",
      await moveToHex(tab, invalidKey));
    const invalid = await tab.eval(`(() => ({ info: UI.debugInfo().astronomyPreview,
      disabled: document.getElementById("astro-place").disabled,
      text: document.querySelector(".astro-map-note").textContent }))()`);
    R.ok("only the current invalid attempt is marked and cannot be committed",
      invalid.info.anchorKey === invalidKey && invalid.info.rendered.valid === false &&
      invalid.disabled === true && /overlaps|not legal/i.test(invalid.text), JSON.stringify(invalid));

    R.ok("moving to the chosen legal anchor uses the real canvas", await moveToHex(tab, plan.placement.anchorKey));
    const legalNow = await waitUntil(async () => await tab.eval(`(() => {
      const info = UI.debugInfo();
      return info.astronomyPreview.anchorKey === ${JSON.stringify(plan.placement.anchorKey)} &&
        info.astronomyPreview.rendered && info.astronomyPreview.rendered.valid &&
        !document.getElementById("astro-place").disabled && info.boardHighlights.length === 0;
    })()`), 8000);
    R.ok("the current legal attempt enables Place without exposing alternatives", legalNow >= 0,
      await tab.eval("UI.debugInfo()"));

    await clickHex(tab, plan.placement.anchorKey);
    await require("./playtest-browser-helpers.js").click(tab, "#astro-place");
    const returnMode = await waitUntil(async () =>
      await tab.eval(`UI.debugState().pendingChoices.some((choice) => choice.kind === "astronomy_return")`), 8000);
    if (returnMode < 0) console.error("Astronomy runtime errors", tab.errors);
    R.ok("Place commits the exact current tile and opens the separate return step", returnMode >= 0,
      returnMode < 0 ? await tab.eval("({preview:UI.debugInfo().astronomyPreview,toast:document.querySelector('#toast')?.textContent})") : null);
    const committed = await tab.eval(`(() => {
      const st = UI.debugState();
      const tile = st.tiles[${JSON.stringify(plan.tileId)}];
      const choice = st.pendingChoices.find((entry) => entry.kind === "astronomy_return");
      return { tile: { placed: tile.placed, anchorKey: tile.anchorKey,
        rotation: tile.rotation, side: tile.side }, unused: choice.tileIds.slice(),
        stack: st.tileStack.slice(), tech: st.players[0].tech,
        selectedFromKey: st.cardResolution.astronomySelectedFromKey };
    })()`);
    R.ok("the committed tile preserves origin, side, rotation, and anchor exactly",
      committed.tile.placed && committed.tile.anchorKey === plan.placement.anchorKey &&
      committed.tile.rotation === plan.placement.rotation &&
      committed.tile.side === plan.placement.side &&
      committed.selectedFromKey === plan.fromKey, JSON.stringify(committed));
    R.ok("tech still waits while the unused tile is being returned", committed.tech === 0,
      JSON.stringify(committed));

    await tab.eval(`(() => {
      const button = document.querySelector('[data-astro-return="bottom"]');
      button?.click(); return !!button;
    })()`);
    const finished = await waitUntil(async () =>
      await tab.eval(`!UI.debugState().cardResolution`), 8000);
    R.ok("return-to-bottom finishes Astronomy", finished >= 0);
    const final = await tab.eval(`(() => {
      const st = UI.debugState();
      return { stack: st.tileStack.slice(), tech: st.players[0].tech,
        pending: st.pendingChoices.map((choice) => choice.kind),
        cardPlayed: st.players[0].cardPlayed };
    })()`);
    const base = seeded.stack.slice(0, -2);
    const expectedStack = base.concat(committed.unused);
    R.ok("the exact unused tile is returned to the chosen bottom",
      JSON.stringify(final.stack) === JSON.stringify(expectedStack),
      JSON.stringify({ expectedStack, final: final.stack }));
    R.ok("only after return does Astronomy advance tech and finish the card",
      final.tech === seeded.slot && final.cardPlayed && final.pending.length === 0,
      JSON.stringify(final));
    R.ok("no uncaught browser exception", tab.errors.length === 0, tab.errors[0]);
  } catch (error) {
    R.ok("Astronomy browser run completed", false, error.stack || String(error));
  } finally {
    if (tab) tab.close();
    server.kill();
  }

  console.log("astronomy-browser-test (real browser, explicit origin and free ghost):");
  R.print();
  if (R.fail) process.exitCode = 1;
})();
