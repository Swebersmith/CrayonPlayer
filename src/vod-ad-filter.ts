import type {
  HlsConfig,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  PlaylistLoaderContext,
} from 'hls.js';

import { filterVodAdSegments, VodAdFilterResult } from './vod-segment-filter';

/** Change only the representation of an already-signed resolver capability. */
export function resolverMediaUrl(value: string, blockAds: boolean): string {
  try {
    const url = new URL(value);
    if (url.pathname !== '/api/jiexi/resolved-media' || !url.searchParams.has('sig')) return value;
    url.searchParams.set('ads', blockAds ? '1' : '0');
    return url.href;
  } catch { return value; }
}

function backendFilter(content: string): VodAdFilterResult | undefined {
  const line = content.split(/\r?\n/, 8).find(line => line.startsWith('#CRAYON-AD-FILTER:'));
  if (!line || line.length > 2048) return;
  try {
    const data = JSON.parse(line.slice('#CRAYON-AD-FILTER:'.length));
    if (data.version !== 1 || !Number.isFinite(data.originalDuration) || data.originalDuration < 0 ||
      !['filtered', 'no-match', 'unsupported'].includes(data.reason) || !Array.isArray(data.removed) || data.removed.length > 5) return;
    let previous = 0, removed = 0;
    for (const range of data.removed) {
      if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < previous || range.end <= range.start || range.end > data.originalDuration) return;
      previous = range.end;
      removed += range.end - range.start;
    }
    if (removed > data.originalDuration * 0.1) return;
    return { playlist: content, originalDuration: data.originalDuration, removed: data.removed, reason: data.reason };
  } catch { return; }
}

export function filterAdsFromM3U8(m3u8Content: string, url?: string): string {
  return filterVodAdSegments(m3u8Content, url).playlist;
}

export function vodAdLoader(
  BaseLoader: HlsConfig['loader'],
  onFiltered?: (result: VodAdFilterResult) => void,
  blockAds = true
): HlsConfig['loader'] {
  // Main/audio/subtitle playlists need coordinated cuts. Keep all renditions
  // intact when a master uses external tracks rather than desynchronizing them.
  let externalTracks = false;
  return class extends BaseLoader {
    load(
      context: LoaderContext,
      config: LoaderConfiguration,
      callbacks: LoaderCallbacks<LoaderContext>
    ) {
      const type = (context as PlaylistLoaderContext).type;
      context.url = resolverMediaUrl(context.url, blockAds && !externalTracks);
      if (type === 'manifest' || type === 'level') {
        const onSuccess = callbacks.onSuccess;
        callbacks = {
          ...callbacks,
          onSuccess(response, stats, current, networkDetails) {
            if (typeof response.data === 'string') {
              const content = response.data;
              if (type === 'manifest')
                externalTracks = content
                  .split(/\r?\n/)
                  .some(
                    (line) =>
                      line.startsWith('#EXT-X-MEDIA:') &&
                      /TYPE=(?:AUDIO|SUBTITLES)(?:,|$)/.test(line) &&
                      /URI=/.test(line)
                  );
              const result = !blockAds || externalTracks
                ? {
                    playlist: content,
                    originalDuration: 0,
                    removed: [],
                    reason: 'unsupported' as const,
                  }
                : backendFilter(content) || filterVodAdSegments(content, response.url || current.url);
              response.data = result.playlist;
              if (!content.includes('#EXT-X-STREAM-INF:')) onFiltered?.(result);
            }
            return onSuccess(response, stats, current, networkDetails);
          },
        };
      }
      super.load(context, config, callbacks);
    }
  };
}
