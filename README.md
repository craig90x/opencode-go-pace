# opencode-go-pace

Overlays a **"time elapsed" tick** on the Go plan usage bars in the [opencode.ai](https://opencode.ai) Console — see at a glance whether your usage is running ahead of or behind the clock. It also converts **spend into output tokens**, so the number lines up with the output tokens streaming while a task runs.

```
Rolling usage  4% used  [+13pt]           Resets in 1h 39m
█░░░░░░░░░░░░|░░░░░░░░░░░░░░░░░░░░░░░░░░░
             ↑ time elapsed 13.0%
$11.83 ≈ 5.11M tok left · $0.17 ≈ 72.1k tok used
```

| Element | Meaning |
|---|---|
| Green fill | **Used** quota (usage %) — matches the Console's own forward bar |
| Vertical line | "Time elapsed" progress within the same window |
| `+13pt` | used% − elapsed%; **positive (red) = ahead of schedule**, **negative (green) = behind**, gray = on track |
| `$… ≈ … tok left / used` | Remaining spend, converted to output tokens using the typical token mix |

> **v1.1.3 note (current):** the Console reverted to its forward "% used" bars, so this build restores the v1.1.1 overlay — tick marks **time elapsed**, delta is `used − time`, and a positive `pt` is **bad** (red). This is the intended behavior for the current Console DOM.
>
> **v1.1.2 note (historical):** briefly, the Console showed "% left" bars; that build re-anchored the overlay to `time left` / slack. Kept in history only.

## Spend ⇄ output-token conversion

While a task runs, the UI only shows **output tokens** live, so converting the quota bar into output tokens makes the number directly comparable.

- Unit prices ($/M, DeepSeek V4.1 Flash on Go): input `0.15` / output `0.60` / cache-read `0.003`
- Typical mix (measured from the 2026-09-23 bill: input 4.47% / output 0.55% / cache 94.8%): per 1 output token → `8.03` input + `170.5` cache-read tokens
- Blended cost = `0.60 + 8.03×0.15 + 170.5×0.003 = $2.316 per 1M output tok`
- Inverse: `output tok = microCents ÷ 231.6` (full-quota reference: $12 ≈ 5.18M · $30 ≈ 12.9M · $60 ≈ 25.9M)

All five constants (`P_IN / P_OUT / P_CACHE / K_IN / K_CACHE`) sit at the top of the script — change them if the model or your mix changes.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Edge / Firefox).
2. Install from the **raw** link (Tampermonkey only intercepts raw responses — GitHub's file preview page will not trigger it):

   <https://raw.githubusercontent.com/craig90x/opencode-go-pace/main/opencode-go-pace.user.js>

   → Tampermonkey shows the install page → Install. (Fallback: create a new script and paste the whole file.)
3. Open the **Go** page in the opencode.ai Console — the tick appears automatically.

> ⚠️ Clicking the filename on the repo page only opens GitHub's **file preview** (HTML), which Tampermonkey does not intercept. Use the raw link above. The script's `@updateURL` points at that same raw URL, so future versions update automatically.

The script matches `https://opencode.ai/console/*` and only touches front-end rendering.

## How it works

The Console's Go page already calls a same-origin endpoint:

```
GET /console/api/go/status        # needs the x-org-id header + a signed-in session
```

It returns the exact window and usage for each meter:

```json
{
  "access": {
    "meters": {
      "fiveHour": { "startsAt": "...", "resetsAt": "...", "limitMicroCents": 1200000000, "usedMicroCents": 44462449 },
      "week":     { "startsAt": "...", "resetsAt": "...", "limitMicroCents": 3000000000, "usedMicroCents": 134688769 },
      "month":    { "resetsAt": "...", "limitMicroCents": 6000000000, "usedMicroCents": 134688769 }
    }
  }
}
```

The script reuses that endpoint (same-origin, cookies included, no extra credentials), so the tick is computed from the **real window bounds**, not a hard-coded "5h / 7d / 30d":

```
timeFrac = (now - startsAt) / (resetsAt - startsAt)
```

DOM anchors: three `[role="progressbar"]` elements whose `aria-label`s are `Rolling usage left` / `Weekly usage left` / `Monthly usage left` (the trailing word has been `used` in older builds — the script matches the stable `Rolling`/`Weekly`/`Monthly usage` prefix). `aria-valuenow` is the **remaining** %; the fill child `[data-slot="progress-fill"]` uses `flex: N 1 0%`. When the API is unavailable it falls back to `aria-valuenow` (inverted when the label reads `left`) plus the row header's `span[title]` reset time and a known window length.

## Limitations

- Pure front-end injection; no external requests
- Depends on the two anchors above; an opencode redesign may break it — re-locate against the real DOM if that happens
- Requires an active Console session

## License

MIT
