import axios from 'axios';
import { RawImportedProduct, IngestionResult } from '../types/import.types';

export class DinaScraper {
  private readonly endpoint = 'https://backend.dinamarket.kz/api/v1.1/customer/graph';
  private readonly shopId = '28'; // Гипермаркет 301 «Дина», Актау, 33 мкр
  private readonly userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  public async fetchProducts(): Promise<IngestionResult> {
    const allProducts: RawImportedProduct[] = [];
    const seenIds = new Set<string>();

    const productsQuery = `
      query getProducts($shopId: ID!, $categoryId: ID, $page: Int, $limit: Int) {
        products(shop_id: $shopId, category_id: $categoryId, _page: $page, _limit: $limit) {
          edges {
            id
            xid
            name
            slug
            price
            oldPrice
            price_type
            isWeightProduct
            count_multiplier
            stock {
              amount
            }
          }
        }
      }
    `;

    // Target categories by ID on shop 28 (Aktau 33 mkr)
    const categoryConfigs = [
      { id: '1', name: 'Овощи и фрукты', defaultCat: 'vegetables', pages: 2 },
      { id: '3', name: 'Хлеб и выпечка', defaultCat: 'bread', pages: 2 },
      { id: '4', name: 'Мясо и рыба', defaultCat: 'meat', pages: 2 },
      { id: '6', name: 'Молоко, яйца, масло', defaultCat: 'milk', pages: 3 },
      { id: '7', name: 'Макароны, крупы, мука', defaultCat: 'groats', pages: 3 },
      { id: '8', name: 'Масло, соусы и приправы', defaultCat: 'oil', pages: 2 },
      { id: '13', name: 'Чай', defaultCat: 'other', pages: 1 }
    ];

    for (const conf of categoryConfigs) {
      console.log(`[DINA] Fetching category "${conf.name}" (ID ${conf.id})...`);
      for (let page = 1; page <= conf.pages; page++) {
        try {
          const response = await axios.post(
            this.endpoint,
            {
              query: productsQuery,
              variables: {
                shopId: this.shopId,
                categoryId: conf.id,
                page,
                limit: 40
              }
            },
            {
              headers: {
                'User-Agent': this.userAgent,
                'Content-Type': 'application/json'
              },
              timeout: 15000
            }
          );

          const edges = response.data?.data?.products?.edges || [];
          if (edges.length === 0) break;

          for (const item of edges) {
            const id = String(item.id || item.xid);
            if (seenIds.has(id)) continue;
            seenIds.add(id);

            const name = item.name?.trim() || '';
            const rawPrice = Number(item.price);
            if (!name || isNaN(rawPrice) || rawPrice <= 0) continue;

            // Correct price for weight items (price in tenge/gram -> convert to tenge/kg)
            let price = rawPrice;
            let oldPrice = item.oldPrice ? Number(item.oldPrice) : null;

            if (item.price_type === 'weight' || item.isWeightProduct === true || (rawPrice > 0 && rawPrice < 15)) {
              const weightMatchKg = name.match(/(\d+(?:\.\d+)?)\s*(?:кг|kg)/i);
              const weightMatchG = name.match(/(\d+(?:\.\d+)?)\s*(?:г|g|гр)/i);
              let multiplier = 1000;
              if (weightMatchKg) {
                multiplier = parseFloat(weightMatchKg[1]) * 1000;
              } else if (weightMatchG && parseFloat(weightMatchG[1]) > 50) {
                multiplier = parseFloat(weightMatchG[1]);
              }
              price = Math.round(rawPrice * multiplier);
              if (oldPrice && oldPrice < 15) {
                oldPrice = Math.round(oldPrice * multiplier);
              }
            } else {
              price = Math.round(rawPrice);
              if (oldPrice) oldPrice = Math.round(oldPrice);
            }

            allProducts.push({
              storeCode: 'DINA',
              sourceProductId: id,
              sourceUrl: item.slug ? `https://dinamarket.kz/product/${item.slug}` : undefined,
              name,
              category: this.detectCategory(name, conf.defaultCat),
              price,
              oldPrice,
              imageUrl: null,
              rawPayload: item
            });
          }
        } catch (err: any) {
          console.error(`[DINA] Error fetching category ${conf.id} page ${page}:`, err.message);
          break;
        }
      }
    }

    // Also fetch general catalog top pages to catch promo brand items
    for (let page = 1; page <= 3; page++) {
      try {
        const response = await axios.post(
          this.endpoint,
          {
            query: productsQuery,
            variables: {
              shopId: this.shopId,
              page,
              limit: 40
            }
          },
          {
            headers: {
              'User-Agent': this.userAgent,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          }
        );

        const edges = response.data?.data?.products?.edges || [];
        for (const item of edges) {
          const id = String(item.id || item.xid);
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          const name = item.name?.trim() || '';
          const rawPrice = Number(item.price);
          if (!name || isNaN(rawPrice) || rawPrice <= 0) continue;

          let price = rawPrice;
          let oldPrice = item.oldPrice ? Number(item.oldPrice) : null;
          if (item.price_type === 'weight' || item.isWeightProduct === true || (rawPrice > 0 && rawPrice < 15)) {
            const weightMatchKg = name.match(/(\d+(?:\.\d+)?)\s*(?:кг|kg)/i);
            const weightMatchG = name.match(/(\d+(?:\.\d+)?)\s*(?:г|g|гр)/i);
            let multiplier = 1000;
            if (weightMatchKg) {
              multiplier = parseFloat(weightMatchKg[1]) * 1000;
            } else if (weightMatchG && parseFloat(weightMatchG[1]) > 50) {
              multiplier = parseFloat(weightMatchG[1]);
            }
            price = Math.round(rawPrice * multiplier);
            if (oldPrice && oldPrice < 15) oldPrice = Math.round(oldPrice * multiplier);
          } else {
            price = Math.round(rawPrice);
            if (oldPrice) oldPrice = Math.round(oldPrice);
          }

          allProducts.push({
            storeCode: 'DINA',
            sourceProductId: id,
            sourceUrl: item.slug ? `https://dinamarket.kz/product/${item.slug}` : undefined,
            name,
            category: this.detectCategory(name, 'other'),
            price,
            oldPrice,
            imageUrl: null,
            rawPayload: item
          });
        }
      } catch (err: any) {
        break;
      }
    }

    return {
      storeCode: 'DINA',
      totalFetched: allProducts.length,
      products: allProducts,
      capturedAt: new Date().toISOString()
    };
  }

  private detectCategory(name: string, defaultCat = 'other'): string {
    const lower = name.toLowerCase();
    if (lower.includes('яйц') || lower.includes('жұмыртқ')) return 'eggs';
    if (lower.includes('молок') || lower.includes('сливк') || lower.includes('кефир') || lower.includes('творог') || lower.includes('сметан') || lower.includes('масло сливочн') || lower.includes('сыр ') || lower.includes('сыр,') || lower.includes('nemoloko')) return 'milk';
    if (lower.includes('хлеб') || lower.includes('батон') || lower.includes('лепешк') || lower.includes('багет') || lower.includes('булочк') || lower.includes('чиабатта')) return 'bread';
    if (lower.includes('сахар') || lower.includes('рафинад') || ((lower.includes('соль') || lower.includes('тұз')) && !lower.includes('фасол') && !lower.includes('хлебцы'))) return 'sugar';
    if (lower.includes('масло подсолнеч') || lower.includes('масло растительн') || lower.includes('масло оливков')) return 'oil';
    if (lower.includes('круп') || lower.includes('мука') || lower.includes('рис') || lower.includes('гречк') || lower.includes('макарон') || lower.includes('рожк') || lower.includes('овсян') || lower.includes('геркулес') || lower.includes('спагетти') || lower.includes('вермишель') || lower.includes('пшено') || lower.includes('перлов')) return 'groats';
    if (lower.includes('картоф') || lower.includes('морков') || lower.includes('лук ') || lower.includes('капуст') || lower.includes('яблок') || lower.includes('банан') || lower.includes('томат') || lower.includes('помидор') || lower.includes('огурц') || lower.includes('персик') || lower.includes('дыня')) return 'vegetables';
    if (lower.includes('говядин') || lower.includes('куриц') || lower.includes('окороч') || lower.includes('фарш') || lower.includes('рыб') || lower.includes('сельдь') || lower.includes('мясо') || lower.includes('мидии') || lower.includes('кальмар')) return 'meat';

    return defaultCat;
  }
}

// Allow direct execution: npx tsx src/modules/import/scrapers/dina.scraper.ts
if (require.main === module) {
  (async () => {
    const scraper = new DinaScraper();
    console.log('[DINA] Starting live import from Dina Market (Aktau shop 28)...');
    const result = await scraper.fetchProducts();
    console.log(`[DINA] Finished! Total products fetched: ${result.totalFetched}`);
    
    const byCat: Record<string, number> = {};
    for (const p of result.products) {
      const c = p.category || 'other';
      byCat[c] = (byCat[c] || 0) + 1;
    }
    console.log('[DINA] Breakdown by category:', byCat);
  })();
}
