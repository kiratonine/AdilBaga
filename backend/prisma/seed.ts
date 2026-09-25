import 'dotenv/config';
import { PrismaClient, StoreCode, MatchMethod, ReviewStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});
const SNAPSHOT_PATH = path.resolve(__dirname, '../../data/snapshots/final_dataset.json');

async function seed() {
  console.log('='.repeat(60));
  console.log('ADIL BAĞA — DATABASE SEEDER (AKTAU CONTEXT)');
  console.log('='.repeat(60));

  // 0. Clean existing records for clean idempotent seeding
  console.log('>>> [0/5] Cleaning existing product and offer records...');
  await prisma.offer.deleteMany();
  await prisma.productMapping.deleteMany();
  await prisma.canonicalProduct.deleteMany();
  await prisma.rawProduct.deleteMany();

  // 1. Seed Stores
  console.log('>>> [1/5] Seeding Stores...');
  const storesData = [
    { code: StoreCode.DINA, name: 'Dina Market', logoUrl: 'https://dinamarket.kz/icons/logo.svg' },
    { code: StoreCode.DANA, name: 'Dana Market', logoUrl: 'https://dana-market.kz/include/logo.png' },
    { code: StoreCode.FIX_PRICE, name: 'Fix Price', logoUrl: 'https://fix-price.kz/upload/logo.svg' }
  ];

  const storeMap = new Map<StoreCode, string>();
  for (const s of storesData) {
    const record = await prisma.store.upsert({
      where: { code: s.code },
      update: { name: s.name, logoUrl: s.logoUrl },
      create: s
    });
    storeMap.set(s.code, record.id);
  }

  // 2. Seed Store Locations in Aktau
  console.log('>>> [2/5] Seeding Aktau Store Locations...');
  const locationsData = [
    // Dina Locations in Aktau
    { storeCode: StoreCode.DINA, name: 'Гипермаркет 301 «Дина»', address: 'г. Актау, 33 микрорайон, Акку 33', latitude: 43.683094, longitude: 51.157194 },
    { storeCode: StoreCode.DINA, name: 'Супермаркет 303 «Дина», ТЦ Shum', address: 'г. Актау, 4 микрорайон, 74', latitude: 43.637827, longitude: 51.165376 },
    { storeCode: StoreCode.DINA, name: 'Минимаркет 304 «Дина», ТД Атлант', address: 'г. Актау, 4 микрорайон, 36', latitude: 43.633559, longitude: 51.160610 },
    { storeCode: StoreCode.DINA, name: 'Супермаркет 3201 «Дина», Royal House', address: 'г. Актау, 19 микрорайон, 5', latitude: 43.675328, longitude: 51.155875 },
    { storeCode: StoreCode.DINA, name: 'Минимаркет 3301 «Дина»', address: 'г. Актау, 27 микрорайон, 31/3', latitude: 43.668143, longitude: 51.162442 },

    // Dana Locations in Aktau
    { storeCode: StoreCode.DANA, name: 'Дана Гипермаркет', address: 'г. Актау, 17 микрорайон, 1', latitude: 43.664200, longitude: 51.154100 },
    { storeCode: StoreCode.DANA, name: 'Дана Супермаркет', address: 'г. Актау, 14 микрорайон, 38', latitude: 43.649100, longitude: 51.158200 },
    { storeCode: StoreCode.DANA, name: 'Дана 28 мкр', address: 'г. Актау, 28 микрорайон, 45', latitude: 43.673000, longitude: 51.169000 },
    { storeCode: StoreCode.DANA, name: 'Дана 6 мкр', address: 'г. Актау, 6 микрорайон, 12', latitude: 43.639041, longitude: 51.169180 },
    { storeCode: StoreCode.DANA, name: 'Дана 4 мкр', address: 'г. Актау, 4 микрорайон, 48', latitude: 43.636747, longitude: 51.164392 },

    // Fix Price Locations in Aktau
    { storeCode: StoreCode.FIX_PRICE, name: 'Fix Price ТРК «Актау»', address: 'г. Актау, 16 микрорайон, 6', latitude: 43.655200, longitude: 51.164300 },
    { storeCode: StoreCode.FIX_PRICE, name: 'Fix Price 11А мкр', address: 'г. Актау, 11А микрорайон, 1Б', latitude: 43.652100, longitude: 51.161200 },
    { storeCode: StoreCode.FIX_PRICE, name: 'Fix Price 12 мкр', address: 'г. Актау, 12 микрорайон, 16', latitude: 43.645500, longitude: 51.168500 },
    { storeCode: StoreCode.FIX_PRICE, name: 'Fix Price 19 мкр', address: 'г. Актау, 19 микрорайон, 11', latitude: 43.674100, longitude: 51.153900 },
    { storeCode: StoreCode.FIX_PRICE, name: 'Fix Price 2 мкр', address: 'г. Актау, 2 микрорайон, 12/1', latitude: 43.637982, longitude: 51.172943 }
  ];

  for (const loc of locationsData) {
    const sId = storeMap.get(loc.storeCode);
    if (!sId) continue;
    // Check if location exists
    const exists = await prisma.storeLocation.findFirst({
      where: { storeId: sId, address: loc.address }
    });
    if (!exists) {
      await prisma.storeLocation.create({
        data: {
          storeId: sId,
          name: loc.name,
          address: loc.address,
          latitude: loc.latitude,
          longitude: loc.longitude
        }
      });
    }
  }

  // 3. Seed Categories with Dynamic Filter Schemas
  console.log('>>> [3/5] Seeding Categories & Dynamic Filter Schemas...');
  const categoriesData = [
    {
      slug: 'milk',
      name: 'Молочные продукты',
      filterSchema: {
        filters: [
          { key: 'volumeMl', label: 'Объём', type: 'multi-select', options: [500, 900, 950, 1000] },
          { key: 'fatPercent', label: 'Жирность', type: 'multi-select', options: [1.5, 2.5, 3.2, 6.0, 8.5] },
          { key: 'brand', label: 'Бренд', type: 'multi-select', options: ['FoodMaster', 'Nemoloko', 'Петропавловское', 'Рогачевъ', 'Новый День', 'ЭкоНива', 'Мумуня', 'Деревенское', 'Айс', 'DEP'] }
        ]
      }
    },
    {
      slug: 'bread',
      name: 'Хлеб и выпечка',
      filterSchema: {
        filters: [
          { key: 'breadType', label: 'Тип', type: 'multi-select', options: ['white', 'rye', 'flatbread', 'baton', 'crispbread'] },
          { key: 'weightGrams', label: 'Вес', type: 'multi-select', options: [100, 300, 400, 450, 500, 600] },
          { key: 'sliced', label: 'Нарезка', type: 'boolean' }
        ]
      }
    },
    {
      slug: 'eggs',
      name: 'Яйца',
      filterSchema: {
        filters: [
          { key: 'packageCount', label: 'Количество', type: 'multi-select', options: [10, 15, 20, 30] }
        ]
      }
    },
    {
      slug: 'sugar',
      name: 'Сахар и соль',
      filterSchema: {
        filters: [
          { key: 'weightGrams', label: 'Вес', type: 'multi-select', options: [500, 700, 800, 1000, 2000, 3000, 5000] }
        ]
      }
    },
    {
      slug: 'oil',
      name: 'Растительные масла',
      filterSchema: {
        filters: [
          { key: 'volumeMl', label: 'Объём', type: 'multi-select', options: [500, 800, 900, 1000, 1800, 2000, 5000] },
          { key: 'brand', label: 'Бренд', type: 'multi-select', options: ['Золотая Семечка', 'Слобода', 'Шедевр', 'Затея', 'Маслозавод №1', 'Белес', 'Царь', 'Oleina'] }
        ]
      }
    },
    {
      slug: 'other',
      name: 'Бакалея и прочие товары',
      filterSchema: { filters: [] }
    }
  ];

  const categoryMap = new Map<string, string>();
  for (const c of categoriesData) {
    const record = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, filterSchema: c.filterSchema },
      create: c
    });
    categoryMap.set(c.slug, record.id);
  }

  // 4. Seed Products and Offers from Snapshot
  if (fs.existsSync(SNAPSHOT_PATH)) {
    console.log(`>>> [4/5] Ingesting Products & Offers from ${SNAPSHOT_PATH}...`);
    const dataset = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    const canonicalList = dataset.canonicalProducts || [];

    for (const group of canonicalList) {
      const catId = categoryMap.get(group.category) || categoryMap.get('other')!;

      // Create Canonical Product
      const canonicalRecord = await prisma.canonicalProduct.create({
        data: {
          name: group.canonicalName,
          brand: group.brand,
          categoryId: catId,
          imageUrl: group.imageUrl,
          attributes: group.attributes
        }
      });

      // Process Members & Offers
      for (const m of group.members) {
        const raw = m.rawProduct;
        const sId = storeMap.get(raw.storeCode as StoreCode);
        if (!sId) continue;

        // Upsert RawProduct
        const rawRecord = await prisma.rawProduct.upsert({
          where: {
            storeId_sourceProductId: {
              storeId: sId,
              sourceProductId: String(raw.sourceProductId)
            }
          },
          update: {
            rawPrice: raw.price,
            rawOldPrice: raw.oldPrice
          },
          create: {
            storeId: sId,
            sourceProductId: String(raw.sourceProductId),
            sourceUrl: raw.sourceUrl,
            rawName: raw.name,
            rawBrand: raw.brand,
            rawCategory: raw.category,
            rawPrice: raw.price,
            rawOldPrice: raw.oldPrice,
            rawImageUrl: raw.imageUrl,
            rawPayload: raw.rawPayload
          }
        });

        // Create ProductMapping
        await prisma.productMapping.create({
          data: {
            rawProductId: rawRecord.id,
            canonicalProductId: canonicalRecord.id,
            matchMethod: m.matchMethod as MatchMethod,
            matchConfidence: m.matchConfidence,
            reviewStatus: m.reviewStatus as ReviewStatus
          }
        });

        // Create Offer
        await prisma.offer.create({
          data: {
            canonicalProductId: canonicalRecord.id,
            rawProductId: rawRecord.id,
            storeId: sId,
            price: raw.price,
            oldPrice: raw.oldPrice,
            inStock: true
          }
        });
      }
    }
    console.log(`>>> [5/5] Seeded ${canonicalList.length} Canonical Products into Database!`);
  } else {
    console.log(`>>> Note: ${SNAPSHOT_PATH} does not exist yet. Run 'npm run data:pipeline' first.`);
  }

  console.log('\n✅ Database seed completed successfully!');
}

seed()
  .catch(e => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
