/**
 * Platform detection for the webview.
 *
 * Read from the user agent rather than @tauri-apps/plugin-os so this stays a
 * synchronous check with no extra dependency — the plugin's `platform()` is async,
 * which would force every consumer to become a hook or an effect.
 */

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

export const isMac = /Mac|iPhone|iPad/.test(ua);
export const isWindows = /Win/.test(ua);

/** Modifier symbols, so shortcut hints read the way each platform writes them. */
export const MOD_KEY = isMac ? '⌘' : 'Ctrl';
export const SHIFT_KEY = isMac ? '⇧' : 'Shift';
export const ALT_KEY = isMac ? '⌥' : 'Alt';

/**
 * macOS writes chords without separators (⌘⇧P), Windows joins them with `+`
 * (Ctrl+Shift+P).
 */
export function chord(...parts: string[]): string {
  return parts.join(isMac ? '' : '+');
}
