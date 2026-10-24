import type { Setting, SettingOption } from 'artplayer/types/setting';

/** Keep ArtPlayer's switch state and callbacks, with a visible, keyboard-accessible button. */
export function settingSwitchButtons(settings: Setting[]): Setting[] {
  return settings.map(setting => {
    const result = { ...setting };
    if (setting.selector) result.selector = settingSwitchButtons(setting.selector);
    if (typeof setting.switch !== 'boolean') return result;
    const mounted = setting.mounted;
    result.mounted = function(panel, option) {
      mounted?.call(this, panel, option);
      if (this.isDestroy) return;
      const item = option as SettingOption;
      const native = item.$switch;
      const descriptor = Object.getOwnPropertyDescriptor(item, 'switch');
      if (!native || !descriptor?.get || !descriptor.set) return;
      if (native.parentElement?.querySelector('[data-crayon-setting-switch]')) return;
      const label = item.$html.textContent || '设置';
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.crayonSettingSwitch = '';
      button.setAttribute('role', 'switch');
      button.setAttribute('aria-label', label);
      button.style.cssText = 'min-width:64px;min-height:30px;padding:3px 9px;border:1px solid;border-radius:15px;color:white;font:12px/1.5 sans-serif;cursor:pointer;flex-shrink:0';
      const render = () => {
        const enabled = !!item.switch;
        button.textContent = enabled ? '已开启' : '已关闭';
        button.setAttribute('aria-checked', String(enabled));
        button.style.background = enabled ? '#167d46' : '#3f454c';
        button.style.borderColor = enabled ? '#47ce81' : '#8a929b';
        item.$tooltip.title = item.$tooltip.textContent || '';
      };
      // Click bubbles to ArtPlayer's existing row handler exactly once. Native
      // button activation also handles Enter and Space without toggling playback.
      button.addEventListener('keydown', event => event.stopPropagation());
      native.hidden = true;
      native.style.display = 'none';
      native.parentElement?.querySelector('[data-crayon-setting-switch]')?.remove();
      native.parentElement?.appendChild(button);
      // Keep descriptions on their own line so a status button is never clipped
      // by long tooltip text on the narrow mobile settings panel.
      const description = !!item.$tooltip.textContent;
      item.$item.style.position = 'relative';
      item.$item.style.height = description ? '52px' : '44px';
      item.$tooltip.style.cssText = 'position:absolute;left:34px;right:78px;bottom:3px;font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis';
      if (description && item.$html.parentElement) item.$html.parentElement.style.marginBottom = '14px';
      Object.defineProperty(item, 'switch', {
        ...descriptor,
        get: descriptor.get,
        set(value: boolean) { descriptor.set!.call(item, value); render(); },
      });
      render();
    };
    return result;
  });
}
