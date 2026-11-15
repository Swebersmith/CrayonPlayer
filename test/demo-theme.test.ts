import { attachSiteTheme } from '../demo-theme';

afterEach(() => { document.body.innerHTML = ''; delete document.documentElement.dataset.theme; localStorage.clear(); });

it('toggles black and white themes, persists the choice and labels the next action', () => {
  document.body.innerHTML = '<button id="theme-toggle"></button>';
  document.documentElement.dataset.theme = 'dark';
  const dispose = attachSiteTheme();
  const button = document.querySelector<HTMLButtonElement>('button')!;
  expect(button.getAttribute('aria-label')).toBe('切换白天模式');
  button.click();
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(localStorage.getItem('crayonplayer-theme')).toBe('light');
  expect(button.getAttribute('aria-label')).toBe('切换黑夜模式');
  button.click();
  expect(document.documentElement.dataset.theme).toBe('dark');
  dispose();
  button.click();
  expect(document.documentElement.dataset.theme).toBe('dark');
});
