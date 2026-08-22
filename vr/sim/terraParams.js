/** Tagged Earth / ruleset physics dials — earth-fidelity A8.
 *  Land/ocean palette functions stay in rulesets.js (@provenance look).
 *  @provenance tagged-module
 */

/* measured: 0.7808 — dry-air N₂ volume mixing ratio */
export const GAS_N2 = 0.7808;
/* measured: 0.2095 — dry-air O₂ volume mixing ratio */
export const GAS_O2 = 0.2095;
/* measured: 0.00042 — ~420 ppm CO₂ early-2020s */
export const GAS_CO2 = 0.00042;
/* measured: 0.0000019 — CH₄ mixing ratio order */
export const GAS_CH4 = 0.0000019;
/* fitted: 0.01 — column H₂O stand-in for greenhouse path */
export const GAS_H2O = 0.01;

/* measured: 23.4° — modern Earth obliquity (deg → rad at use site) */
export const EARTH_OBLIQUITY_DEG = 23.4;
/* measured: 0.0167 — Earth orbital eccentricity */
export const EARTH_ECC = 0.0167;
/* measured: 0.292 — land fraction target (~29.2%) */
export const EARTH_LAND_FRAC = 0.29;
/* measured: 0.32 — Fe–Ni core mass fraction (order) */
export const EARTH_CORE_MASS = 0.32;
/* measured: 0.55 — core radius fraction (order) */
export const EARTH_CORE_RAD = 0.55;

/* fitted: 0.406 — freeze line; 273 K on (T−0.5)*160+288 map */
export const EARTH_FREEZE = 0.406;
/* fitted: 1.04 — solar constant dial for ~288 K mean with live GH */
export const EARTH_SOLAR = 1.04;
/* fitted: 0.028 — relief amplitude for Earth hypsometry */
export const EARTH_RELIEF = 0.028;
/* fitted: 0.05 — aridity sink multiplier (DRY_PER_ARIDITY path) */
export const EARTH_ARIDITY = 0.05;
/* fitted: 0.027 — residual greenhouse bias after local H₂O GH */
export const EARTH_GH_BIAS = 0.027;
/* fitted: 0.00038 — CO₂ floor (ppm floor as mixing ratio) */
export const EARTH_MIN_CO2 = 0.00038;
/* fitted: 0.92 — total water inventory dial */
export const EARTH_TOTAL_WATER = 0.92;
/* fitted: 0.38 — continentFrac seed for landmass */
export const EARTH_CONTINENT = 0.38;
/* invented: 12 — plate count for look / tectonics sketch */
export const EARTH_N_PLATES = 12;
/* fitted: 0.50 — target mean temp field (~288 K) */
export const EARTH_TARGET_TEMP = 0.50;
/* fitted: 0.92 — atmosphere optical strength */
export const EARTH_ATMO_STRENGTH = 0.92;

/* invented: 4.565 — thrive start age Ga (2 Ma BP clock) */
export const THRIVE_START_AGE_GA = 4.565;
