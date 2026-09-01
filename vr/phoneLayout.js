/** Phone bottom-sheet layout — keep PHONE_MQ in sync with vr/styles/phone.css */

export const PHONE_MQ = '(max-width: 900px), ((max-height: 560px) and (max-width: 1100px))';

export function isPhone() {
  return typeof matchMedia === 'function' && matchMedia(PHONE_MQ).matches;
}

export const PHONE_LOCAL_PEEK = 200;

/** User-dragged minimap position (peek mode); null = corner snap. */
let _localFreePos = null;

export function localFreePos() {
  return _localFreePos;
}

export function setLocalFreePos(pos) {
  _localFreePos = pos && Number.isFinite(pos.left) && Number.isFinite(pos.top) ? pos : null;
}

export function clearLocalFreePos() {
  _localFreePos = null;
}

function safeInsets() {
  const root = getComputedStyle(document.documentElement);
  const n = (v) => parseFloat(v) || 0;
  return {
    t: n(root.getPropertyValue('--safe-t')),
    r: n(root.getPropertyValue('--safe-r')),
    b: n(root.getPropertyValue('--safe-b')),
    l: n(root.getPropertyValue('--safe-l')),
  };
}

function clampPanelPos(panel, left, top) {
  const inset = safeInsets();
  const topBar = 52;
  const ribbon = 74;
  const margin = 6;
  const maxL = Math.max(margin, innerWidth - panel.offsetWidth - margin - inset.r);
  const maxT = Math.max(topBar + inset.t, innerHeight - panel.offsetHeight - ribbon - inset.b - margin);
  return {
    left: Math.min(maxL, Math.max(margin + inset.l, left)),
    top: Math.min(maxT, Math.max(topBar + inset.t, top)),
  };
}

/** Drag the minimap bar to reposition on phone (peek / non-full only). */
export function bindPhoneLocalDrag(panel, handle, { onFree, onSnap } = {}) {
  if (!panel || !handle) return;
  let drag = null;

  const canDrag = () => isPhone()
    && panel.classList.contains('phone-peek')
    && !panel.classList.contains('expanded')
    && !panel.classList.contains('parked');

  handle.addEventListener('pointerdown', (e) => {
    if (!canDrag() || e.button !== 0) return;
    if (e.target.closest('button, .seg, input, select, a, #localframetag, .local-map-toggle')) return;
    const rect = panel.getBoundingClientRect();
    drag = {
      id: e.pointerId,
      ox: e.clientX,
      oy: e.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
    };
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  handle.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.ox;
    const dy = e.clientY - drag.oy;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    const pos = clampPanelPos(panel, drag.left + dx, drag.top + dy);
    setLocalFreePos(pos);
    panel.classList.add('phone-free');
    panel.style.left = `${pos.left}px`;
    panel.style.top = `${pos.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    onFree?.(pos);
  });

  const endDrag = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    handle.releasePointerCapture(e.pointerId);
    drag = null;
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  let lastTap = 0;
  handle.addEventListener('click', (e) => {
    if (!canDrag() || e.target.closest('button, .seg, #localframetag, .local-map-toggle')) return;
    const now = performance.now();
    if (now - lastTap < 320) {
      clearLocalFreePos();
      onSnap?.(cycleSnap(panel));
      e.preventDefault();
    }
    lastTap = now;
  });
}

function cycleSnap(panel) {
  const order = ['tr', 'tl', 'bl', 'br'];
  let cur = 'tr';
  for (const c of order) {
    if (panel.classList.contains(`snap-${c}`)) { cur = c; break; }
  }
  if (panel.classList.contains('phone-free')) cur = nearestSnapFromPanel(panel);
  const i = order.indexOf(cur);
  return order[(i + 1) % order.length];
}

function nearestSnapFromPanel(panel) {
  const rect = panel.getBoundingClientRect();
  const cx = rect.left + rect.width * 0.5;
  const cy = rect.top + rect.height * 0.5;
  return (cy < innerHeight * 0.46 ? 't' : 'b') + (cx < innerWidth * 0.5 ? 'l' : 'r');
}

export function syncPhoneUiClass() {
  document.documentElement.classList.toggle('phone-ui', isPhone());
  const stroke = document.getElementById('strokeDetails');
  if (stroke) stroke.open = !isPhone();
}

/** Swipe the sheet handle down to dismiss the phone dock. */
export function bindPhoneDockDrag(bar, { onDismiss } = {}) {
  if (!bar) return;
  const dock = () => document.getElementById('dock');
  let drag = null;

  bar.addEventListener('pointerdown', (e) => {
    if (!isPhone() || e.button !== 0) return;
    drag = { id: e.pointerId, oy: e.clientY, moved: false };
    bar.setPointerCapture(e.pointerId);
  });

  bar.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dy = e.clientY - drag.oy;
    if (!drag.moved && dy < 8) return;
    drag.moved = true;
    const panel = dock();
    if (panel) panel.style.transform = `translateY(${Math.min(dy * 0.55, 96)}px)`;
  });

  const endDrag = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    bar.releasePointerCapture(e.pointerId);
    const panel = dock();
    const dy = e.clientY - drag.oy;
    if (panel) panel.style.transform = '';
    if (drag.moved && dy > 52) onDismiss?.();
    drag = null;
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);
}
