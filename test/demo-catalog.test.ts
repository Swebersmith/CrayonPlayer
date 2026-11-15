import { catalogCard, catalogPoster, groupCatalogItems, CatalogItem } from '../demo-catalog';

const item = (id: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, title: '测试影片', year: '2026', sourceName: id.split(':')[0], remarks: '更新至12集', ...extra });

it('aggregates the same catalog identity and fills missing cover metadata', () => {
  const groups = groupCatalogItems([
    item('a:1', { groupKey: 'title|2026|mandarin' }),
    item('b:2', { groupKey: 'title|2026|mandarin', poster: 'https://cdn.example/cover.jpg' }),
    item('b:2', { groupKey: 'title|2026|mandarin' }),
    item('c:3', { groupKey: 'title|2026|japanese' }),
    item('a:4', { groupKey: 'title|2025|mandarin', year: '2025' }),
  ]);
  expect(groups).toHaveLength(3);
  expect(groups[0].items).toHaveLength(2);
  expect(groups[0].item.poster).toBe('https://cdn.example/cover.jpg');
  const card = catalogCard(groups[0], 0, jest.fn());
  expect(card.querySelector('.poster-badge')!.textContent).toBe('2 个片源');
  expect(card.querySelector('img')!.src).toBe('https://cdn.example/cover.jpg');
});

it('handles legacy search results and keeps different years separate', () => {
  expect(groupCatalogItems([item('a:1'), item('b:2'), item('c:3', { year: '2025' })])).toHaveLength(2);
});

it('uses literal titles and a readable fallback for unsafe or unavailable cover images', () => {
  const poster = catalogPoster(item('a:1', { poster: 'javascript:alert(1)' }));
  expect(poster.querySelector('img')).toBeNull();
  const valid = catalogPoster(item('a:1', { poster: 'https://cdn.example/cover.jpg' }));
  const image = valid.querySelector('img')!;
  image.dispatchEvent(new Event('error'));
  expect(image.hidden).toBe(true);
  expect(valid.querySelector<HTMLElement>('.poster-fallback')!.hidden).toBe(false);
  const groups = groupCatalogItems([item('a:1', { title: '<img src=x onerror=alert(1)>' })]);
  const card = catalogCard(groups[0], 0, jest.fn());
  expect(card.querySelector('.catalog-card-title')!.textContent).toBe('<img src=x onerror=alert(1)>');
  expect(card.querySelector('img')).toBeNull();
});
