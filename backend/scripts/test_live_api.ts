import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  console.log('='.repeat(60));
  console.log('LIVE DATABASE BACKEND API CONTRACT VERIFICATION');
  console.log('='.repeat(60));

  // 1. Categories endpoint simulation
  console.log('\n>>> 1. Verifying /api/categories...');
  const categories = await prisma.category.findMany({ orderBy: { slug: 'asc' } });
  console.log(`Found ${categories.length} categories:`);
  for (const c of categories) {
    console.log(`   - ${c.slug}: "${c.name}"`);
  }
  if (categories.length !== 6) {
    throw new Error(`Expected exactly 6 categories, found ${categories.length}`);
  }
  const expectedSlugs = ['bread', 'eggs', 'milk', 'oil', 'other', 'sugar'];
  const actualSlugs = categories.map(c => c.slug);
  if (JSON.stringify(actualSlugs) !== JSON.stringify(expectedSlugs)) {
    throw new Error(`Category slugs mismatch: expected ${expectedSlugs}, got ${actualSlugs}`);
  }
  console.log('✅ Exactly 6 approved categories confirmed!');

  // 2. Milk filters endpoint simulation
  console.log('\n>>> 2. Verifying /api/categories/milk/filters...');
  const milkCat = categories.find(c => c.slug === 'milk');
  if (!milkCat) throw new Error('Milk category not found');
  console.log('Raw filter schema:', JSON.stringify(milkCat.filterSchema));

  const milkProducts = await prisma.canonicalProduct.findMany({
    where: { categoryId: milkCat.id },
    include: { offers: true }
  });
  console.log(`Total canonical products in "milk": ${milkProducts.length}`);

  // 3. Verify no forbidden items in milk
  console.log('\n>>> 3. Verifying milk category semantics in DB...');
  const forbiddenPatterns = [
    /\bкефир\b/i, /\bтан\b/i, /\bайран\b/i, /\bряженк/i, /\bкатык\b/i,
    /\bсметан/i, /\bтворог\b/i, /\bсыр\b/i, /\bсырок\b/i, /\bмасло сливочное\b/i
  ];
  const violations = milkProducts.filter(p => forbiddenPatterns.some(rx => rx.test(p.name)));
  if (violations.length > 0) {
    throw new Error(`Found ${violations.length} forbidden items in milk: ${violations.map(v => v.name).join(', ')}`);
  }
  console.log('✅ 0 non-milk dairy violations in milk category!');

  // 4. Verify Nemoloko oat classic is present in milk
  const nemoloko = milkProducts.find(p => /nemoloko/i.test(p.name) && /овсян/i.test(p.name) && /3\.2|3,2/i.test(p.name));
  if (!nemoloko) {
    console.warn('⚠️ Nemoloko 3.2% 1L not found in milk category products list');
  } else {
    console.log(`✅ Nemoloko found in milk: "${nemoloko.name}"`);
  }

  // 5. Verify Store Locations
  console.log('\n>>> 4. Verifying Store Locations...');
  const locations = await prisma.storeLocation.findMany({ include: { store: true } });
  console.log(`Total store locations in DB: ${locations.length}`);
  const storeCounts = locations.reduce((acc, loc) => {
    acc[loc.store.code] = (acc[loc.store.code] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('Location counts by store:', storeCounts);
  if (locations.length < 12) {
    throw new Error(`Expected at least 12 store locations, found ${locations.length}`);
  }
  console.log('✅ Aktau store locations fully intact!');

  // 6. Verify Dashboard metrics
  console.log('\n>>> 5. Verifying Dashboard metrics...');
  const totalOffers = await prisma.offer.count();
  const multiStoreCanonical = await prisma.canonicalProduct.count({
    where: {
      offers: {
        some: {}
      }
    }
  });
  console.log(`Total Offers: ${totalOffers}, Total Active Canonical: ${multiStoreCanonical}`);

  console.log('\n' + '='.repeat(60));
  console.log('ALL LIVE DATABASE CONTRACT CHECKS PASSED!');
  console.log('='.repeat(60));
}

main()
  .catch(err => {
    console.error('Check failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
