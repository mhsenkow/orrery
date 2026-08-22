/** Dialog focus helpers — quality-400 M14. */

export const FOCUSABLE_SEL =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Visible focusable controls inside a dialog root. */
export function dialogFocusables(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE_SEL)].filter((el) => {
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
    const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
    if (style && (style.visibility === 'hidden' || style.display === 'none')) return false;
    // offsetParent is null for fixed/positioned-in-hidden ancestors; still allow if in open dialog.
    return true;
  });
}

/**
 * Contain Tab / Shift+Tab inside `root`. Returns true if the event was handled.
 */
export function trapTab(root, e) {
  if (!root || e.key !== 'Tab') return false;
  const list = dialogFocusables(root);
  if (!list.length) {
    e.preventDefault();
    return true;
  }
  const first = list[0];
  const last = list[list.length - 1];
  const active = root.ownerDocument?.activeElement;
  if (!root.contains(active)) {
    e.preventDefault();
    first.focus();
    return true;
  }
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
    return true;
  }
  if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
