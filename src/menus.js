import { $ } from "./dom.js";

export function createMenus() {
  const menus = [
    { btn: $("btn-jump"), pop: $("jump") },
    { btn: $("btn-view"), pop: $("view") },
  ];

  function close() {
    menus.forEach((m) => {
      m.pop.hidden = true;
      m.btn.setAttribute("aria-expanded", "false");
    });
  }

  function isOpen() {
    return menus.some((m) => !m.pop.hidden);
  }

  menus.forEach((m) => {
    m.btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = m.pop.hidden;
      close();
      m.pop.hidden = !open;
      m.btn.setAttribute("aria-expanded", String(!m.pop.hidden));
    });
  });

  document.addEventListener("click", (e) => {
    menus.forEach((m) => {
      if (!m.pop.hidden && !m.pop.contains(e.target)) {
        m.pop.hidden = true;
        m.btn.setAttribute("aria-expanded", "false");
      }
    });
  });

  return { close, isOpen };
}
