/** Earth-observation stills to sit next to the render.
 *  NASA Visible Earth / DSCOVR EPIC imagery is public domain. The gap between
 *  the photograph and the disc is the realism backlog — this is the instrument
 *  that makes that gap visible. */

export const EOREF = [
  {
    id: 'marble-west',
    label: 'Blue Marble 2002',
    credit: 'NASA Visible Earth',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57723/globe_west_2048.jpg',
    note: 'Africa and Arabia. Match with Disc so the sun sits behind the camera.',
    preset: 'disc',
  },
  {
    id: 'marble-east',
    label: 'Blue Marble east',
    credit: 'NASA Visible Earth',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/globe_east_2048.jpg',
    note: 'Pacific disc. Same lighting as west; spin the globe.',
    preset: 'disc',
  },
  {
    id: 'dscovr',
    label: 'DSCOVR EPIC',
    credit: 'NASA EPIC / NOAA',
    url: 'https://epic.gsfc.nasa.gov/archive/natural/2016/07/05/png/epic_1b_20160705004554.png',
    note: 'Full dayside from L1. The prototype default is a three-quarter studio light; Disc is this geometry.',
    preset: 'disc',
  },
];

/** Camera rungs: pale-blue-dot → holdable marble → ISS. Distances are
 *  planet-radii from the surface (camDist is from the centre). */
export const SCALE_PRESETS = [
  { id: 'dot', label: 'Dot', camDist: 16, sunAng: 0.6, hint: 'Pale blue dot' },
  { id: 'disc', label: 'Disc', camDist: 3.45, sunAng: Math.PI / 2, hint: 'DSCOVR full dayside' },
  { id: 'hold', label: 'Hold', camDist: 2.45, sunAng: 0.6, hint: 'A globe in the hand' },
  { id: 'iss', label: 'ISS', camDist: 1.08, sunAng: 0.85, hint: '~400 km' },
];

export const CAM_DIST_MIN = 1.03;
export const CAM_DIST_MAX = 22;
export const XR_SCALE_MIN = 0.035;
export const XR_SCALE_MAX = 1.35;

export function scaleRung(camDist, noSurface = false) {
  if (noSurface && camDist < 1.03) {
    if (camDist <= 0.86) return 'Probe';
    return 'Descent';
  }
  if (camDist >= 10) return 'Dot';
  if (camDist >= 3.15) return 'Disc';
  if (camDist >= 1.35) return 'Hold';
  if (camDist >= 1.12) return 'ISS';
  return 'Surface';
}

export function applyScalePreset(S, id) {
  const p = SCALE_PRESETS.find((x) => x.id === id);
  if (!p || !S) return null;
  S.camDist = p.camDist;
  S.sunAng = p.sunAng;
  S.dayWatch = false;
  if (id === 'disc' || id === 'dot') S.orbitGuides = false;
  return p;
}

export function eorefById(id) {
  return EOREF.find((x) => x.id === id) || EOREF[0];
}
