# Save fixtures — quality-400 I11
# One committed save per supported version. Round-trip in `npm run test:fast`.

| File | Version | Notes |
|---|---|---|
| `v8-earth-seed42.json` | 8 | Pre-unitsHash; loadRunMeta migrates by ignoring missing hashes |
| `v9-earth-seed42.json` | 9 | Current (`unitsHash` / provenance drift warn) |

Regenerate:

```bash
cd vr && node --input-type=module -e "
import { generate, serializeRun, RULESETS } from './world.js';
import { writeFileSync } from 'fs';
const earth = RULESETS.find(r => r.id === 'earth');
generate(42, { ...earth, landscape: 'auto' });
const v9 = serializeRun();
writeFileSync('data/fixtures/saves/v9-earth-seed42.json', JSON.stringify(v9, null, 2)+'\n');
const v8 = { ...v9, version: 8 }; delete v8.unitsHash;
writeFileSync('data/fixtures/saves/v8-earth-seed42.json', JSON.stringify(v8, null, 2)+'\n');
"
```
