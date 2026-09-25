import { RawImportedProduct } from '../import/types/import.types';
import { NormalizerService, NormalizedAttributes } from '../normalization/normalizer.service';

export interface MatchCandidate {
  raw: RawImportedProduct;
  attrs: NormalizedAttributes;
  fingerprint: string;
  barcode?: string | null;
}

export interface MatchGroup {
  id: string;
  canonicalName: string;
  brand?: string | null;
  category: string;
  imageUrl?: string | null;
  attributes: Record<string, unknown>;
  members: {
    rawProduct: RawImportedProduct;
    matchMethod: 'barcode' | 'deterministic' | 'ai' | 'manual';
    matchConfidence: number;
    reviewStatus: 'approved' | 'pending' | 'rejected';
  }[];
  minPrice: number;
  offers: {
    storeCode: string;
    price: number;
    oldPrice?: number | null;
    inStock: boolean;
  }[];
}

export class MatcherService {
  private readonly normalizer: NormalizerService;

  constructor() {
    this.normalizer = new NormalizerService();
  }

  public prepareCandidate(raw: RawImportedProduct): MatchCandidate {
    const attrs = this.normalizer.normalize(raw.name, raw.brand);
    const barcode = (raw.rawPayload as any)?.barcode || null;
    const fingerprint = this.buildFingerprint(raw.category || 'other', attrs);

    return {
      raw,
      attrs,
      fingerprint,
      barcode
    };
  }

  public buildFingerprint(category: string, attrs: NormalizedAttributes): string {
    const cat = category.toLowerCase().trim();
    const brand = (attrs.brand || 'nobrand').toLowerCase().replace(/\s+/g, '');
    const size = attrs.volumeMl ? `${attrs.volumeMl}ml` : (attrs.weightGrams ? `${attrs.weightGrams}g` : 'nosize');
    const fat = attrs.fatPercent ? `${attrs.fatPercent}pct` : 'nofat';
    const variant = attrs.breadType || 'novariant';

    return `${cat}|${brand}|${size}|${fat}|${variant}`;
  }

  public canMatch(a: MatchCandidate, b: MatchCandidate): { match: boolean; confidence: number; method: 'barcode' | 'deterministic' | 'ai' } {
    // 1. Strict Category check
    if (a.raw.category && b.raw.category && a.raw.category !== 'other' && b.raw.category !== 'other') {
      if (a.raw.category !== b.raw.category) {
        return { match: false, confidence: 0, method: 'deterministic' };
      }
    }

    // 2. Exact Barcode Match
    if (a.barcode && b.barcode && a.barcode === b.barcode) {
      return { match: true, confidence: 1.0, method: 'barcode' };
    }

    // 3. Strict Size Rule: Different volume/weight cannot be the same SKU!
    if (a.attrs.volumeMl && b.attrs.volumeMl && Math.abs(a.attrs.volumeMl - b.attrs.volumeMl) > 20) {
      return { match: false, confidence: 0, method: 'deterministic' };
    }
    if (a.attrs.weightGrams && b.attrs.weightGrams && Math.abs(a.attrs.weightGrams - b.attrs.weightGrams) > 25) {
      return { match: false, confidence: 0, method: 'deterministic' };
    }

    // 4. Strict Fat % Rule: Different fat % cannot be the same SKU!
    if (a.attrs.fatPercent && b.attrs.fatPercent && Math.abs(a.attrs.fatPercent - b.attrs.fatPercent) > 0.1) {
      return { match: false, confidence: 0, method: 'deterministic' };
    }

    // 5. Brand check: If both brands are known and distinct -> no match
    if (a.attrs.brand && b.attrs.brand && a.attrs.brand !== b.attrs.brand) {
      return { match: false, confidence: 0, method: 'deterministic' };
    }

    // 6. Deterministic Fingerprint Match
    if (a.fingerprint === b.fingerprint && !a.fingerprint.includes('nobrand|nosize')) {
      return { match: true, confidence: 0.98, method: 'deterministic' };
    }

    // 7. Token Similarity Match for Cleaned Names
    const similarity = this.calculateTokenSimilarity(a.attrs.cleanedName, b.attrs.cleanedName);

    // When same brand and same size are confirmed, similarity >= 0.65 indicates match
    const sameBrand = a.attrs.brand && b.attrs.brand && a.attrs.brand === b.attrs.brand;
    const sameSize = (a.attrs.volumeMl && b.attrs.volumeMl && a.attrs.volumeMl === b.attrs.volumeMl) ||
                     (a.attrs.weightGrams && b.attrs.weightGrams && a.attrs.weightGrams === b.attrs.weightGrams);

    if (sameBrand && sameSize && similarity >= 0.65) {
      return { match: true, confidence: Math.max(0.95, similarity), method: 'deterministic' };
    }

    if (similarity >= 0.80 && (sameBrand || !a.attrs.brand || !b.attrs.brand)) {
      return { match: true, confidence: similarity, method: 'deterministic' };
    }

    return { match: false, confidence: similarity, method: 'deterministic' };
  }

  public groupProducts(rawProducts: RawImportedProduct[]): MatchGroup[] {
    const candidates = rawProducts.map(p => this.prepareCandidate(p));
    const groups: MatchGroup[] = [];

    for (const cand of candidates) {
      let matchedGroup: MatchGroup | null = null;
      let highestConfidence = 0;
      let bestMethod: 'barcode' | 'deterministic' | 'ai' = 'deterministic';

      for (const group of groups) {
        const representative = group.members[0];
        if (!representative) continue;
        const repCandidate = this.prepareCandidate(representative.rawProduct);
        const { match, confidence, method } = this.canMatch(cand, repCandidate);

        if (match && confidence > highestConfidence && confidence >= 0.80) {
          matchedGroup = group;
          highestConfidence = confidence;
          bestMethod = method;
        }
      }

      if (matchedGroup) {
        matchedGroup.members.push({
          rawProduct: cand.raw,
          matchMethod: bestMethod,
          matchConfidence: highestConfidence,
          reviewStatus: highestConfidence >= 0.90 ? 'approved' : 'pending'
        });

        matchedGroup.offers.push({
          storeCode: cand.raw.storeCode,
          price: cand.raw.price,
          oldPrice: cand.raw.oldPrice,
          inStock: true
        });

        if (cand.raw.price < matchedGroup.minPrice) {
          matchedGroup.minPrice = cand.raw.price;
        }

        if (!matchedGroup.imageUrl && cand.raw.imageUrl) {
          matchedGroup.imageUrl = cand.raw.imageUrl;
        }
      } else {
        const canonTitle = this.normalizer.buildCanonicalTitle(cand.raw.name, cand.attrs.brand, cand.attrs);
        const newGroup: MatchGroup = {
          id: `canon_${groups.length + 1}`,
          canonicalName: canonTitle,
          brand: cand.attrs.brand || null,
          category: cand.raw.category || 'other',
          imageUrl: cand.raw.imageUrl || null,
          attributes: {
            volumeMl: cand.attrs.volumeMl,
            weightGrams: cand.attrs.weightGrams,
            fatPercent: cand.attrs.fatPercent,
            breadType: cand.attrs.breadType,
            sliced: cand.attrs.sliced
          },
          members: [
            {
              rawProduct: cand.raw,
              matchMethod: 'deterministic',
              matchConfidence: 1.0,
              reviewStatus: 'approved'
            }
          ],
          minPrice: cand.raw.price,
          offers: [
            {
              storeCode: cand.raw.storeCode,
              price: cand.raw.price,
              oldPrice: cand.raw.oldPrice,
              inStock: true
            }
          ]
        };
        groups.push(newGroup);
      }
    }

    for (const g of groups) {
      g.offers.sort((a, b) => a.price - b.price);
    }

    return groups;
  }

  private calculateTokenSimilarity(s1: string, s2: string): number {
    const tokens1 = new Set(s1.split(/\s+/).filter(t => t.length > 2));
    const tokens2 = new Set(s2.split(/\s+/).filter(t => t.length > 2));

    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    let intersection = 0;
    for (const t of tokens1) {
      if (tokens2.has(t)) intersection++;
    }

    const jaccard = intersection / new Set([...tokens1, ...tokens2]).size;
    const overlap = intersection / Math.min(tokens1.size, tokens2.size);

    return 0.5 * jaccard + 0.5 * overlap;
  }
}
