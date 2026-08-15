# ORRERY

Embodied god-game prototype: hold a planet, shrink, walk in.

## Live

- [Pitch / site](https://mhsenkow.github.io/simearth/site/)
- [VR / WebGL prototype](https://mhsenkow.github.io/simearth/vr/)
- [Improvement backlog](https://mhsenkow.github.io/simearth/site/backlog.html)
- [Worlds backlog — 200 real planets and moons](https://mhsenkow.github.io/simearth/site/worlds.html)

## Local

```bash
python3 -m http.server 8765
# http://localhost:8765/vr/
```

WebXR needs HTTPS or localhost. Docs in `briefs/`.

## Backlogs

Both backlogs are generated — edit the script, never the output.

```bash
node scripts/backlog.mjs   # briefs/backlog.md  + site/backlog.html
node scripts/worlds.mjs    # briefs/worlds-backlog.md + site/worlds.html
```

`worlds.mjs` carries the plan for turning the five invented rulesets into a catalogue
of real planets and moons. Its figures come from the NASA Exoplanet Archive
`pscomppars` table; re-query it with:

```bash
curl -sG https://exoplanetarchive.ipac.caltech.edu/TAP/sync --data-urlencode "format=csv" --data-urlencode "query=select pl_name,pl_rade,pl_bmasse,pl_orbper,pl_orbeccen,pl_insol,pl_eqt,st_teff,st_spectype,sy_dist from pscomppars where pl_name like 'TRAPPIST-1%'"
```
