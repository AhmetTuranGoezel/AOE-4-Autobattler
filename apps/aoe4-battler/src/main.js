import { initUnitBattlerApp, switchPage, showUnitDetail, filterByCiv } from "./unit-battler/index.js";
import { initBuildOrderApp } from "./build-order/index.js";
import "./vs-building/index.js";
import "./multi-battle/index.js";

window.switchPage = switchPage;
window.showUnitDetail = showUnitDetail;
window.filterByCiv = filterByCiv;

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
