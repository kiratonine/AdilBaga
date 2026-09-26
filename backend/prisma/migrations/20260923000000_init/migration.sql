-- CreateEnum
CREATE TYPE "StoreCode" AS ENUM ('DINA', 'DANA', 'FIX_PRICE');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('barcode', 'deterministic', 'ai', 'manual');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('approved', 'pending', 'rejected');

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "code" "StoreCode" NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_locations" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "store_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filterSchema" JSONB,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_products" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "rawName" TEXT NOT NULL,
    "rawBrand" TEXT,
    "rawCategory" TEXT,
    "rawPrice" INTEGER NOT NULL,
    "rawOldPrice" INTEGER,
    "rawImageUrl" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "categoryId" TEXT NOT NULL,
    "imageUrl" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_mappings" (
    "id" TEXT NOT NULL,
    "rawProductId" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "matchMethod" "MatchMethod" NOT NULL,
    "matchConfidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "canonicalProductId" TEXT NOT NULL,
    "rawProductId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "oldPrice" INTEGER,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_code_key" ON "stores"("code");

-- CreateIndex
CREATE INDEX "store_locations_storeId_idx" ON "store_locations"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "raw_products_storeId_idx" ON "raw_products"("storeId");

-- CreateIndex
CREATE INDEX "raw_products_rawCategory_idx" ON "raw_products"("rawCategory");

-- CreateIndex
CREATE UNIQUE INDEX "raw_products_storeId_sourceProductId_key" ON "raw_products"("storeId", "sourceProductId");

-- CreateIndex
CREATE INDEX "canonical_products_categoryId_idx" ON "canonical_products"("categoryId");

-- CreateIndex
CREATE INDEX "canonical_products_brand_idx" ON "canonical_products"("brand");

-- CreateIndex
CREATE INDEX "product_mappings_rawProductId_idx" ON "product_mappings"("rawProductId");

-- CreateIndex
CREATE INDEX "product_mappings_canonicalProductId_idx" ON "product_mappings"("canonicalProductId");

-- CreateIndex
CREATE INDEX "offers_canonicalProductId_idx" ON "offers"("canonicalProductId");

-- CreateIndex
CREATE INDEX "offers_storeId_idx" ON "offers"("storeId");

-- CreateIndex
CREATE INDEX "offers_price_idx" ON "offers"("price");

-- CreateIndex
CREATE INDEX "offers_snapshotAt_idx" ON "offers"("snapshotAt");

-- AddForeignKey
ALTER TABLE "store_locations" ADD CONSTRAINT "store_locations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_products" ADD CONSTRAINT "raw_products_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_products" ADD CONSTRAINT "canonical_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_mappings" ADD CONSTRAINT "product_mappings_rawProductId_fkey" FOREIGN KEY ("rawProductId") REFERENCES "raw_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_mappings" ADD CONSTRAINT "product_mappings_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "canonical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "canonical_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_rawProductId_fkey" FOREIGN KEY ("rawProductId") REFERENCES "raw_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
