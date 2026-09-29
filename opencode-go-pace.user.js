// ==UserScript==
// @name         OpenCode Go 套餐用量节奏标尺
// @namespace    openclaw.local.opencode-go-pace
// @version      1.0.0
// @description  在 Go 套餐三条 usage 进度条上叠加「时间已过」刻度 + pace 差值，判断用量速度是偏快还是偏慢
// @author       lokercy
// @license      MIT
// @homepageURL  https://github.com/lokercy/opencode-go-pace
// @supportURL   https://github.com/lokercy/opencode-go-pace/issues
// @downloadURL  https://raw.githubusercontent.com/lokercy/opencode-go-pace/main/opencode-go-pace.user.js
// @updateURL    https://raw.githubusercontent.com/lokercy/opencode-go-pace/main/opencode-go-pace.user.js
// @match        https://opencode.ai/console/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
  if (window.__ocPaceInstalled) return;
  window.__ocPaceInstalled = true;

  var LABEL = { fiveHour: "Rolling usage", week: "Weekly usage", month: "Monthly usage" };
  var FALLBACK_DUR = { fiveHour: 5 * 3600e3, week: 7 * 86400e3, month: 30 * 86400e3 };
  var pct = function (x) { return (x * 100).toFixed(1) + "%"; };

  function orgId() {
    var m = location.pathname.match(/\/console\/(org_[A-Za-z0-9]+)/);
    return m ? m[1] : null;
  }

  var cache = { at: 0, data: null };
  function fetchStatus(org) {
    if (Date.now() - cache.at < 60000) return Promise.resolve(cache.data);
    return fetch("/console/api/go/status", {
      headers: { "x-org-id": org },
      credentials: "same-origin",
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) { if (j) cache = { at: Date.now(), data: j }; return cache.data; });
  }

  function apply() {
    var org = orgId();
    if (!org) return;
    fetchStatus(org).then(function (data) {
      var now = Date.now();
      var bars = document.querySelectorAll('[role="progressbar"]');
      Array.prototype.forEach.call(bars, function (bar) {
        var label = (bar.getAttribute("aria-label") || "").replace(/\s*used$/, "");
        var key = null;
        for (var k in LABEL) if (LABEL[k] === label) key = k;
        if (!key) return;

        var row = bar.closest("div.flex.flex-1") || bar.parentElement;
        var meter = data && data.access && data.access.meters ? data.access.meters[key] : null;
        var usedFrac, timeFrac;

        if (meter && meter.limitMicroCents) {
          usedFrac = Number(meter.usedMicroCents) / Number(meter.limitMicroCents);
          var s = Date.parse(meter.startsAt || data.access.startsAt);
          var e = Date.parse(meter.resetsAt);
          timeFrac = (now - s) / (e - s);
        } else {
          // 兜底：用 aria-valuenow + reset 标题 + 已知周期长度
          usedFrac = Number(bar.getAttribute("aria-valuenow")) / 100;
          var span = row && row.querySelector("span[title]");
          var e2 = span
            ? Date.parse(span.getAttribute("title").replace(/\//g, "-").replace(" ", "T"))
            : NaN;
          timeFrac = isNaN(e2) ? NaN : 1 - (e2 - now) / FALLBACK_DUR[key];
        }
        if (!isFinite(usedFrac) || !isFinite(timeFrac)) return;

        timeFrac = Math.max(0, Math.min(1, timeFrac));
        var delta = usedFrac - timeFrac;
        var over = delta > 0.02;
        var under = delta < -0.02;
        var color = over ? "#dc2626" : under ? "#059669" : "#6b7280";

        // 1) 进度条上的「时间已过」刻度
        var tick = bar.querySelector(".oc-pace-tick");
        if (!tick) {
          bar.style.position = "relative";
          tick = document.createElement("div");
          tick.className = "oc-pace-tick";
          bar.appendChild(tick);
          tick.style.cssText = [
            "position:absolute", "top:-3px", "bottom:-3px", "width:2px", "margin-left:-1px",
            "border-radius:1px", "box-shadow:0 0 0 1px rgba(255,255,255,.7)", "z-index:2",
            "pointer-events:none",
          ].join(";");
        }
        var sig = timeFrac.toFixed(4) + (over ? "o" : under ? "u" : "n");
        if (tick.getAttribute("data-sig") !== sig) {
          tick.setAttribute("data-sig", sig);
          tick.style.background = over ? "#dc2626" : "#111827";
          tick.style.left = "calc((100% - 4px) * " + timeFrac + ")";
        }
        tick.title = "时间已过 " + pct(timeFrac) + " · 用量 " + pct(usedFrac);

        // 2) 头部差值标签
        var chip = row && row.querySelector(".oc-pace-chip");
        if (row && !chip) {
          chip = document.createElement("span");
          chip.className = "oc-pace-chip";
          var holder = row.querySelector("p");
          if (!holder) return;
          holder.appendChild(chip);
        }
        if (chip) {
          var pts = Math.round(delta * 100);
          var txt = (pts > 0 ? "+" : "") + pts + "pt";
          if (chip.textContent !== txt) {
            chip.textContent = txt;
            chip.title = "用量 " + pct(usedFrac) + " / 时间 " + pct(timeFrac) +
              "（" + (over ? "用太快" : under ? "用太慢" : "基本同步") + "）";
            chip.style.cssText = "margin-left:2px;padding:0 4px;border-radius:3px;font-size:0.6875rem;" +
              "font-variant-numeric:tabular-nums;line-height:1.35;color:" + color +
              ";background:" + color + "1a;box-shadow:inset 0 0 0 0.5px " + color + "33";
          }
        }
      });
    });
  }

  var timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(apply, 300);
  }

  apply();
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
  });
  setInterval(apply, 30000);
})();
