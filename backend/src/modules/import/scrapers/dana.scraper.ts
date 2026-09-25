import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawImportedProduct, IngestionResult } from '../types/import.types';

export class DanaScraper {
  private readonly baseUrl = 'https://dana-market.kz';
  private readonly userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  private readonly categoryUrls: { slug: string; path: string }[] = [
    { slug: 'milk', path: '/catalog/produkty_pitaniya_/molochnye_produkty/moloko/' },
    { slug: 'bread', path: '/catalog/produkty_pitaniya_/khlebobulochnye_izdeliya/khleb_lepyeshki_/' },
    { slug: 'eggs', path: '/catalog/produkty_pitaniya_/molochnye_produkty/yaytsa/' },
    { slug: 'sugar', path: '/catalog/produkty_pitaniya_/bakaleya/sakhar_sol/' },
    { slug: 'oil', path: '/catalog/produkty_pitaniya_/bakaleya/rasitelnye_masla/' }
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

          allProducts.push({
            storeCode: 'DANA',
            sourceProductId: sourceId,
            sourceUrl,
            name,
            category: cat.slug,
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

        console.log(`[DANA] Fetched ${cat.slug}: ${allProducts.filter(p => p.category === cat.slug).length} items`);
      } catch (err: any) {
        console.error(`[DANA] Failed to fetch category ${cat.slug}:`, err.message);
      }
    }

    return {
      storeCode: 'DANA',
      totalFetched: allProducts.length,
      products: allProducts,
      capturedAt: new Date().toISOString()
    };
  }
}

// Allow direct execution
if (require.main === module) {
  (async () => {
    const scraper = new DanaScraper();
    console.log('[DANA] Starting live HTML import from Dana Market Aktau...');
    const result = await scraper.fetchProducts();
    console.log(`[DANA] Total products collected: ${result.totalFetched}`);
    console.log('[DANA] Sample product:', result.products[0]);
  })();
}
