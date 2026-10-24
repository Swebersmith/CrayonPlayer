import { readFileSync } from 'fs';
import { join } from 'path';
import { setupEmbeddedLogin } from '../demo-auth';

const originalFetch = global.fetch;
const key = 'crayon-embed-session-v1';
const token = 'c2Vzc2lvbg==.' + 'a'.repeat(64);
let auth: ReturnType<typeof setupEmbeddedLogin>;
let ready: jest.Mock;
let locked: jest.Mock;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const response = (status: number, body = {}) => ({ ok: status === 200, status, json: async () => body });
const submit = () => {
  (document.querySelector('#viewer-password') as HTMLInputElement).value = 'private-test-password';
  document.querySelector('#viewer-password-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
};
beforeEach(() => {
  document.body.innerHTML = readFileSync(join(__dirname, '../index.html'), 'utf8').split('<body>')[1].split('</body>')[0];
  sessionStorage.clear();
  ready = jest.fn(); locked = jest.fn();
});
afterEach(() => { auth?.dispose(); sessionStorage.clear(); global.fetch = originalFetch; jest.restoreAllMocks(); });

it('prefers HttpOnly cookies and never saves a password or token in JS storage when cookies work', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(response(401))
    .mockResolvedValueOnce(response(200, { token, expiresAt: Date.now() + 3600000 }))
    .mockResolvedValueOnce(response(200, { expiresAt: Date.now() + 3600000 }));
  auth = setupEmbeddedLogin(ready, locked);
  await flush();
  expect(ready).not.toHaveBeenCalled();
  submit();
  expect((document.querySelector('#viewer-password') as HTMLInputElement).value).toBe('');
  await flush();
  expect(ready).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(auth.accessToken()).toBeUndefined();
  expect(document.querySelector('#player-page')!.hasAttribute('hidden')).toBe(false);
  expect(global.fetch).toHaveBeenCalledWith('/auth/embed/login', expect.objectContaining({ method: 'POST', body: 'password=private-test-password' }));
});

it('reuses a limited token across episode navigation when cookies are blocked, without saving the password', async () => {
  const expiresAt = Date.now() + 3600000;
  global.fetch = jest.fn()
    .mockResolvedValueOnce(response(401))
    .mockResolvedValueOnce(response(200, { token, expiresAt }))
    .mockResolvedValueOnce(response(401));
  auth = setupEmbeddedLogin(ready, locked);
  await flush(); submit(); await flush();
  expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ token, expiresAt });
  expect(sessionStorage.getItem(key)).not.toContain('private-test-password');
  auth.dispose(); ready.mockClear();
  global.fetch = jest.fn().mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200, { expiresAt }));
  auth = setupEmbeddedLogin(ready, locked);
  await flush();
  expect(ready).toHaveBeenCalledTimes(1);
  expect(auth.accessToken()).toBe(token);
  expect(global.fetch).toHaveBeenLastCalledWith('/auth/embed/session', expect.objectContaining({ headers: { Authorization: 'Bearer ' + token } }));
  auth.onUnauthorized();
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(auth.isReady()).toBe(false);
});

it('does not erase a reusable token on transient network failure, and rejects expired or invalid saved sessions', async () => {
  sessionStorage.setItem(key, JSON.stringify({ token, expiresAt: Date.now() + 3600000 }));
  global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
  auth = setupEmbeddedLogin(ready, locked);
  await flush();
  expect(sessionStorage.getItem(key)).not.toBeNull();
  expect(ready).not.toHaveBeenCalled();
  auth.dispose();
  sessionStorage.setItem(key, JSON.stringify({ token, expiresAt: Date.now() - 1 }));
  global.fetch = jest.fn().mockResolvedValue(response(401));
  auth = setupEmbeddedLogin(ready, locked); await flush();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem(key)).toBeNull();
});

it('leaves the frame locked after a wrong password and clears fallback storage on explicit logout', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(401));
  auth = setupEmbeddedLogin(ready, locked); await flush(); submit(); await flush();
  expect(ready).not.toHaveBeenCalled();
  expect(document.querySelector('#viewer-auth-message')!.textContent).toContain('密码不正确');
  global.fetch = jest.fn().mockResolvedValue(response(200));
  sessionStorage.setItem(key, JSON.stringify({ token, expiresAt: Date.now() + 3600000 }));
  await auth.logout();
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(document.querySelector('#viewer-auth-message')!.textContent).toContain('已退出');
});
