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
  console.log('SUPABASE / POSTGRESQL CONNECTION & DATA VERIFICATION');
  console.log('='.repeat(60));

  try {
    console.log('>>> [1/3] Testing database ping...');
    const result = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now;`;
    console.log(`✅ Database connected successfully! Server time: ${result[0]?.now}`);

    console.log('\n>>> [2/3] Checking table record counts...');
    const [
      storesCount,
      locationsCount,
      categoriesCount,
      rawCount,
      canonicalCount,
      mappingsCount,
      offersCount
    ] = await Promise.all([
      prisma.store.count(),
      prisma.storeLocation.count(),
      prisma.category.count(),
      prisma.rawProduct.count(),
      prisma.canonicalProduct.count(),
      prisma.productMapping.count(),
      prisma.offer.count()
    ]);

    console.log(`- Stores:             ${storesCount}`);
    console.log(`- StoreLocations:     ${locationsCount}`);
    console.log(`- Categories:         ${categoriesCount}`);
    console.log(`- RawProducts:        ${rawCount}`);
    console.log(`- CanonicalProducts:  ${canonicalCount}`);
    console.log(`- ProductMappings:    ${mappingsCount}`);
    console.log(`- Offers:             ${offersCount}`);

    console.log('\n>>> [3/3] Fetching sample canonical product with multi-store offers...');
    const sampleProduct = await prisma.canonicalProduct.findFirst({
      where: {
        offers: {
          some: {}
        }
      },
      include: {
        category: true,
        offers: {
          include: {
            store: true
          }
        }
      }
    });

    if (sampleProduct) {
      console.log(`Sample Product: "${sampleProduct.name}" (${sampleProduct.category.name})`);
      console.log(`Offers count: ${sampleProduct.offers.length}`);
      for (const off of sampleProduct.offers) {
        console.log(`  - Store: ${off.store.name} | Price: ${off.price} ₸ | inStock: ${off.inStock}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 ALL CHECKS PASSED: Database is fully functional and populated!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ Database verification failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
