// This module runs inside the player origin. Nothing is sent to the parent frame.
const STORAGE_KEY = 'crayon-embed-session-v1';
interface Session { token: string; expiresAt: number }
const validSession = (value: Session | undefined): value is Session => !!value &&
  typeof value.token === 'string' && /^[A-Za-z0-9+/=]+\.[0-9a-f]{64}$/.test(value.token) && value.token.length <= 512 &&
  Number.isFinite(value.expiresAt) && value.expiresAt > Date.now() && value.expiresAt <= Date.now() + 12 * 3600000 + 60000;

export function setupEmbeddedLogin(onReady: () => void, onLocked: () => void) {
  const gate = document.querySelector<HTMLElement>('#viewer-gate')!;
  const form = document.querySelector<HTMLFormElement>('#viewer-password-form')!;
  const password = document.querySelector<HTMLInputElement>('#viewer-password')!;
  const message = document.querySelector<HTMLElement>('#viewer-auth-message')!;
  const submit = form.querySelector<HTMLButtonElement>('button')!;
  const main = document.querySelector<HTMLElement>('#player-page')!;
  let session: Session | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let disposed = false;
  let ready = false;
  let storageBlocked = false;
  const forget = () => {
    session = undefined;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Optional storage. */ }
    clearTimeout(expiryTimer);
  };
  const lock = (text = '登录已过期，请重新输入访问密码。') => {
    forget();
    ready = false;
    onLocked();
    main.hidden = true;
    gate.hidden = false;
    message.textContent = text;
  };
  const request = async (action: string, body?: URLSearchParams, token?: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      return await fetch('/auth/embed/' + action, {
        method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body?.toString(), signal: controller.signal,
      });
    } finally { clearTimeout(timer); }
  };
  const activate = (expiresAt: number) => {
    if (disposed || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 12 * 3600000 + 60000) throw new Error('Invalid session');
    gate.hidden = true;
    main.hidden = false;
    message.textContent = '';
    ready = true;
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => lock(), Math.max(1, expiresAt - Date.now()));
    onReady();
  };
  const restore = async () => {
    gate.hidden = false;
    main.hidden = true;
    submit.disabled = true;
    message.textContent = '正在检查登录状态…';
    try {
      // Prefer HttpOnly cookies. Probe without a bearer before reading JS storage.
      let response = await request('session');
      if (!response.ok && response.status !== 401) throw new Error('Session unavailable');
      if (response.status === 401) {
        let saved: Session | undefined;
        try { saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch { /* Storage may be blocked. */ }
        if (validSession(saved)) {
          session = saved;
          response = await request('session', undefined, saved.token);
        }
      } else forget();
      if (disposed) return;
      if (!response.ok && response.status !== 401) throw new Error('Session unavailable');
      if (response.ok) activate((await response.json()).expiresAt);
      else lock('输入访问密码后即可播放，连续换集无需重复输入。');
    } catch {
      if (!disposed) message.textContent = '无法检查登录状态，请稍后重试或输入访问密码。';
    } finally { if (!disposed) submit.disabled = false; }
  };
  const login = async (event: Event) => {
    event.preventDefault();
    if (busy || disposed) return;
    busy = true;
    submit.disabled = true;
    message.textContent = '正在验证…';
    // Clear the input immediately; only the in-flight HTTPS request contains it.
    const body = new URLSearchParams({ password: password.value });
    password.value = '';
    try {
      const response = await request('login', body);
      if (disposed) return;
      if (!response.ok) {
        message.textContent = response.status === 401 ? '密码不正确，请重试。' : '暂时无法登录，请稍后重试。';
        password.focus();
        return;
      }
      const received: Session = await response.json();
      if (!validSession(received)) throw new Error('Invalid session');
      forget();
      storageBlocked = false;
      // Older WebViews may block all cookies; retain only a short-lived token in
      // this player's sessionStorage so iframe navigation to another episode works.
      let cookieWorks = false;
      try { cookieWorks = (await request('session')).ok; } catch { /* Use bearer fallback. */ }
      if (disposed) return;
      if (!cookieWorks) {
        session = received;
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(received)); }
        catch { storageBlocked = true; }
      }
      activate(received.expiresAt);
    } catch {
      if (!disposed) message.textContent = '登录服务暂时不可用，请检查网络后重试。';
    } finally {
      body.delete('password');
      busy = false;
      if (!disposed) submit.disabled = false;
    }
  };
  form.addEventListener('submit', login);
  void restore();
  return {
    accessToken: () => session?.token,
    onUnauthorized: () => lock(),
    isReady: () => ready,
    storageBlocked: () => storageBlocked,
    logout: async () => {
      // Do not claim logout succeeded while an HttpOnly cookie may remain.
      try {
        const response = await request('logout', new URLSearchParams());
        if (!response.ok) throw new Error('Logout failed');
        lock('已退出登录。');
      } catch { window.alert('退出登录失败，请检查网络后重试。'); }
    },
    dispose: () => { disposed = true; clearTimeout(expiryTimer); form.removeEventListener('submit', login); },
  };
}
