/** Export instrument SVGs / charts as PNG.
 *  Next backlog item 175. */

export function svgToPng(svgEl, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!svgEl) return reject(new Error('no svg'));
    const xml = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = opts.scale || 2;
      const cv = document.createElement('canvas');
      cv.width = (opts.width || svgEl.clientWidth || 320) * scale;
      cv.height = (opts.height || svgEl.clientHeight || 160) * scale;
      const g = cv.getContext('2d');
      g.fillStyle = opts.bg || '#0c1018';
      g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(img, 0, 0, cv.width, cv.height);
      if (opts.caption) {
        g.fillStyle = '#9ab';
        g.font = `${12 * scale}px sans-serif`;
        g.fillText(opts.caption, 8 * scale, cv.height - 8 * scale);
      }
      URL.revokeObjectURL(url);
      cv.toBlob((b) => resolve(b), 'image/png');
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function downloadInstrumentPng(svgEl, filename, caption) {
  const blob = await svgToPng(svgEl, { caption, scale: 2 });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'orrery-instrument.png';
  a.click();
}
