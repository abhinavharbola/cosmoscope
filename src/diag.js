import { $, setText } from "./dom.js";

export function createDiag(world) {
  let on = false;
  let fps = 60;

  function render() {
    const d = world.diagnostics();
    const t = d.textureMs;
    const supplied = Object.entries(world.state.surfaces)
      .map(([id, surface]) => `${id} ${surface.tier}`)
      .join(", ");
    setText(
      $("diag"),
      [
        `${fps.toFixed(0)} fps`,
        `${d.calls} draw calls, ${Math.round(d.triangles / 1000)}k triangles`,
        `GPU: ${d.gpu}`,
        `Shader fallback: ${d.degraded ? "active" : "no"}`,
        `Textures: ${t === null ? "building" : `${(t / 1000).toFixed(1)} s`}`,
        `Supplied maps: ${supplied || "none"}`,
      ].join("\n")
    );
  }

  function toggle() {
    on = !on;
    $("diag").hidden = !on;
    if (on) render();
  }

  return { render, toggle, isOn: () => on, setFps: (v) => (fps = v) };
}
