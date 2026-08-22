# Cernunnos local mind (prepack)

Optional on-device weights for **View → Guides → Local mind**.

```bash
# from repo root
npm install                  # also runs cernunnos:runtime → vr/vendor/web-llm.js
npm run cernunnos:fetch      # optional weights prepack
# or without shader-f16:
npm run cernunnos:fetch -- --fp32
```

WebLLM requests `${model}/resolve/main/<file>` (Hugging Face shape), so weights live at:

```
vr/models/cernunnos/resolve/main/
  mlc-chat-config.json
  tensor-cache.json      ← required by WebLLM (also ndarray-cache.json)
  params_shard_*.bin
  tokenizer…
vr/models/cernunnos/resolve/cache.json  ← alias some runtimes probe
```

`npm run build` copies `vr/models/` into `dist/vr/models/` when present.

Without a prepack, the same button downloads from Hugging Face into browser storage once.

Weights are gitignored (large). Keep this README.
