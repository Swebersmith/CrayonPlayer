export const demoSource = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export function mediaAddress(value: string): string {
  if (!value.trim() || value.length > 8192) throw new Error('请提供有效的 MP4 或 M3U8 视频地址。');
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error('视频地址无效，请提供完整的 HTTP(S) 地址。'); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw new Error('请使用不含用户名和密码的 HTTP(S) 视频地址。');
  return url.href;
}

/** The query contains a media URL; it is never executable code or HTML. */
export function playbackEntry(href: string) {
  const page = new URL(href);
  const parse = /^\/parse\/?$/.test(page.pathname);
  const embedded = page.searchParams.get('embed') === '1' || (parse && page.searchParams.get('embed') !== '0');
  const source = page.searchParams.get('url');
  try {
    if (source === null && parse) throw new Error('缺少视频地址，请使用 /parse?url=编码后的视频地址。');
    return { embedded, url: mediaAddress(source === null ? demoSource : source), error: '' };
  } catch (error) {
    return { embedded, url: '', error: (error as Error).message };
  }
}

export function playbackLink(href: string, source: string, hosted: boolean): string {
  const page = new URL(hosted ? '/parse' : './', href);
  page.searchParams.set('url', mediaAddress(source));
  return page.href;
}
