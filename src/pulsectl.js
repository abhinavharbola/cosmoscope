import { sim, setScale } from "./sim.js";

export function createPulseControl(world, ruler) {
  const pulse = { active: false, startMs: 0 };

  function start() {
    if (sim.scale < 30 || sim.scale > 20000) setScale(300);
    sim.paused = false;
    sim.direction = 1;
    ruler.show();
    world.emitPulse(sim.ms);
    pulse.startMs = sim.ms;
    pulse.active = true;
    ruler.log("Light covers 1 AU in 499 s");
  }

  function stop() {
    world.stopPulse();
    pulse.active = false;
    ruler.hide();
  }

  function toggle() {
    if (pulse.active) stop();
    else start();
  }

  return { pulse, start, stop, toggle };
}
