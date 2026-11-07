(function () {
  window.cosmosFatal = function (title, detail) {
    var f = document.getElementById("fatal");
    if (!f || f.dataset.shown) return;
    f.dataset.shown = "1";
    f.textContent = "";
    var box = document.createElement("div");
    var mark = document.createElement("div");
    mark.className = "intro-mark";
    mark.textContent = "Cosmos";
    var p = document.createElement("p");
    p.textContent = title;
    box.appendChild(mark);
    box.appendChild(p);
    if (detail) {
      var d = document.createElement("p");
      d.className = "dim mono";
      d.textContent = detail;
      box.appendChild(d);
    }
    f.appendChild(box);
    f.hidden = false;
  };
  function early(message) {
    if (!window.cosmosReady) window.cosmosFatal("Cosmos failed to start.", message);
  }
  window.addEventListener("error", function (e) {
    early(e && e.message);
  });
  window.addEventListener("unhandledrejection", function (e) {
    early(e && e.reason && e.reason.message);
  });
  var entry = document.querySelector('script[type="module"]');
  if (entry) {
    entry.addEventListener("error", function () {
      early("A required script could not be loaded. Check your connection and any content blockers.");
    });
  }
  function watchdog() {
    if (window.cosmosReady) return;
    if (document.hidden) {
      setTimeout(watchdog, 5000);
      return;
    }
    early("Startup took too long.");
  }
  setTimeout(watchdog, 30000);
})();
