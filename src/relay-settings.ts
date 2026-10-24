export const PLAYBACK_POLICY_CHANGE = 'crayon-playback-policy-change';
const RELAY_KEY = 'crayon-player-server-relay';

export function serverRelayPreference(fallback = true): boolean {
  try {
    const saved = localStorage.getItem(RELAY_KEY);
    return saved === '1' ? true : saved === '0' ? false : fallback;
  } catch { return fallback; }
}

export function saveServerRelayPreference(enabled: boolean) {
  try { localStorage.setItem(RELAY_KEY, enabled ? '1' : '0'); } catch { /* Optional storage. */ }
}
