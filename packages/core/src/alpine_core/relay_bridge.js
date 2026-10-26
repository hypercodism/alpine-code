// Runs inside every app screen shown on the board. It reports where the controls that lead to other screens are,
// and turns a click on one into "go there on the board" instead of navigating inside the frame.
(function () {
  if (window.parent === window) return;
  var sent = "";
  function layout() {
    var root = document.querySelector("[data-alpine-screen]");
    var targets = Array.prototype.map.call(document.querySelectorAll("[data-alpine-to]"), function (el) {
      var r = el.getBoundingClientRect();
      return {
        to: el.getAttribute("data-alpine-to"),
        label: (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40),
        x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height),
      };
    }).filter(function (t) { return t.w > 0 && t.h > 0; });
    var promises = Array.prototype.map.call(document.querySelectorAll("[data-alpine-promise]"), function (el) {
      var r = el.getBoundingClientRect();
      return { id: el.getAttribute("data-alpine-promise"), x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    }).filter(function (p) { return p.w > 0 && p.h > 0; });
    // What the screen says, shortened to a number: a situation that shows the same words as the usual day is not done.
    var words = document.body ? document.body.innerText : "";
    var hash = 5381;
    for (var i = 0; i < words.length; i++) hash = ((hash << 5) + hash + words.charCodeAt(i)) | 0;
    var msg = {
      screen: root && root.getAttribute("data-alpine-screen"),
      targets: targets,
      promises: promises,
      fingerprint: (hash >>> 0).toString(36) + ":" + words.length,
      href: location.pathname + location.search,
    };
    var key = JSON.stringify(msg);
    if (key === sent) return;
    sent = key;
    msg.type = "alpine:layout";
    msg.at = Date.now();
    parent.postMessage(msg, "*");
  }
  var timer;
  function soon() { clearTimeout(timer); timer = setTimeout(layout, 16); }
  new MutationObserver(soon).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  addEventListener("load", layout);
  // Said once even when the page never finishes loading (a module that never comes): the map can tell a blank screen.
  setTimeout(layout, 1500);
  addEventListener("resize", soon);
  addEventListener("message", function (e) { if (e.data && e.data.type === "alpine:ping") { sent = ""; layout(); } });
  addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-alpine-to]");
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    parent.postMessage({ type: "alpine:go", to: el.getAttribute("data-alpine-to"), from: (document.querySelector("[data-alpine-screen]") || {}).getAttribute && document.querySelector("[data-alpine-screen]").getAttribute("data-alpine-screen") }, "*");
  }, true);
})();
