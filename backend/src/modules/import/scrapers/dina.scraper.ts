import axios from 'axios';
import { RawImportedProduct, IngestionResult } from '../types/import.types';

export class DinaScraper {
  private readonly endpoint = 'https://backend.dinamarket.kz/api/v1.1/customer/graph';
  private readonly shopId = '28'; // Гипермаркет 301 «Дина», Актау, 33 мкр
  private readonly userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  public async fetchProducts(catalogPages = 8, limitPerPage = 50): Promise<IngestionResult> {
    const allProducts: RawImportedProduct[] = [];
    const seenIds = new Set<string>();

    const productsQuery = `
      query getProducts($shopId: ID!, $page: Int, $limit: Int) {
        products(shop_id: $shopId, _page: $page, _limit: $limit) {
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

    // 1. Fetch general catalog pages
    for (let page = 1; page <= catalogPages; page++) {
      try {
        const response = await axios.post(
          this.endpoint,
          {
            query: productsQuery,
            variables: {
              shopId: this.shopId,
              page,
              limit: limitPerPage
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
          if (!name || !item.price) continue;

          allProducts.push({
            storeCode: 'DINA',
            sourceProductId: id,
            sourceUrl: item.slug ? `https://dinamarket.kz/product/${item.slug}` : undefined,
            name: name,
            category: this.detectCategory(name),
            price: Math.round(Number(item.price)),
            oldPrice: item.oldPrice ? Math.round(Number(item.oldPrice)) : null,
            imageUrl: null,
            rawPayload: item
          });
        }
      } catch (err: any) {
        console.error(`[DINA] Page ${page} error:`, err.message);
        break;
      }
    }

    // 2. Target searches for key demo categories to guarantee high overlap
    const targetKeywords = [
      { kw: 'молоко', cat: 'milk' },
      { kw: 'foodmaster', cat: 'milk' },
      { kw: 'хлеб', cat: 'bread' },
      { kw: 'батон', cat: 'bread' },
      { kw: 'яйца', cat: 'eggs' },
      { kw: 'масло подсолнечное', cat: 'oil' },
      { kw: 'сахар', cat: 'sugar' },
      { kw: 'nemoloko', cat: 'milk' }
    ];

    const searchQuery = `
      query searchProducts($shop_id: ID!, $searchQuery: SearchQuery!, $limit: Int) {
        searchProducts(shop_id: $shop_id, searchQuery: $searchQuery, _limit: $limit) {
          edges {
            id
            xid
            name
            slug
            price
            oldPrice
            stock {
              amount
            }
          }
        }
      }
    `;

    for (const target of targetKeywords) {
      try {
        const response = await axios.post(
          this.endpoint,
          {
            query: searchQuery,
            variables: {
              shop_id: this.shopId,
              searchQuery: { query: target.kw },
              limit: 30
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

        const edges = response.data?.data?.searchProducts?.edges || [];
        for (const item of edges) {
          const id = String(item.id || item.xid);
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          const name = item.name?.trim() || '';
          if (!name || !item.price) continue;

          allProducts.push({
            storeCode: 'DINA',
            sourceProductId: id,
            sourceUrl: item.slug ? `https://dinamarket.kz/product/${item.slug}` : undefined,
            name: name,
            category: this.detectCategory(name, target.cat),
            price: Math.round(Number(item.price)),
            oldPrice: item.oldPrice ? Math.round(Number(item.oldPrice)) : null,
            imageUrl: null,
            rawPayload: item
          });
        }
      } catch (err: any) {
        // Fallback silently if search endpoint format differs
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
    if (lower.includes('молок') || lower.includes('сливк') || lower.includes('кефир') || lower.includes('творог') || lower.includes('nemoloko')) {
      return 'milk';
    }
    if (lower.includes('хлеб') || lower.includes('батон') || lower.includes('лепешк') || lower.includes('хлебц') || lower.includes('сухар') || lower.includes('сушк')) {
      return 'bread';
    }
    if (lower.includes('яйц') || lower.includes('яйцо')) {
      return 'eggs';
    }
    if (lower.includes('сахар') || lower.includes('рафинад')) {
      return 'sugar';
    }
    if (lower.includes('масло подсолнеч') || lower.includes('масло растительн') || lower.includes('масло оливков')) {
      return 'oil';
    }
    return defaultCat;
  }
}

// Allow direct execution
if (require.main === module) {
  (async () => {
    const scraper = new DinaScraper();
    console.log('[DINA] Starting live import from Dina Market (Aktau shop 28)...');
    const result = await scraper.fetchProducts(6, 50);
    console.log(`[DINA] Finished! Total products fetched: ${result.totalFetched}`);

    const byCat: Record<string, number> = {};
    for (const p of result.products) {
      const c = p.category || 'other';
      byCat[c] = (byCat[c] || 0) + 1;
    }
    console.log('[DINA] Breakdown by category:', byCat);
  })();
}
