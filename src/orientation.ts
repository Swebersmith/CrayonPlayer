import type Artplayer from 'artplayer';

/** Same fullscreen rotation, with optional direction locks allowed to fail. */
export function crayonAutoOrientation(art: Artplayer) {
  const root = art.template.$player;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false, generation = 0, locked = false;
  const webpage = (active: boolean) => {
    clearTimeout(timer);
    if (!active) { root.classList.remove('art-auto-orientation'); Reflect.set(art, 'isRotate', false); return; }
    const touch = navigator.maxTouchPoints > 0 || typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (!touch) return;
    timer = setTimeout(() => {
      if (disposed || !art.fullscreenWeb || !art.video.videoWidth) return;
      const width = window.innerWidth, height = window.innerHeight;
      const rotate = (art.video.videoWidth > art.video.videoHeight) !== (width > height);
      root.classList.toggle('art-auto-orientation', rotate); Reflect.set(art, 'isRotate', rotate);
      root.style.width = rotate ? `${height}px` : '100%'; root.style.height = rotate ? `${width}px` : '100%';
      root.style.transformOrigin = rotate ? '0 0' : '';
      root.style.transform = rotate ? `rotate(90deg) translate(0, -${width}px)` : '';
      art.emit('resize');
    }, 100);
  };
  const native = async (active: boolean) => {
    const current = document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
    if (active && current && current !== root) return;
    const stamp = ++generation;
    const orientation = window.screen?.orientation;
    if (!active) {
      root.classList.remove('art-auto-orientation-fullscreen');
      if (locked) { try { orientation?.unlock?.(); } catch { /* Optional browser capability. */ } locked = false; }
      return;
    }
    if (!orientation?.lock || !art.video.videoWidth) return;
    const target = art.video.videoWidth > art.video.videoHeight ? 'landscape' : 'portrait';
    if (orientation.type?.startsWith(target)) return;
    try {
      await orientation.lock(target);
      if (disposed || stamp !== generation) {
        if (!art.fullscreen) orientation.unlock?.();
        return;
      }
      locked = true; root.classList.add('art-auto-orientation-fullscreen');
    } catch { /* Unsupported and denied locks leave fullscreen usable. */ }
  };
  art.on('fullscreenWeb', webpage); art.on('fullscreen', native);
  const dispose = () => { disposed = true; clearTimeout(timer); void native(false); art.off('fullscreenWeb', webpage); art.off('fullscreen', native); };
  art.on('destroy', dispose);
  return { name: 'autoOrientation', get state() { return root.classList.contains('art-auto-orientation'); } };
}
