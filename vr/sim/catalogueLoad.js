/** Lazy catalogue chunk — quality-400 K17.
 *  `catalogue.js` + `catalogue-rules.js` (~3.4k lines) stay off the boot path;
 *  first Worlds open (or any ensure) pulls them once and caches. */

let _promise = null;
let _ready = false;

/** @returns {boolean} true after the first ensureCatalogue() has resolved */
export function catalogueReady() {
  return _ready;
}

/** Load and cache the catalogue modules. Second call reuses the same promise. */
export function ensureCatalogue() {
  if (!_promise) {
    _promise = Promise.all([
      import('../catalogue.js'),
      import('../catalogue-rules.js'),
    ]).then(([cat, rules]) => {
      _ready = true;
      return {
        CATALOGUE: cat.CATALOGUE,
        CATALOGUE_CATS: cat.CATALOGUE_CATS,
        CATALOGUE_KIND: cat.CATALOGUE_KIND,
        rulesetFromCatalogue: rules.rulesetFromCatalogue,
        adjacentCatalogueWorld: rules.adjacentCatalogueWorld,
        CATALOGUE_WORLDS: rules.CATALOGUE_WORLDS,
        validateCatalogueWorlds: rules.validateCatalogueWorlds,
        recordForCatalogueItem: rules.recordForCatalogueItem,
      };
    });
  }
  return _promise;
}
