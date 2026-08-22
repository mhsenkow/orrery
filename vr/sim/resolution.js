/** Runtime resolution — N is selectable via setResolution / Lab N select.
 *  @provenance look
 */

export const N_LADDER = [
  { N: 32, NC: 32 * 32 * 6, note: '~313 km/cell · fast iterate' },
  { N: 48, NC: 48 * 48 * 6, note: '~209 km/cell' },
  { N: 64, NC: 64 * 64 * 6, note: 'legacy default · ~157 km/cell' },
  { N: 96, NC: 96 * 96 * 6, note: 'shipped default · ~104 km/cell' },
  { N: 128, NC: 128 * 128 * 6, note: 'heavy · pair with 2× globe mesh' },
  { N: 192, NC: 192 * 192 * 6, note: 'research · ~52 km/cell' },
  { N: 256, NC: 256 * 256 * 6, note: 'workstation · ~39 km/cell' },
  { N: 384, NC: 384 * 384 * 6, note: 'slow ticks · ~26 km/cell' },
  { N: 512, NC: 512 * 512 * 6, note: 'CPU-heavy · ~20 km/cell' },
  { N: 768, NC: 768 * 768 * 6, note: 'extreme · ~13 km/cell · RAM-cheap' },
];

export function resolutionNote(n = 64) {
  const row = N_LADDER.find((r) => r.N === n) || { N: n, NC: n * n * 6, note: 'custom' };
  return `Cube-sphere face ${row.N}×${row.N} → ${row.NC} cells. ${row.note}.`;
}
