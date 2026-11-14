export function createDialog(root, card, close) {
  let returnTo = null;

  function toggle(force) {
    const open = force === undefined ? root.hidden : force;
    root.hidden = !open;
    if (open) {
      returnTo = document.activeElement;
      card.focus();
    } else if (returnTo && returnTo.focus) {
      if (!returnTo.closest("[hidden]")) returnTo.focus();
      returnTo = null;
    }
  }

  root.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const stops = [card, ...card.querySelectorAll("a[href], button:not([disabled])")];
    const at = stops.indexOf(document.activeElement);
    const step = e.shiftKey ? -1 : 1;
    stops[(at + step + stops.length) % stops.length].focus();
  });

  close.addEventListener("click", () => toggle(false));

  root.addEventListener("click", (e) => {
    if (e.target === root) toggle(false);
  });

  return { toggle, isOpen: () => !root.hidden };
}
