import { $ } from "./dom.js";
import { readStore, writeStore } from "./storage.js";

const KEY = "cosmos_hint";
const AUTO_HIDE_MS = 20000;

export function createHint() {
  const el = $("hint");
  let shown = false;
  let offered = false;
  let timer = null;

  function dismiss() {
    if (!shown) return;
    shown = false;
    el.hidden = true;
    clearTimeout(timer);
    window.removeEventListener("pointerdown", dismiss, true);
    window.removeEventListener("keydown", dismiss, true);
    writeStore(KEY, "1");
  }

  function show() {
    if (offered) return;
    offered = true;
    if (readStore(KEY) === "1") return;
    shown = true;
    el.hidden = false;
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", dismiss, true);
    timer = setTimeout(dismiss, AUTO_HIDE_MS);
  }

  $("hint-close").addEventListener("click", dismiss);

  return { show, dismiss };
}
