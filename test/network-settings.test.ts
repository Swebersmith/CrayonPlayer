import { attachNetworkSpeed, formatNetworkSpeed, networkSettings, prefetchPreference } from '../src/network-settings';
import { fakeArt } from './helpers';

beforeEach(() => { localStorage.clear(); jest.useFakeTimers(); });
afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); jest.useRealTimers(); jest.restoreAllMocks(); });

it('persists lane choices and applies them to the active playback session', () => {
  const art = fakeArt();
  const setLanes = jest.fn();
  art.video.vodNetwork = { setLanes } as any;
  const setting = networkSettings()[0];
  const selected = setting.selector![3];
  expect(setting.onSelect!.call(art, selected as any, document.createElement('div'), new Event('click'))).toBe('4 路');
  expect(setLanes).toHaveBeenCalledWith(4);
  expect(prefetchPreference()).toBe(4);
  expect(networkSettings()[0].selector![3].default).toBe(true);
});

it('uses safe defaults when storage is unavailable or contains an invalid value', () => {
  localStorage.setItem('crayon-player-prefetch-lanes', '200');
  expect(prefetchPreference()).toBe(2);
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Disabled'); });
  expect(prefetchPreference(3)).toBe(3);
  expect(networkSettings()[1].switch).toBe(false);
});

it('measures actual bytes per second, becomes idle, and resets on source changes', () => {
  const art = fakeArt();
  art.video.vodNetwork = { bytes: 0 } as any;
  const dispose = attachNetworkSpeed(art, true);
  const hud = art.template.$player.querySelector<HTMLElement>('[data-crayon-network-speed]')!;
  expect(hud.hidden).toBe(false);
  art.video.vodNetwork!.bytes = 2048;
  jest.advanceTimersByTime(1000);
  expect(hud.textContent).toBe('↓ 2.0 KB/s');
  jest.advanceTimersByTime(1000);
  expect(hud.textContent).toBe('↓ 0 B/s');
  art.video.vodNetwork = { bytes: 100000 } as any;
  jest.advanceTimersByTime(1000);
  expect(hud.textContent).toBe('↓ 0 B/s');
  delete art.video.vodNetwork;
  jest.advanceTimersByTime(1000);
  expect(hud.textContent).toContain('当前播放方式不支持');
  dispose();
  expect(jest.getTimerCount()).toBe(0);
  expect(hud.isConnected).toBe(false);
});

it('toggles the speed overlay live, persists it, and stops the disabled timer', () => {
  const art = fakeArt();
  const dispose = attachNetworkSpeed(art);
  const hud = art.template.$player.querySelector<HTMLElement>('[data-crayon-network-speed]')!;
  expect(hud.hidden).toBe(true);
  const setting = networkSettings()[1];
  expect(setting.onSwitch!.call(art, { switch: false } as any, document.createElement('div'), new Event('click'))).toBe(true);
  expect(hud.hidden).toBe(false);
  expect(networkSettings()[1].switch).toBe(true);
  expect(jest.getTimerCount()).toBe(1);
  setting.onSwitch!.call(art, { switch: true } as any, document.createElement('div'), new Event('click'));
  expect(hud.hidden).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  dispose();
});

it.each([[0, '0 B/s'], [500, '500 B/s'], [1024, '1.0 KB/s'], [1048576, '1.00 MB/s'], [Infinity, '0 B/s']])('formats %s bytes per second as %s', (bytes, label) => {
  expect(formatNetworkSpeed(bytes as number)).toBe(label);
});
