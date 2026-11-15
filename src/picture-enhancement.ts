import type Artplayer from 'artplayer';
import type { Setting } from 'artplayer/types/setting';

const STORAGE_KEY = 'crayon-player-picture-enhancement';
const CHANGE_EVENT = 'crayon-picture-enhancement-change';
const presets = [
  { value: 0, label: '关闭', filter: '' },
  { value: 1, label: '轻度增强', filter: 'brightness(1.01) contrast(1.04) saturate(1.04)' },
  { value: 2, label: '标准增强', filter: 'brightness(1.02) contrast(1.08) saturate(1.08)' },
  { value: 3, label: '鲜明增强', filter: 'brightness(1.03) contrast(1.14) saturate(1.16)' },
];
const presetFor = (value: unknown) => presets.find(preset => preset.value === value) || presets[0];

function preference() {
  try { return presetFor(Number(localStorage.getItem(STORAGE_KEY))); } catch { return presets[0]; }
}

export function pictureEnhancementSetting(): Setting {
  const selected = preference();
  return {
    name: 'crayonPictureEnhancement', html: '画质增强', tooltip: selected.label,
    selector: presets.map(preset => ({
      html: preset.label, value: preset.value, default: selected === preset,
      tooltip: preset.value ? '本机亮度、对比度与色彩优化' : '使用原始画面',
    })),
    onSelect(item) {
      const selected = presetFor(item.value);
      try { localStorage.setItem(STORAGE_KEY, String(selected.value)); } catch { /* Storage is optional. */ }
      this.template.$player.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: selected.value }));
      return selected.label;
    },
  };
}

/** Apply display-only color adjustments to the video, including cross-origin HLS sources. */
export function attachPictureEnhancement(art: Artplayer) {
  const video = art.video;
  const root = art.template.$player;
  const originalFilter = video.style.getPropertyValue('filter');
  const originalPriority = video.style.getPropertyPriority('filter');
  const computedFilter = getComputedStyle(video).filter;
  const baseFilter = computedFilter && computedFilter !== 'none' ? computedFilter : '';
  const originalAttribute = video.getAttribute('data-crayon-picture-enhancement');
  let appliedFilter: string | undefined;
  const restore = () => {
    if (appliedFilter === undefined || video.style.getPropertyValue('filter') !== appliedFilter) return;
    if (originalFilter) video.style.setProperty('filter', originalFilter, originalPriority);
    else video.style.removeProperty('filter');
    appliedFilter = undefined;
  };
  const apply = (value: unknown) => {
    const selected = presetFor(value);
    if (selected.value) {
      video.style.setProperty('filter', [baseFilter, selected.filter].filter(Boolean).join(' '), originalPriority);
      appliedFilter = video.style.getPropertyValue('filter');
    } else restore();
    video.dataset.crayonPictureEnhancement = String(selected.value);
  };
  const change = (event: Event) => apply((event as CustomEvent<number>).detail);
  root.addEventListener(CHANGE_EVENT, change);
  apply(preference().value);
  return () => {
    root.removeEventListener(CHANGE_EVENT, change);
    restore();
    if (originalAttribute === null) video.removeAttribute('data-crayon-picture-enhancement');
    else video.setAttribute('data-crayon-picture-enhancement', originalAttribute);
  };
}
