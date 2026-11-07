// Applies the saved dark theme before the page paints. Kept as a file (not an
// inline script) so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var stored = localStorage.getItem("trapple_theme") || localStorage.getItem("travora_theme");
    if (stored === "dark") document.documentElement.classList.add("dark");
  } catch (e) {
    /* storage blocked: keep the light theme */
  }
})();
