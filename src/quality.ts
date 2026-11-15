import type Artplayer from 'artplayer';
import type { Setting } from 'artplayer/types/setting';
import Hls, { Level } from 'hls.js';

export const HLS_CHANGE_EVENT = 'crayon-hls-change';
const SETTING_NAME = 'crayonQuality';

export function qualitySetting(): Setting {
  return { name: SETTING_NAME, html: '清晰度', tooltip: '读取片源后显示', selector: [{ html: '自动', value: -1, default: true }] };
}

function levelLabel(level: Level, video: HTMLVideoElement, single: boolean) {
  const height = level.height || (single ? video.videoHeight : 0);
  const size = height ? `${height}p` : '原始画质';
  const codec = level.videoCodec?.split('.')[0] || '';
  const codecs: Record<string, string> = { avc1: 'H.264', avc3: 'H.264', hvc1: 'HEVC', hev1: 'HEVC', dvh1: 'Dolby Vision', dvhe: 'Dolby Vision', av01: 'AV1', vp09: 'VP9' };
  const bitrate = level.bitrate > 0 ? `${(level.bitrate / 1000000).toFixed(1)} Mbps` : '';
  return [size, codec ? codecs[codec] || '其他编码' : '', bitrate].filter(Boolean).join(' · ');
}

export function attachQuality(art: Artplayer) {
  if (art.option.setting === false) return () => {};
  const video = art.video;
  let hls: Hls | undefined;
  let disposed = false;
  const status = () => {
    if (disposed) return;
    const item = art.setting.find(SETTING_NAME);
    if (!item || !hls?.levels.length) return;
    const selected = hls.manualLevel;
    const current = hls.levels[hls.currentLevel];
    const height = current?.height || video.videoHeight;
    if (selected < 0) {
      item.tooltip = height ? `自动 · ${height}p` : '自动';
      return;
    }
    const selectedHeight = hls.levels[selected]?.height || video.videoHeight;
    const label = selectedHeight ? `${selectedHeight}p` : '原始画质';
    item.tooltip = label + (hls.currentLevel === selected ? '' : ' · 切换中');
  };
  const update = () => {
    if (disposed) return;
    const engine = hls;
    const levels = engine?.levels || [];
    const manual = engine?.manualLevel ?? -1;
    const selector: Setting[] = [{ html: '自动', value: -1, default: manual < 0 }];
    levels.forEach((level, index) => selector.push({
      html: levelLabel(level, video, levels.length === 1), value: index, default: manual === index,
    }));
    art.setting.update({
      ...qualitySetting(), selector,
      tooltip: levels.length ? '自动' : '当前片源提供单一画质',
      onSelect(item) {
        if (!engine || video.hls !== engine || engine.levels !== levels) return;
        const index = item.value as number;
        if (!Number.isInteger(index) || index < -1 || index >= levels.length) return;
        engine.nextLevel = index;
        status();
        return art.setting.find(SETTING_NAME)?.tooltip;
      },
    });
    status();
  };
  const detach = () => {
    hls?.off(Hls.Events.MANIFEST_PARSED, update);
    hls?.off(Hls.Events.LEVELS_UPDATED, update);
    hls?.off(Hls.Events.LEVEL_SWITCHED, status);
    hls?.off(Hls.Events.DESTROYING, destroyed);
    hls = undefined;
  };
  const destroyed = () => { detach(); update(); };
  const sync = () => {
    if (disposed || hls === video.hls) return;
    detach();
    hls = video.hls;
    hls?.on(Hls.Events.MANIFEST_PARSED, update);
    hls?.on(Hls.Events.LEVELS_UPDATED, update);
    hls?.on(Hls.Events.LEVEL_SWITCHED, status);
    hls?.on(Hls.Events.DESTROYING, destroyed);
    update();
  };
  video.addEventListener(HLS_CHANGE_EVENT, sync);
  video.addEventListener('loadstart', sync);
  video.addEventListener('loadedmetadata', update);
  video.addEventListener('resize', update);
  update();
  sync();
  return () => {
    disposed = true;
    detach();
    video.removeEventListener(HLS_CHANGE_EVENT, sync);
    video.removeEventListener('loadstart', sync);
    video.removeEventListener('loadedmetadata', update);
    video.removeEventListener('resize', update);
  };
}
