import { initUnitBattlerApp, switchPage, showUnitDetail, filterByCiv } from "./unit-battler/index.js";
import { initBuildOrderApp } from "./build-order/index.js";
import "./vs-building/index.js";
import "./multi-battle/index.js";

window.switchPage = switchPage;
window.showUnitDetail = showUnitDetail;
window.filterByCiv = filterByCiv;

document.getElementById("titleA")?.addEventListener("click", () => showUnitDetail("A"));
document.getElementById("titleB")?.addEventListener("click", () => showUnitDetail("B"));

try {
  await initUnitBattlerApp();
} catch (error) {
  console.error("Unit Battler init failed:", error);
}

try {
  await initBuildOrderApp();
} catch (error) {
  console.error("Build Order init failed:", error);
}

switchPage("unitBattler");
