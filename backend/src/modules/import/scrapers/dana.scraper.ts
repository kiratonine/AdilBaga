import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawImportedProduct, IngestionResult } from '../types/import.types';

export class DanaScraper {
  private readonly baseUrl = 'https://dana-market.kz';
  private readonly userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  private readonly categoryUrls: { slug: string; path: string }[] = [
    // 1. Dairy
    { slug: 'milk', path: '/catalog/produkty_pitaniya_/molochnye_produkty/moloko/' },
    { slug: 'milk', path: '/catalog/produkty_pitaniya_/molochnye_produkty/smetana/' },
    { slug: 'milk', path: '/catalog/produkty_pitaniya_/molochnye_produkty/tvorog_i_tvorozhnye_izdeliya/' },
    { slug: 'milk', path: '/catalog/produkty_pitaniya_/molochnye_produkty/maslo_i_zhiry/' },

    // 2. Bread
    { slug: 'bread', path: '/catalog/produkty_pitaniya_/khlebobulochnye_izdeliya/khleb_lepyeshki_/' },

    // 3. Eggs
    { slug: 'eggs', path: '/catalog/produkty_pitaniya_/molochnye_produkty/yaytsa/' },

    // 4. Sugar & Salt
    { slug: 'sugar', path: '/catalog/produkty_pitaniya_/bakaleya/sakhar_sol/' },
    { slug: 'sugar', path: '/catalog/produkty_pitaniya_/pripravy_spetsii_sousy_zapravki/sol_drozhi_i_rozrykhliteli/' },

    // 5. Oils
    { slug: 'oil', path: '/catalog/produkty_pitaniya_/bakaleya/rasitelnye_masla/' },

    // 6. Groats, Pasta & Flour
    { slug: 'groats', path: '/catalog/produkty_pitaniya_/bakaleya/krupy/' },
    { slug: 'groats', path: '/catalog/produkty_pitaniya_/bakaleya/makaronnye_izdeliya/' },
    { slug: 'groats', path: '/catalog/produkty_pitaniya_/bakaleya/muka_konditerskie_dobavki/' },

    // 7. Vegetables & Fruits
    { slug: 'vegetables', path: '/catalog/produkty_pitaniya_/ovoshchi_frukty_i_yagody/' },

    // 8. Meat & Poultry
    { slug: 'meat', path: '/catalog/produkty_pitaniya_/myaso_i_ptitsa/' },

    // 9. Tea & Grocery
    { slug: 'other', path: '/catalog/produkty_pitaniya_/bakaleya/chay_kofe_kakao/' }
  ];

  public async fetchProducts(): Promise<IngestionResult> {
    const allProducts: RawImportedProduct[] = [];
    const seenIds = new Set<string>();

    for (const cat of this.categoryUrls) {
      const url = `${this.baseUrl}${cat.path}`;
      try {
        console.log(`[DANA] Fetching ${cat.slug} from ${url}...`);
        const response = await axios.get(url, {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9'
          },
          timeout: 20000
        });

        const $ = cheerio.load(response.data);
        const items = $('.catalog_item_wrapp, .catalog-block-view__item');

        items.each((_, el) => {
          const itemEl = $(el);
          const rawId = itemEl.attr('data-id') || itemEl.find('[data-id]').attr('data-id') || itemEl.attr('id')?.replace(/[^0-9]/g, '');
          if (!rawId) return;

          const sourceId = `dana_${rawId}`;
          if (seenIds.has(sourceId)) return;
          seenIds.add(sourceId);

          const titleEl = itemEl.find('.item-title a');
          const name = titleEl.text().trim();
          const relativeUrl = titleEl.attr('href') || '';
          const sourceUrl = relativeUrl ? `${this.baseUrl}${relativeUrl}` : undefined;

          // Price extraction
          const priceText = itemEl.find('.price_value').first().text().replace(/[^0-9]/g, '');
          const price = priceText ? parseInt(priceText, 10) : 0;
          if (!name || price <= 0) return;

          // Old price
          const oldPriceText = itemEl.find('.price_old .price_value').text().replace(/[^0-9]/g, '');
          const oldPrice = oldPriceText ? parseInt(oldPriceText, 10) : null;

          // Image
          let imgUrl = itemEl.find('.image_wrapper_block img, picture img').first().attr('src') || itemEl.find('img').first().attr('data-src') || null;
          if (imgUrl && !imgUrl.startsWith('http')) {
            imgUrl = `${this.baseUrl}${imgUrl}`;
          }

          const category = this.refineCategory(name, cat.slug);

          allProducts.push({
            storeCode: 'DANA',
            sourceProductId: sourceId,
            sourceUrl,
            name,
            category,
            price,
            oldPrice,
            imageUrl: imgUrl,
            rawPayload: {
              rawId,
              name,
              price,
              oldPrice,
              categoryPath: cat.path,
              scrapedAt: new Date().toISOString()
            }
          });
        });

        console.log(`[DANA] Fetched ${cat.slug} (${cat.path}): total Dana items so far = ${allProducts.length}`);
      } catch (err: any) {
        console.error(`[DANA] Failed to fetch category ${cat.slug} (${cat.path}):`, err.message);
      }
    }

    return {
      storeCode: 'DANA',
      totalFetched: allProducts.length,
      products: allProducts,
      capturedAt: new Date().toISOString()
    };
  }

  private refineCategory(name: string, assignedSlug: string): string {
    const lower = name.toLowerCase();
    if ((lower.includes('соль') || lower.includes('тұз')) && !lower.includes('фасол') && !lower.includes('хлебцы')) return 'sugar';
    if (lower.includes('яйц') || lower.includes('жұмыртқ')) return 'eggs';
    if (lower.includes('масло сливочн') || lower.includes('сары май') || lower.includes('крестьянск')) return 'milk';
    if (lower.includes('масло подсолнеч') || lower.includes('масло растительн') || lower.includes('оливков')) return 'oil';
    if (lower.includes('мука') || lower.includes('рожк') || lower.includes('макарон') || lower.includes('гречк') || lower.includes('рис ') || lower.includes('крупа') || lower.includes('хлопья')) return 'groats';
    if (lower.includes('картоф') || lower.includes('морков') || lower.includes('лук ') || lower.includes('капуст') || lower.includes('яблок') || lower.includes('помидор') || lower.includes('огурц')) return 'vegetables';
    if (lower.includes('куриц') || lower.includes('говядин') || lower.includes('окороч') || lower.includes('рыб')) return 'meat';

    return assignedSlug;
  }
}

// Allow direct execution
if (require.main === module) {
  (async () => {
    const scraper = new DanaScraper();
    console.log('[DANA] Starting live import from Dana Market (Aktau)...');
    const result = await scraper.fetchProducts();
    console.log(`[DANA] Finished! Total products fetched: ${result.totalFetched}`);
    
    const byCat: Record<string, number> = {};
    for (const p of result.products) {
      const c = p.category || 'other';
      byCat[c] = (byCat[c] || 0) + 1;
    }
    console.log('[DANA] Breakdown by category:', byCat);
  })();
}
