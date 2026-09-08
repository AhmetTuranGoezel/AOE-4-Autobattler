#!/usr/bin/env node
"use strict";

const { CHROME, startServer, Tab, waitUntil, reporter } = require("./browser-harness.js");
const R = reporter();

(async function main() {
  if (!CHROME) { console.log("No Chrome/Edge found; skipping Ibrahim browser test."); return; }
  const { child: server, port } = await startServer();
  let tab = null;
  try {
    tab = await Tab.open("ibrahim", `http://127.0.0.1:${port}/`);
    R.ok("page booted", (await waitUntil(async () =>
      await tab.eval("typeof UI === 'object' && typeof Game === 'object'"), 20000)) >= 0);
    await tab.eval(`(() => {
      [...document.querySelectorAll("button")].find((b) => /solo/i.test(b.textContent))?.click();
      return true;
    })()`);
    R.ok("local browser owns a seat", (await waitUntil(async () =>
      !!(await tab.eval("UI.debugInfo().localPlayerId")), 10000)) >= 0);

    const seeded = await tab.eval(`(() => {
      const localId = UI.debugInfo().localPlayerId;
      const holder = Game.createPlayer(localId, "Current Holder", "#169eae");
      const ottoman = Game.createPlayer("seat-ottoman", "Ottoman Player", "#d94747");
      const st = Game.createState([holder, ottoman], {});
      Game.finalizeSetup(st);
      holder.leaderId = "america";
      ottoman.leaderId = "ottoman";
      st.turn.order = [holder.id, ottoman.id]; st.turn.index = 0;
      st.ibrahimHolder = holder.id;
      UI.debugSetState(st);
      return { localId, ottomanId: ottoman.id };
    })()`);
    R.ok("Ibrahim appears on exactly the public holder seat",
      (await tab.eval("document.querySelectorAll('.ibrahim-holder-chip').length")) === 1 &&
      (await tab.eval("document.querySelector('.ibrahim-holder-chip')?.dataset.ibrahimHolder")) === seeded.localId);
    R.ok("the local holder also sees Ibrahim in My Tableau",
      await tab.eval("!!document.querySelector('#my-ibrahim')"));
    R.ok("both compact markers use the extracted Ibrahim art",
      await tab.eval(`(() => [...document.querySelectorAll('.ibrahim-holder-chip img, #my-ibrahim img')]
        .length === 2 && [...document.querySelectorAll('.ibrahim-holder-chip img, #my-ibrahim img')]
        .every((img) => !!img.getAttribute('src')))()`));

    await tab.eval("(() => { document.querySelector('.ibrahim-holder-chip').click(); return true; })()");
    R.ok("clicking the public marker opens the Ottoman reference",
      (await waitUntil(async () => await tab.eval(`(() => {
        const ref = document.querySelector('#reference-body');
        return !document.querySelector('#reference').classList.contains('hidden') &&
          /Ottoman/.test(ref.textContent) && /Held by Current Holder/.test(ref.textContent);
      })()`), 2500)) >= 0);
    R.ok("the reference contains the full Ibrahim card image",
      await tab.eval("!!document.querySelector('#reference-body .ibrahim-feature img[src]')"));

    await tab.eval(`(() => {
      document.querySelector('#reference')?.classList.add('hidden');
      UI.debugState().ibrahimHolder = ${JSON.stringify(seeded.ottomanId)};
      UI.render();
      return true;
    })()`);
    R.ok("transferring Ibrahim moves the one public marker to the new holder",
      (await tab.eval("document.querySelectorAll('.ibrahim-holder-chip').length")) === 1 &&
      (await tab.eval("document.querySelector('.ibrahim-holder-chip')?.dataset.ibrahimHolder")) === seeded.ottomanId);
    R.ok("the old local holder immediately loses the private tableau shortcut",
      !(await tab.eval("!!document.querySelector('#my-ibrahim')")));
    await tab.eval("(() => { document.querySelector('.ibrahim-holder-chip').click(); return true; })()");
    R.ok("the opened card names the transferred holder",
      /Held by Ottoman Player/.test(await tab.eval("document.querySelector('#reference-body')?.textContent || ''")));

    await tab.eval(`(() => {
      document.querySelector('#reference')?.classList.add('hidden');
      UI.debugState().ibrahimHolder = null;
      UI.render();
      return true;
    })()`);
    R.ok("removing Ibrahim removes every holder marker",
      (await tab.eval("document.querySelectorAll('.ibrahim-holder-chip, #my-ibrahim').length")) === 0);
    R.ok("no uncaught browser exception", tab.errors.length === 0, tab.errors[0]);
  } catch (error) {
    R.ok("Ibrahim browser run completed", false, error.stack || String(error));
  } finally {
    if (tab) tab.close();
    server.kill();
  }
  console.log("ibrahim-browser-test (public ownership and card art):");
  R.print();
  if (R.fail) process.exitCode = 1;
})();
