import { attachPlayerUi, volumeSetting } from '../src/player-ui';
import { fakeArt, touch } from './helpers';

let art: ReturnType<typeof fakeArt>;
let dispose: () => void;
beforeEach(() => { jest.useFakeTimers(); Object.defineProperty(navigator,'maxTouchPoints',{value:1,configurable:true}); sessionStorage.clear(); art = fakeArt(); dispose = attachPlayerUi(art); });
afterEach(() => { dispose(); delete (navigator as any).maxTouchPoints; document.body.innerHTML = ''; jest.useRealTimers(); });

it('closes settings on single-tap hiding and shares the controls inactivity timeout', () => {
  art.setting.show = true;
  art.emit('setting',true);
  art.controls.toggle();
  expect(art.setting.show).toBe(false);
  art.setting.show = true; art.emit('setting',true);
  jest.advanceTimersByTime(3100); art.emit('video:timeupdate');
  expect(art.setting.show).toBe(false);
  expect(art.controls.show).toBe(false);
});
it('keeps settings visible while the user adjusts them or playback is paused', () => {
  art.setting.show = true; art.emit('setting',true);
  jest.advanceTimersByTime(2500); touch(art.template.$player,'touchstart',200);
  jest.advanceTimersByTime(1000); art.emit('video:timeupdate');
  expect(art.setting.show).toBe(true);
  (art as any).paused = true;
  jest.advanceTimersByTime(6000); art.emit('video:timeupdate');
  expect(art.setting.show).toBe(true);
});
it('shows a first-play mobile guide once per session, then dismisses it', () => {
  art.emit('play');
  const guide = document.querySelector<HTMLElement>('[aria-label="触屏手势提示"]')!;
  expect(guide.hidden).toBe(false);
  expect(guide.textContent).toContain('中间双击');
  expect(guide.textContent).not.toContain('亮度');
  jest.advanceTimersByTime(4600); expect(guide.hidden).toBe(true);
  art.emit('play'); expect(guide.hidden).toBe(true);
});
it('provides a real manual volume range in a tappable settings submenu', () => {
  const setting = volumeSetting();
  expect(setting.html).toBe('音量');
  const range = setting.selector![0];
  range.onChange!.call(art,{ range: [35,0,100,1] } as any,document.createElement('div'),new Event('input'));
  expect(art.volume).toBe(.35);
  expect(art.muted).toBe(false);
});
