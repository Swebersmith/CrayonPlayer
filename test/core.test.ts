it('preserves host playback configuration and installs gestures/casting once', () => {
  jest.resetModules();
  const plugin = jest.fn();
  const pluginFactory = jest.fn(() => plugin);
  const construct = jest.fn(function (options) { this.options = options; });
  jest.doMock('artplayer', () => ({ __esModule: true, default: construct }));
  jest.doMock('../src/plugin', () => ({ crayonPlayerPlugin: pluginFactory }));
  const { createCrayonPlayerCore } = require('../src/core');
  const next = jest.fn();
  const customType = { m3u8: jest.fn() };
  const settings = [{ name: 'blockAds' }, { name: 'skipIntro' }];
  const hostPlugin = jest.fn();
  const enhancements = { casting: { getSource: () => ({ url: 'https://media.example/episode.m3u8', currentTime: 72 }) } };
  createCrayonPlayerCore({
    container: '#player', url: 'https://media.example/episode.m3u8',
    customType, settings, controls: [{ click: next }], plugins: [hostPlugin],
    gesture: true, fastForward: true, pip: true, playsInline:false, fullscreen:true,
    moreVideoAttr:{controls:true,crossOrigin:'anonymous'},
  }, enhancements);
  const options = construct.mock.calls[0][0];
  expect(options.customType).toBe(customType);
  expect(options.settings.slice(4)).toEqual(settings);
  expect(options.settings[2]).toEqual(expect.objectContaining({ name: 'crayonPrefetch' }));
  expect(options.settings[3]).toEqual(expect.objectContaining({ name: 'crayonNetworkSpeed' }));
  expect(options.settings[0]).toEqual(expect.objectContaining({ name: 'crayonVolume' }));
  expect(options.settings[1]).toEqual(expect.objectContaining({ name: 'crayonMiniProgress' }));
  expect(options.controls[0].click).toBe(next);
  expect(options.plugins).toEqual([hostPlugin, plugin]);
  expect(options.gesture).toBe(false);
  expect(options.fastForward).toBe(false);
  expect(options.pip).toBe(true);
  expect(options.playsInline).toBe(true);
  expect(options.fullscreen).toBe(true);
  expect(options.fullscreenWeb).toBe(true);
  expect(options.moreVideoAttr).toMatchObject({controls:false,playsInline:true,crossOrigin:'anonymous'});
  expect(pluginFactory).toHaveBeenCalledTimes(1);
  expect(pluginFactory).toHaveBeenCalledWith(enhancements);
  createCrayonPlayerCore({container:'#other',url:'https://media.example/2.mp4',fullscreen:false,fullscreenWeb:false});
  expect(construct.mock.calls[1][0]).toMatchObject({fullscreen:false,fullscreenWeb:false});
});
