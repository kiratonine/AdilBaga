import * as fs from 'fs';
import * as path from 'path';
import { RawImportedProduct, IngestionResult } from '../types/import.types';

export class FixPriceLoader {
  private readonly snapshotPath: string;

  constructor(customPath?: string) {
    this.snapshotPath = customPath || path.resolve(__dirname, '../../../../../data/snapshots/fixprice_aktau.json');
  }

  public load(): IngestionResult {
    if (!fs.existsSync(this.snapshotPath)) {
      throw new Error(`Fix Price snapshot file not found at: ${this.snapshotPath}`);
    }

    const rawData = fs.readFileSync(this.snapshotPath, 'utf-8');
    const parsed = JSON.parse(rawData);

    const products: RawImportedProduct[] = (parsed.products || []).map((p: any) => ({
      storeCode: 'FIX_PRICE',
      sourceProductId: String(p.sourceProductId || p.id),
      sourceUrl: p.sourceUrl,
      name: p.name,
      brand: p.brand || undefined,
      category: p.category || 'other',
      price: Number(p.price),
      oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
      imageUrl: p.imageUrl || null,
      rawPayload: p.rawPayload || p
    }));

    return {
      storeCode: 'FIX_PRICE',
      totalFetched: products.length,
      products,
      capturedAt: parsed.capturedAt || new Date().toISOString()
    };
  }
}

// Allow direct execution: npx tsx src/modules/import/scrapers/fixprice.loader.ts
if (require.main === module) {
  const loader = new FixPriceLoader();
  const res = loader.load();
  console.log(`[FIX_PRICE] Loaded ${res.totalFetched} products from snapshot (captured: ${res.capturedAt})`);
  console.log('Sample item:', res.products[0]);
}
