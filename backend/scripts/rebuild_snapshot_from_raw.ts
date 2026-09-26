// Offline rebuild from the reviewed raw snapshot. No scrapers or database writes.
import * as fs from 'fs';
import * as path from 'path';
import { MatcherService } from '../src/modules/matching/matcher.service';
import { RawImportedProduct } from '../src/modules/import/types/import.types';

const snapshotPath = path.resolve(__dirname, '../../data/snapshots/final_dataset.json');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const rawProducts = snapshot.rawProducts as RawImportedProduct[];
const groups = new MatcherService().groupProducts(rawProducts);
const matched = groups.filter(group => new Set(group.offers.map(offer => offer.storeCode)).size >= 2);
const priceSpreads = matched.map(group => {
  const prices = group.offers.map(offer => offer.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  return {
    canonicalId: group.id,
    name: group.canonicalName,
    minPrice,
    maxPrice,
    diffTenge: maxPrice - minPrice,
    diffPercent: minPrice > 0 ? Math.round(((maxPrice - minPrice) / minPrice) * 100) : 0,
    offers: group.offers
  };
}).sort((a, b) => b.diffPercent - a.diffPercent);

snapshot.generatedAt = new Date().toISOString();
snapshot.summary.totalCanonicalProducts = groups.length;
snapshot.summary.matchedAcrossTwoOrMoreStores = matched.length;
snapshot.summary.matchedAcrossAllThreeStores = groups.filter(group => new Set(group.offers.map(offer => offer.storeCode)).size === 3).length;
snapshot.priceSpreads = priceSpreads.slice(0, 10);
snapshot.canonicalProducts = groups;
fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
console.log(JSON.stringify(snapshot.summary));
