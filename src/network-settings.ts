import type Artplayer from 'artplayer';
import type { Setting } from 'artplayer/types/setting';
import type { PrefetchLanes } from './vod-network';

const LANES_KEY = 'crayon-player-prefetch-lanes';
const SPEED_KEY = 'crayon-player-network-speed';
const SPEED_EVENT = 'crayon-network-speed-change';

export interface NetworkOptions {
  /** Total main-video download lanes, including the normal playback request. Default: 2. */
  prefetchLanes?: PrefetchLanes;
  /** Show the HLS segment download rate. Default: false. */
  showNetworkSpeed?: boolean;
}

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ }
}
export function prefetchPreference(fallback: PrefetchLanes = 2): PrefetchLanes {
  const value = Number(read(LANES_KEY));
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : fallback;
}
const speedPreference = (fallback = false) => {
  const saved = read(SPEED_KEY);
  return saved === null ? fallback : saved === '1';
};
const laneLabel = (lanes: number) => lanes === 1 ? '关闭' : `${lanes} 路`;

export function networkSettings(options: NetworkOptions = {}): Setting[] {
  const lanes = prefetchPreference(options.prefetchLanes);
  return [{
    name: 'crayonPrefetch', html: '多路预取', tooltip: laneLabel(lanes),
    selector: [1, 2, 3, 4].map(value => ({
      html: value === 1 ? '关闭（顺序加载）' : `${value} 路${value === 2 ? '（推荐）' : ''}`,
      value, default: lanes === value,
    })),
    onSelect(item) {
      const selected = item.value as PrefetchLanes;
      write(LANES_KEY, String(selected));
      this.video.vodNetwork?.setLanes(selected);
      if (!this.video.vodNetwork) this.notice.show = '多路预取适用于 HLS 点播，下次载入时生效';
      return laneLabel(selected);
    },
  }, {
    name: 'crayonNetworkSpeed', html: '下载速率显示', tooltip: 'HLS 分片实时下载速率',
    switch: speedPreference(options.showNetworkSpeed),
    onSwitch(item) {
      const enabled = !item.switch;
      write(SPEED_KEY, enabled ? '1' : '0');
      this.template.$player.dispatchEvent(new CustomEvent(SPEED_EVENT, { detail: enabled }));
      return enabled;
    },
  }];
}

export function formatNetworkSpeed(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B/s';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB/s`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${Math.round(bytes)} B/s`;
}

export function attachNetworkSpeed(art: Artplayer, fallback = false) {
  const hud = document.createElement('div');
  hud.dataset.crayonNetworkSpeed = '';
  hud.setAttribute('aria-label', '下载速率');
  hud.style.cssText = 'position:relative;align-self:flex-end;max-width:100%;height:18px;flex-shrink:0;margin:0 0 2px;padding:0 2px;color:white;font:11px/18px sans-serif;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none';
  const root = art.template.$player;
  // A dedicated row below the progress bar, above the control buttons. Keeping
  // it in the bottom panel follows its layout in mobile and both fullscreen modes.
  const progress = art.template.$progress;
  if (progress?.parentElement) progress.insertAdjacentElement('afterend', hud);
  else root.appendChild(hud);
  let timer: ReturnType<typeof setInterval> | undefined;
  let network = art.video.vodNetwork;
  let bytes = network?.bytes || 0;
  let time = performance.now();
  const update = () => {
    const current = art.video.vodNetwork;
    const now = performance.now();
    const total = current?.bytes || 0;
    const rate = current === network && now > time ? Math.max(0, total - bytes) * 1000 / (now - time) : 0;
    hud.textContent = current ? `↓ ${formatNetworkSpeed(rate)}` : '下载速率：当前播放方式不支持';
    network = current; bytes = total; time = now;
  };
  const toggle = (enabled: boolean) => {
    clearInterval(timer); timer = undefined;
    hud.hidden = !enabled;
    network = art.video.vodNetwork; bytes = network?.bytes || 0; time = performance.now();
    if (enabled) { update(); timer = setInterval(update, 1000); }
  };
  const change = (event: Event) => toggle((event as CustomEvent<boolean>).detail);
  root.addEventListener(SPEED_EVENT, change);
  toggle(speedPreference(fallback));
  return () => { clearInterval(timer); root.removeEventListener(SPEED_EVENT, change); hud.remove(); };
}
