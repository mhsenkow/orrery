# Error codes — quality-400 J20 / J21

Stable `ORR-*` codes from `vr/sim/report.js` `ERROR_CODES` and call sites.
When adding a `report(...)` site, add a row here.

| Code | Meaning | Likely cause | What to do |
|---|---|---|---|
| `ORR-UNCAUGHT-001` | Window `error` | Bug or asset failure | Copy Lab → Diagnostics; file with seed / N |
| `ORR-UNCAUGHT-002` | Unhandled promise rejection | Async path threw | Same |
| `ORR-GPGPU-001` | GPGPU init failed | No float FB / shader compile | Planet runs CPU climate; check Lab climate path |
| `ORR-SAVE-001` | Autosave quota | `localStorage` full | Export a save file; free space |
| `ORR-SAVE-002` | Autosave other failure | Private mode / blocked storage | Export a save; leave private mode |
| `ORR-TEST-001` | Harness self-test | — | Internal |
| `ORR-TEST-DIAG` | Diagnostics probe | — | Internal |

**J9:** use `expected(code, detail)` for intentional swallows (autoplay, private mode) so they stay greppable.
