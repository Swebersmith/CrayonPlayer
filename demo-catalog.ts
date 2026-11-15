export interface CatalogItem {
  id: string;
  title: string;
  year: string;
  sourceName: string;
  sourceId?: string;
  remarks: string;
  type?: string;
  language?: string;
  description?: string;
  poster?: string;
  groupKey?: string;
}
export interface CatalogGroup {
  key: string;
  item: CatalogItem;
  items: CatalogItem[];
}

export function groupCatalogItems(items: CatalogItem[]): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>();
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || typeof item.title !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    const fallback = [item.title.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, ''), item.year || '', item.language || ''].join('|');
    const key = item.groupKey || fallback;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      if (!existing.item.poster && item.poster) existing.item = { ...existing.item, poster: item.poster };
      if (!existing.item.description && item.description) existing.item = { ...existing.item, description: item.description };
    } else groups.set(key, { key, item: { ...item }, items: [item] });
  }
  return [...groups.values()];
}

export function catalogPoster(item: CatalogItem) {
  const poster = document.createElement('span'); poster.className = 'catalog-poster';
  const fallback = document.createElement('span'); fallback.className = 'poster-fallback'; fallback.textContent = item.poster ? '' : '暂无封面';
  poster.append(fallback);
  if (item.poster) {
    try {
      const url = new URL(item.poster);
      if (url.protocol !== 'https:' || url.username || url.password) { fallback.textContent = '暂无封面'; return poster; }
      const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => { image.hidden = true; fallback.hidden = false; fallback.textContent = '暂无封面'; }, { once: true });
      image.addEventListener('load', () => { fallback.hidden = true; }, { once: true });
      image.src = url.href; poster.append(image);
    } catch { fallback.textContent = '暂无封面'; }
  }
  return poster;
}

export function catalogCard(group: CatalogGroup, index: number, onSelect: () => void) {
  const item = group.item;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'catalog-card';
  button.style.setProperty('--card-index', String(Math.min(index, 9)));
  const sources = new Set(group.items.map(item => item.sourceId || item.id.split(':')[0]));
  button.setAttribute('aria-label', [item.title, item.year, sources.size + '个片源'].filter(Boolean).join(' · '));
  const poster = catalogPoster(item);
  const badge = document.createElement('span'); badge.className = 'poster-badge'; badge.textContent = sources.size + ' 个片源'; poster.append(badge);
  if (item.remarks) {
    const remarks = document.createElement('span'); remarks.className = 'poster-remarks'; remarks.textContent = item.remarks; poster.append(remarks);
  }
  const title = document.createElement('span'); title.className = 'catalog-card-title'; title.textContent = item.title; title.title = item.title;
  const meta = document.createElement('span'); meta.className = 'catalog-card-meta'; meta.textContent = [item.year, item.type, item.language].filter(Boolean).join(' · ');
  button.append(poster, title, meta);
  button.addEventListener('click', onSelect);
  return button;
}
