# Cernunnos — voice of the living layer

**Status:** active as a *voice*, not a product name. The product, repo, and URLs stay **Orrery**.

## What it is

**Cernunnos** (standard spelling) is the antlered figure usually read as lord of beasts and wild places. Here it names the floating train-of-thought over the globe — dense, animal, seasonal — not a storefront brand.

## What shipped

In the VR prototype (`View → Guides → Thought`, on by default):

- Soft lines float in space about **what you are looking at** (the map patch / focus cell).
- They keep a short **thread** — herds named earlier, hunts that landed, chronicle echoes — so the next line can remember the last.
- **Dwell** — staying on one square long enough draws a linger line; jumping the map a lot is noticed when you finally stop.
- **Suggestions** — short imperatives under the line when diagnosis or context warrants it.
- **Diagnosis**: if life is painted but nothing walks, a herd was named with no globe cross, fire with no flee, etc., the voice says so in-character. That is as much a debugger as mood.

Ceremony moments (first oxygen, lessons) still use the big `#moment` toast. Dawn/dusk ambient prefers Cernunnos when Thought is on.

### Optional local mind

`View → Guides → Local mind` loads a small on-device instruct model (SmolLM2-360M via WebLLM + WebGPU) and may **rewrite soft/dwell lines** from a structured situation card. Warn/wild lines stay template-literal for diagnosis.

Two ways to get weights:

1. **Runtime:** `npm install` (or `npm run cernunnos:runtime`) vendors WebLLM into `vr/vendor/web-llm.js`.
2. **Prepack weights:** `npm run cernunnos:fetch` → `vr/models/cernunnos/resolve/main/` (HF URL shape for WebLLM; copied into `dist/` on build).
3. **Or download:** first click fetches weights from Hugging Face into IndexedDB (~220 MB once).

Templates always work without the mind. No Ollama, no server.

## Voice rules

- Story first; instrument second.
- Never rename the product to Cernunnos.
- Prefer concrete place + motion (“blood on the square”, “antlers of motion from orbit”) over HUD jargon.
- Warnings stay readable for diagnosis — do not bury “nothing walks” in metaphor alone.

## Not for

- Neopagan cosplay as default UI chrome.
- Replacing Orrery in URLs or README titles.
