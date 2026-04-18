# Ticket: Portfolio Polish — Deferred Items

**Status:** draft
**Created:** 2026-04-18
**Type:** UX / presentation / shareability

Staged from the post-loop polish brainstorm (see the post-web-worker
checkpoint). The three items picked for the first pass — progress
indicator, before/after slider, and live deploy — are being built
now. Everything below is deferred.

---

## Perceived performance

### Stage breadcrumb during processing
Worker already runs off main thread; surface the current stage as it
progresses. Modify `pipeline.worker.ts` to `postMessage` incremental
events (`{kind: 'stage', stage: 'denoise' | 'quantize' | 'trace' |
'fit', ms}`). Main thread shows a breadcrumb: "Denoising… Quantizing…
Tracing… Fitting…" that ticks through.

### Cancel button mid-run
Worker is shared/singleton. On cancel, `.terminate()` and recreate
lazily. Add a Cancel button that replaces Vectorize while
`isProcessing`. Ensure pending promises reject cleanly.

---

## Visual craft

### Palette strip under the result
Show the k chosen colors as a row of swatches beneath the vectorized
output. Each swatch: hex value + pixel count from the layer. Clicking
a swatch highlights that layer's paths in the SVG (hover=outline,
click=isolate). Connects the math ("k=30") to a visible artifact.

### Animated first-load intro
On initial page load (before user uploads anything), run a baked
demo: raster pixels of a small example (circle? P logo?) visibly
"collapse" into vector paths. Canvas animation, ~2s, then settles
into a CTA. Sets the tool's thesis in the first glance.

---

## Shareability

### URL state
Encode `{imageName, params}` in the URL hash so links reproduce a
view. Hitting a deep link auto-loads the benchmark image and applies
the params. Strip tuned badge when params differ from tuned config.

### Copy as SVG button
Next to Download SVG, a Copy button that writes the current SVG text
to the clipboard. Useful for dropping straight into Figma, CodePen,
etc.

### Branded export
Optional "Add watermark" toggle in export — small "made with portavec
→ portavec.dev" in the corner of the SVG, removable. Signals
provenance for screenshots shared on social.

---

## Site presence

### Header + About + how-it-works modal
Replace the current plain header with:
- Actual nav ("Demo", "How it works", "GitHub")
- About blurb describing what this is and why
- How-it-works modal with the pipeline diagram (denoise →
  quantize → contour → fit → SVG), illustrated

### Responsive layout
Current layout assumes wide viewport. On mobile the gallery + 3-pane
comparison explodes. Needs a stacked single-column flow with a
hamburger for the gallery.

### OG image + social metadata
- Twitter/OG preview card (1200×630) showing an example raster →
  vector transformation.
- `<meta>` tags in `index.html` for title/description/og:image.

### 404 + loading states
- Fallback route for unknown paths.
- Skeleton for the 180-image gallery while it's fetching.
- Error boundary around the pipeline in case the worker dies.
