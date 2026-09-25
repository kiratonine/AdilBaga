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
    const pType = (attrs.productType || 'notype').toLowerCase();
    const cat = attrs.productType ? this.mapProductTypeToCategory(attrs.productType) : category.toLowerCase().trim();
    const brand = (attrs.brand || 'nobrand').toLowerCase().replace(/\s+/g, '');
    const tea = attrs.teaType || 'notea';
    const size = attrs.volumeMl ? `${attrs.volumeMl}ml` : (attrs.weightGrams ? `${attrs.weightGrams}g` : 'nosize');
    const fat = attrs.fatPercent ? `${attrs.fatPercent}pct` : 'nofat';
    const variant = attrs.breadType || 'novariant';

    return `${cat}|${brand}|${pType}|${tea}|${size}|${fat}|${variant}`;
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

    // 3. Strict Product Type Rule: Different product types can NEVER match!
    if (a.attrs.productType && b.attrs.productType && a.attrs.productType !== b.attrs.productType) {
      return { match: false, confidence: 0, method: 'deterministic' };
    }

    // 4. Strict Tea Type check: Green tea and black tea cannot match!
    if (a.attrs.teaType && b.attrs.teaType && a.attrs.teaType !== b.attrs.teaType) {
      return { match: false, confidence: 0, method: 'deterministic' };
    }

    // 5. Strict Package Count check: Different pack sizes cannot match (e.g. 100 bags vs 25 bags)
    if (a.attrs.packageCount && b.attrs.packageCount && a.attrs.packageCount !== b.attrs.packageCount) {
      return { match: false, confidence: 0, method: 'deterministic' };
    }

    // 6. Strict Size Rule: Different volume/weight cannot be the same SKU!
    if (a.attrs.volumeMl && b.attrs.volumeMl && Math.abs(a.attrs.volumeMl - b.attrs.volumeMl) > 20) {
      return { match: false, confidence: 0, method: 'deterministic' };
    }
    if (a.attrs.weightGrams && b.attrs.weightGrams && Math.abs(a.attrs.weightGrams - b.attrs.weightGrams) > 25) {
      return { match: false, confidence: 0, method: 'deterministic' };
    }

    // 7. Strict Fat % Rule: Different fat % cannot be the same SKU!
    if (a.attrs.fatPercent && b.attrs.fatPercent && Math.abs(a.attrs.fatPercent - b.attrs.fatPercent) > 0.1) {
      return { match: false, confidence: 0, method: 'deterministic' };
    }

    // 8. Brand check: If both brands are known and distinct -> no match
    if (a.attrs.brand && b.attrs.brand && a.attrs.brand !== b.attrs.brand) {
      return { match: false, confidence: 0, method: 'deterministic' };
    }

    // 9. Deterministic Fingerprint Match: Must have both known brand and known size!
    if (a.fingerprint === b.fingerprint && !a.fingerprint.includes('nobrand') && !a.fingerprint.includes('nosize')) {
      return { match: true, confidence: 0.98, method: 'deterministic' };
    }

    // 8. Token Similarity Match for Cleaned Names
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
        // A single store cannot offer two distinct products as the same canonical SKU
        const storeAlreadyHasOffer = group.offers.some(o => o.storeCode === cand.raw.storeCode);
        if (storeAlreadyHasOffer) {
          const isBarcodeExact = cand.barcode && group.members.some(m => (m.rawProduct.rawPayload as any)?.barcode === cand.barcode);
          if (!isBarcodeExact) {
            continue;
          }
        }

        const repCandidate = this.prepareCandidate(group.members[0].rawProduct);
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
        const canonCategory = cand.attrs.productType
          ? this.mapProductTypeToCategory(cand.attrs.productType)
          : (cand.raw.category || 'other');

        const newGroup: MatchGroup = {
          id: `canon_${groups.length + 1}`,
          canonicalName: canonTitle,
          brand: cand.attrs.brand || null,
          category: canonCategory,
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

  public mapProductTypeToCategory(pType: string): string {
    switch (pType) {
      case 'milk':
      case 'kefir':
      case 'sour_cream':
      case 'cottage_cheese':
      case 'cheese':
      case 'butter':
        return 'milk';
      case 'bread':
      case 'crispbread':
        return 'bread';
      case 'eggs':
        return 'eggs';
      case 'sugar':
      case 'salt':
        return 'sugar';
      case 'vegetable_oil':
        return 'oil';
      case 'buckwheat':
      case 'rice':
      case 'flour':
      case 'pasta':
      case 'semolina':
      case 'oats':
      case 'millet':
      case 'barley':
      case 'legumes':
        return 'groats';
      case 'potato':
      case 'carrot':
      case 'onion':
      case 'cabbage':
      case 'tomato':
      case 'cucumber':
      case 'apple':
      case 'banana':
        return 'vegetables';
      case 'beef':
      case 'chicken':
      case 'minced_meat':
      case 'meat_legs':
      case 'crab_sticks':
      case 'fish':
        return 'meat';
      default:
        return 'other';
    }
  }
}
