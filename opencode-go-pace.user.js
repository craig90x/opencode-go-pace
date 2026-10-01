// ==UserScript==
// @name         OpenCode Go 套餐用量节奏标尺
// @namespace    openclaw.local.opencode-go-pace
// @version      1.1.2
// @description  Overlay a "time left" tick + slack delta on the Go plan "usage left" bars, and convert remaining spend into output tokens (DeepSeek V4.1 Flash typical mix)
// @author       craig90x
// @license      MIT
// @homepageURL  https://github.com/craig90x/opencode-go-pace
// @supportURL   https://github.com/craig90x/opencode-go-pace/issues
// @downloadURL  https://raw.githubusercontent.com/craig90x/opencode-go-pace/main/opencode-go-pace.user.js
// @updateURL    https://raw.githubusercontent.com/craig90x/opencode-go-pace/main/opencode-go-pace.user.js
// @match        https://opencode.ai/console/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
  if (window.__ocPaceInstalled) return;
  window.__ocPaceInstalled = true;

  // LC prefix is stable; the trailing word changed ("... used" → "... left"/"... remaining")
  var LABEL = { fiveHour: "rolling usage", week: "weekly usage", month: "monthly usage" };
  var FALLBACK_DUR = { fiveHour: 5 * 3600e3, week: 7 * 86400e3, month: 30 * 86400e3 };
  var pct = function (x) { return (x * 100).toFixed(1) + "%"; };

  // —— Spend ⇄ output-token conversion (DeepSeek V4.1 Flash on Go) ——
  // Unit prices, $ per 1M tokens: input / output / cache-read
  var P_IN = 0.15, P_OUT = 0.60, P_CACHE = 0.003;
  // Typical mix (measured 2026-09-23: input 4.47% / output 0.55% / cache 94.8%):
  // input and cache-read tokens per 1 output token
  var K_IN = 8.03, K_CACHE = 170.5;
  var COST_PER_M_OUT = P_OUT + K_IN * P_IN + K_CACHE * P_CACHE; // ≈ $2.316 per 1M output tok
  var MC_PER_TOK = 100 * COST_PER_M_OUT;                        // ≈ 231.6 microCents per output tok

  function fmtTok(t) {
    if (!isFinite(t) || t < 0) return "–";
    if (t >= 1e6) return (t / 1e6).toFixed(2) + "M";
    if (t >= 1e3) return (t / 1e3).toFixed(t >= 1e5 ? 0 : 1) + "k";
    return String(Math.round(t));
  }
  function fmtUsd(mc) { return "$" + (mc / 1e8).toFixed(2); }

  function orgId() {
    var m = location.pathname.match(/\/console\/(org_[A-Za-z0-9]+)/);
    return m ? m[1] : null;
  }

  // Match a progressbar to a meter key by its stable label prefix.
  function keyFor(ariaLabel) {
    var s = (ariaLabel || "").trim().toLowerCase();
    if (!s) return null;
    for (var k in LABEL) if (s.indexOf(LABEL[k]) === 0) return k;
    return null;
  }
  // The bar now counts down ("99% left"); older builds counted up ("4% used").
  function isRemaining(ariaLabel, ariaValueText) {
    var s = ((ariaLabel || "") + " " + (ariaValueText || "")).toLowerCase();
    return s.indexOf("left") >= 0 || s.indexOf("remaining") >= 0;
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
        var ariaLabel = bar.getAttribute("aria-label") || "";
        var key = keyFor(ariaLabel);
        if (!key) return;

        var row = bar.closest("div.flex.flex-1") || bar.parentElement;
        var meter = data && data.access && data.access.meters ? data.access.meters[key] : null;
        var usedFrac, remFrac, timeFrac;

        if (meter && meter.limitMicroCents) {
          usedFrac = Number(meter.usedMicroCents) / Number(meter.limitMicroCents);
          var s = Date.parse(meter.startsAt || data.access.startsAt);
          var e = Date.parse(meter.resetsAt);
          timeFrac = (now - s) / (e - s);
        } else {
          // Fallback: aria-valuenow + reset tooltip + known window length
          var vn = Number(bar.getAttribute("aria-valuenow")) / 100;
          usedFrac = isRemaining(ariaLabel, bar.getAttribute("aria-valuetext")) ? 1 - vn : vn;
          var span = row && row.querySelector("span[title]");
          var e2 = span
            ? Date.parse(span.getAttribute("title").replace(/\//g, "-").replace(" ", "T"))
            : NaN;
          timeFrac = isNaN(e2) ? NaN : 1 - (e2 - now) / FALLBACK_DUR[key];
        }
        if (!isFinite(usedFrac) || !isFinite(timeFrac)) return;

        usedFrac = Math.max(0, Math.min(1, usedFrac));
        timeFrac = Math.max(0, Math.min(1, timeFrac));
        remFrac = 1 - usedFrac;                 // bar fills with what's LEFT
        var timeLeftFrac = 1 - timeFrac;        // where "time left" sits on the same axis
        var slack = remFrac - timeLeftFrac;     // >0 = quota left ahead of the clock (good)
        var fast = slack < -0.02;               // burning faster than the clock
        var safe = slack > 0.02;                // running with slack
        var color = fast ? "#dc2626" : safe ? "#059669" : "#6b7280";

        // 1) "time left" tick on the bar
        var tick = bar.querySelector(".oc-pace-tick");
        if (!tick) {
          bar.style.position = "relative";
          bar.style.overflow = "visible";
          tick = document.createElement("div");
          tick.className = "oc-pace-tick";
          bar.appendChild(tick);
          tick.style.cssText = [
            "position:absolute", "top:-3px", "bottom:-3px", "width:2px", "margin-left:-1px",
            "border-radius:1px", "box-shadow:0 0 0 1px rgba(255,255,255,.7)", "z-index:2",
            "pointer-events:none",
          ].join(";");
        }
        var sig = timeLeftFrac.toFixed(4) + (fast ? "f" : "");
        if (tick.getAttribute("data-sig") !== sig) {
          tick.setAttribute("data-sig", sig);
          tick.style.background = fast ? "#dc2626" : "#111827";
          tick.style.left = "calc((100% - 4px) * " + timeLeftFrac + ")";
        }
        tick.title = "time left " + pct(timeLeftFrac) + " · remaining " + pct(remFrac);

        // 2) slack chip in the header
        var chip = row && row.querySelector(".oc-pace-chip");
        if (row && !chip) {
          chip = document.createElement("span");
          chip.className = "oc-pace-chip";
          var holder = row.querySelector("p");
          if (!holder) return;
          holder.appendChild(chip);
        }
        if (chip) {
          var pts = Math.round(slack * 100);
          var txt = (pts > 0 ? "+" : "") + pts + "pt";
          if (chip.textContent !== txt) {
            chip.textContent = txt;
            chip.title = "remaining " + pct(remFrac) + " / time left " + pct(timeLeftFrac) +
              " (" + (fast ? "burning fast" : safe ? "slack" : "on track") + ")";
            chip.style.cssText = "margin-left:2px;padding:0 4px;border-radius:3px;font-size:0.6875rem;" +
              "font-variant-numeric:tabular-nums;line-height:1.35;color:" + color +
              ";background:" + color + "1a;box-shadow:inset 0 0 0 0.5px " + color + "33";
          }
        }

        // 3) spend ⇄ output tokens
        if (row && meter && meter.limitMicroCents) {
          var tokEl = row.querySelector(".oc-pace-tok");
          if (!tokEl) {
            tokEl = document.createElement("div");
            tokEl.className = "oc-pace-tok";
            tokEl.style.cssText =
              "margin-top:4px;font-size:0.6875rem;line-height:1.4;color:#6b7280;" +
              "font-variant-numeric:tabular-nums";
            row.appendChild(tokEl);
          }
          var lim = Number(meter.limitMicroCents);
          var used = Number(meter.usedMicroCents);
          var rem = Math.max(0, lim - used);
          var txt2 = fmtUsd(rem) + " ≈ " + fmtTok(rem / MC_PER_TOK) + " tok left" +
            " · " + fmtUsd(used) + " ≈ " + fmtTok(used / MC_PER_TOK) + " tok used";
          if (tokEl.textContent !== txt2) {
            tokEl.textContent = txt2;
            tokEl.title = "V4.1 Flash typical mix: per output tok " + K_IN + " input / " +
              K_CACHE + " cache-read; prices " + P_IN + "/" + P_OUT + "/" + P_CACHE + " $ per M";
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
