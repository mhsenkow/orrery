# Sky model — one ephemeris

Linked from [`model-limits.md`](model-limits.md). Implementation: [`vr/sim/sky.js`](../vr/sim/sky.js).

## What this is

A single analytic ephemeris owns host lights, satellites, spin phase, and the derived
geometry every consumer reads (`W.sky`, `W._sunDir`, `W._moonDir`, `W.season`, `W.spinPhase`).

No N-body integrator. Keplerian elements plus slow secular drift only. Phase is a pure
function of `ageYr` — deterministic by construction.

## Two frames

| Frame | Meaning |
|---|---|
| **Sky frame** | Inertial directions of lights and satellites; obliquity and orbit normal fixed here |
| **Planet-fixed** | Surface cells rotate with `spinPhase`; hour angle = spinPhase − longitude |

The planet turns; lights do not orbit the mesh for physics. The renderer may still use
`S.sunAng` as an idle camera courtesy when paused.

## Two clocks

| Face | Season / moon | Calendar / climate |
|---|---|---|
| **Now** | Instantaneous on the presentation clock (`skyFrame`) | Age held; climate integrates at ~day scale — watch one year slowly |
| **Years** | Held snapshot (`seasonHold`) unless scrubbed | Age jumps by the rate dial; season hold = annual-mean honesty |

## Limits

- Equilibrium tides only — no resonant basin dynamics or shelf phase lag
- Analytic eclipses — angular-separation test, not full shadow mapping per cell
- Secular obliquity / precession — fitted bands, not Laskar-grade chaos
- At most four drawn lights / four drawn satellites (extras summarised)

## Calibration spine (Earth)

| Quantity | Value | Tag |
|---|---|---|
| Obliquity ε | 23.44° | measured |
| Insolation S | 1361 W/m² | measured |
| Sidereal day | 23h 56m 04s | measured |
| Year | 365.256 d | measured |
| Lunar inclination | 5.15° | measured |
| Lunar recession | 3.8 cm/yr | measured |
