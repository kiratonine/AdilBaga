export type StoreCode = 'DINA' | 'DANA' | 'FIX_PRICE';

export interface RawImportedProduct {
  storeCode: StoreCode;
  sourceProductId: string;
  sourceUrl?: string;
  name: string;
  brand?: string;
  category?: string;
  price: number;
  oldPrice?: number | null;
  imageUrl?: string | null;
  rawPayload?: Record<string, unknown>;
}

export interface IngestionResult {
  storeCode: StoreCode;
  totalFetched: number;
  products: RawImportedProduct[];
  capturedAt: string;
}
