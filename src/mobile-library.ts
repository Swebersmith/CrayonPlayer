import type Artplayer from 'artplayer';

/** Keep the actual player root, including iframe playback, around a mobile sheet. */
export function attachMobileLibrary(art: Artplayer) {
  const root = art.template.$player;
  const viewport = window.visualViewport;
  const variables = ['--crayon-mobile-top', '--crayon-mobile-left', '--crayon-mobile-width', '--crayon-mobile-height'];
  const previous = variables.map(name => [root.style.getPropertyValue(name), root.style.getPropertyPriority(name)]);
  const previousAttribute = root.dataset.crayonLibraryMobile;
  let opened = false, active = false;
  const sync = () => {
    const touch = navigator.maxTouchPoints > 0 || typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (!opened || !active && !(touch && (window.innerWidth <= 760 || window.innerHeight <= 500))) return;
    active = true; root.dataset.crayonLibraryMobile = 'true';
    const values = [viewport?.offsetTop || 0, viewport?.offsetLeft || 0, viewport?.width || window.innerWidth, viewport?.height || window.innerHeight];
    variables.forEach((name, index) => root.style.setProperty(name, `${values[index]}px`));
  };
  const close = () => {
    opened = false;
    if (!active) return;
    active = false;
    if (previousAttribute === undefined) delete root.dataset.crayonLibraryMobile;
    else root.dataset.crayonLibraryMobile = previousAttribute;
    variables.forEach((name, index) => {
      if (previous[index][0]) root.style.setProperty(name, previous[index][0], previous[index][1]);
      else root.style.removeProperty(name);
    });
    art.emit('resize');
  };
  window.addEventListener('resize', sync);
  viewport?.addEventListener('resize', sync);
  viewport?.addEventListener('scroll', sync);
  return {
    open() { opened = true; sync(); }, close, active: () => active,
    destroy() { close(); window.removeEventListener('resize', sync); viewport?.removeEventListener('resize', sync); viewport?.removeEventListener('scroll', sync); },
  };
}
