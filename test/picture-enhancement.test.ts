import { attachPictureEnhancement, pictureEnhancementSetting } from '../src/picture-enhancement';
import { createCrayonPlayerCore } from '../src/core';
import { fakeArt } from './helpers';

const select = (art: ReturnType<typeof fakeArt>, value: number) => {
  const setting = pictureEnhancementSetting();
  return setting.onSelect!.call(art, { value } as any, document.createElement('div'), new Event('click'));
};
beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); document.body.innerHTML = ''; jest.restoreAllMocks(); });

it('defaults off, applies each preset without accumulating filters, and persists the choice', () => {
  const art = fakeArt();
  const dispose = attachPictureEnhancement(art);
  try {
    expect(art.video.style.filter).toBe('');
    expect(pictureEnhancementSetting().selector![0].default).toBe(true);
    expect(select(art, 1)).toBe('轻度增强');
    expect(art.video.style.filter).toBe('brightness(1.01) contrast(1.04) saturate(1.04)');
    select(art, 3);
    expect(art.video.style.filter).toBe('brightness(1.03) contrast(1.14) saturate(1.16)');
    expect(pictureEnhancementSetting().selector![3].default).toBe(true);
    select(art, 0);
    expect(art.video.style.filter).toBe('');
  } finally { dispose(); }
});

it('preserves host filters and restores their priority when disabled or destroyed', () => {
  const art = fakeArt();
  art.video.style.setProperty('filter', 'grayscale(0.2)', 'important');
  const dispose = attachPictureEnhancement(art);
  select(art, 2);
  expect(art.video.style.filter).toBe('grayscale(0.2) brightness(1.02) contrast(1.08) saturate(1.08)');
  expect(art.video.style.getPropertyPriority('filter')).toBe('important');
  select(art, 0);
  expect(art.video.style.filter).toBe('grayscale(0.2)');
  select(art, 1);
  dispose();
  expect(art.video.style.filter).toBe('grayscale(0.2)');
  expect(art.video.style.getPropertyPriority('filter')).toBe('important');
  expect(art.video.hasAttribute('data-crayon-picture-enhancement')).toBe(false);
  select(art, 3);
  expect(art.video.style.filter).toBe('grayscale(0.2)');
});

it('handles invalid preferences and storage failures while keeping the live controls working', () => {
  localStorage.setItem('crayon-player-picture-enhancement', 'NaN');
  expect(pictureEnhancementSetting().selector![0].default).toBe(true);
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Disabled'); });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Disabled'); });
  const art = fakeArt();
  const dispose = attachPictureEnhancement(art);
  try {
    expect(select(art, 2)).toBe('标准增强');
    expect(art.video.dataset.crayonPictureEnhancement).toBe('2');
    select(art, 999);
    expect(art.video.style.filter).toBe('');
  } finally { dispose(); }
});

it('restores saved enhancement for another instance and preserves playback and decoded dimensions', () => {
  localStorage.setItem('crayon-player-picture-enhancement', '2');
  const art = fakeArt();
  Object.defineProperties(art.video, { videoWidth: { value: 1280 }, videoHeight: { value: 720 } });
  art.video.currentTime = 42;
  const dispose = attachPictureEnhancement(art);
  try {
    art.video.dispatchEvent(new Event('loadstart'));
    expect(art.video.style.filter).toContain('contrast(1.08)');
    expect(art.video.videoWidth).toBe(1280);
    expect(art.video.videoHeight).toBe(720);
    expect(art.video.currentTime).toBe(42);
    expect(art.template.$player.style.filter).toBe('');
    expect(art.video.hasAttribute('crossorigin')).toBe(false);
  } finally { dispose(); }
});

it('keeps later host filter changes when disposing', () => {
  const art = fakeArt();
  const dispose = attachPictureEnhancement(art);
  select(art, 2);
  art.video.style.filter = 'sepia(0.3)';
  dispose();
  expect(art.video.style.filter).toBe('sepia(0.3)');
});

it('applies presets through the real settings menu and restores the original picture', async () => {
  URL.createObjectURL = jest.fn(() => 'blob:test');
  URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const art = createCrayonPlayerCore({ container, url: 'https://media.example/movie.mp4', setting: true }, { casting: false });
  const wait = () => new Promise(resolve => setTimeout(resolve, 0));
  try {
    const setting = art.setting.find('crayonPictureEnhancement');
    setting.$item.click();
    setting.selector![2].$item.click();
    await wait();
    expect(setting.tooltip).toBe('标准增强');
    expect(art.video.style.filter).toContain('contrast(1.08)');
    setting.$item.click();
    setting.selector![0].$item.click();
    await wait();
    expect(setting.tooltip).toBe('关闭');
    expect(art.video.style.filter).toBe('');
  } finally { art.destroy(); container.remove(); }
});
