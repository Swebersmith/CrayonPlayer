export function attachSiteTheme() {
  const root = document.documentElement;
  const button = document.querySelector<HTMLButtonElement>('#theme-toggle');
  if (!button) return () => {};
  const apply = (theme: 'dark' | 'light') => {
    root.dataset.theme = theme;
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.setAttribute('aria-label', theme === 'dark' ? '切换白天模式' : '切换黑夜模式');
    button.title = button.getAttribute('aria-label')!;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c0c0c' : '#fafafa');
  };
  const toggle = () => {
    const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    apply(theme);
    try { localStorage.setItem('crayonplayer-theme', theme); } catch { /* Theme remains usable without storage. */ }
  };
  apply(root.dataset.theme === 'light' ? 'light' : 'dark');
  button.addEventListener('click', toggle);
  return () => button.removeEventListener('click', toggle);
}
