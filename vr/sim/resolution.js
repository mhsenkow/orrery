/** Runtime resolution — N is selectable via setResolution / Lab N select. */

export const N_LADDER = [
  { N: 32, NC: 32 * 32 * 6, note: '~500 km/cell · fast iterate' },
  { N: 64, NC: 64 * 64 * 6, note: 'shipped default · ~250 km/cell' },
  { N: 96, NC: 96 * 96 * 6, note: 'heavy · GPGPU climate recommended' },
  { N: 128, NC: 128 * 128 * 6, note: 'research only · resident GPGPU' },
];

export function resolutionNote(n = 64) {
  const row = N_LADDER.find((r) => r.N === n) || { N: n, NC: n * n * 6, note: 'custom' };
  return `Cube-sphere face ${row.N}×${row.N} → ${row.NC} cells. ${row.note}.`;
}
