import { writeStore } from "./storage.js";

export function createViewControls(world) {
  let restoreTrueScale = null;

  function toggleSizes() {
    restoreTrueScale = null;
    world.setTrueScale(!world.state.trueScale);
  }

  function toggleOrbits() {
    world.state.showOrbits = !world.state.showOrbits;
  }

  function toggleLabels() {
    world.state.showLabels = !world.state.showLabels;
  }

  function toggleMissions() {
    world.state.showMissions = !world.state.showMissions;
  }

  function cycleQuality() {
    const tiers = world.textureTiers();
    if (tiers.length < 2) return;
    const at = tiers.indexOf(world.state.textureQuality);
    const next = tiers[(at + 1) % tiers.length];
    world.setTextureQuality(next);
    writeStore("cosmos_tex", next);
  }

  function beginEclipse() {
    if (!world.state.trueScale) {
      restoreTrueScale = false;
      world.setTrueScale(true);
    }
  }

  function settleScale() {
    if (restoreTrueScale === null) return;
    world.setTrueScale(restoreTrueScale);
    restoreTrueScale = null;
  }

  function forgetRestore() {
    restoreTrueScale = null;
  }

  return { toggleSizes, toggleOrbits, toggleLabels, toggleMissions, cycleQuality, beginEclipse, settleScale, forgetRestore };
}
