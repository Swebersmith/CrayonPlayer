import type { MediaRelayMode } from './media-client';

export const PLAYBACK_POLICY_CHANGE = 'crayon-playback-policy-change';
const RELAY_KEY = 'crayon-player-server-relay';
const MODE_KEY = 'crayon-player-relay-mode';

export function relayModePreference(fallback: MediaRelayMode = 'full'): MediaRelayMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === 'full' || saved === 'playlist' ? saved : fallback;
  } catch { return fallback; }
}

export function saveRelayModePreference(mode: MediaRelayMode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* Optional storage. */ }
}

export function serverRelayPreference(fallback = true): boolean {
  try {
    const saved = localStorage.getItem(RELAY_KEY);
    return saved === '1' ? true : saved === '0' ? false : fallback;
  } catch { return fallback; }
}

export function saveServerRelayPreference(enabled: boolean) {
  try { localStorage.setItem(RELAY_KEY, enabled ? '1' : '0'); } catch { /* Optional storage. */ }
}
