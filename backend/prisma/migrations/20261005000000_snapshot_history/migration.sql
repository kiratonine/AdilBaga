-- Forward-only application versioning. No role provisioning or runtime LOGIN.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.raw_products, public.offers IN ACCESS EXCLUSIVE MODE;

CREATE TYPE "SnapshotStatus" AS ENUM ('building','validating','published','failed');
CREATE TYPE "SourceRunStatus" AS ENUM ('pending','succeeded','failed');
CREATE TABLE public.snapshots (
    id TEXT PRIMARY KEY,
    status "SnapshotStatus" NOT NULL DEFAULT 'building',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "sourceStats" JSONB NOT NULL DEFAULT '{}',
    "qualityReport" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT snapshots_publication_check CHECK ((status='published') = ("publishedAt" IS NOT NULL))
);
CREATE TABLE public.source_runs (
    id TEXT PRIMARY KEY,
    "snapshotId" TEXT NOT NULL REFERENCES public.snapshots(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    "storeId" TEXT NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status "SourceRunStatus" NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "productCount" INTEGER NOT NULL DEFAULT 0 CHECK ("productCount">=0),
    "errorCount" INTEGER NOT NULL DEFAULT 0 CHECK ("errorCount">=0),
    "errorSummary" TEXT,
    "sourceStats" JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX "source_runs_snapshotId_storeId_key" ON public.source_runs("snapshotId","storeId");
CREATE INDEX "source_runs_storeId_status_capturedAt_idx" ON public.source_runs("storeId",status,"capturedAt");
CREATE INDEX "snapshots_status_publishedAt_idx" ON public.snapshots(status,"publishedAt");
CREATE INDEX "snapshots_publishedAt_idx" ON public.snapshots("publishedAt");

ALTER TABLE public.raw_products ADD COLUMN "snapshotId" TEXT;
ALTER TABLE public.offers ADD COLUMN "snapshotId" TEXT;
DO $guard$
BEGIN
    IF EXISTS (SELECT 1 FROM public.raw_products) AND NOT EXISTS (SELECT 1 FROM public.offers) THEN
        RAISE EXCEPTION 'Populated backfill requires existing source capture timestamps';
    END IF;
END $guard$;
INSERT INTO public.snapshots(id,status,"startedAt","publishedAt","sourceStats","qualityReport")
SELECT 'baseline-internal-v1','published',min("snapshotAt"),max("snapshotAt"),
       '{"kind":"baseline-backfill"}',jsonb_build_object('rawCount',(SELECT count(*) FROM public.raw_products))
FROM public.offers HAVING count(*)>0;
UPDATE public.raw_products SET "snapshotId"='baseline-internal-v1';
UPDATE public.offers SET "snapshotId"='baseline-internal-v1';
INSERT INTO public.source_runs(id,"snapshotId","storeId",status,"startedAt","finishedAt","capturedAt","productCount","sourceStats")
SELECT 'baseline-source-'||s.id,b.id,s.id,'succeeded',b."startedAt",b."publishedAt",
       (SELECT max(o."snapshotAt") FROM public.offers o WHERE o."storeId"=s.id),
       (SELECT count(*)::integer FROM public.raw_products r WHERE r."storeId"=s.id),'{"kind":"baseline-backfill"}'
FROM public.stores s CROSS JOIN public.snapshots b WHERE b.id='baseline-internal-v1';
ALTER TABLE public.raw_products ALTER COLUMN "snapshotId" SET NOT NULL;
ALTER TABLE public.offers ALTER COLUMN "snapshotId" SET NOT NULL;
DROP INDEX public."raw_products_storeId_sourceProductId_key";
CREATE UNIQUE INDEX "raw_products_snapshotId_storeId_sourceProductId_key" ON public.raw_products("snapshotId","storeId","sourceProductId");
CREATE UNIQUE INDEX "raw_products_id_snapshotId_key" ON public.raw_products(id,"snapshotId");
ALTER TABLE public.raw_products ADD CONSTRAINT "raw_products_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES public.snapshots(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.offers ADD CONSTRAINT "offers_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES public.snapshots(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public.offers DROP CONSTRAINT "offers_rawProductId_fkey";
ALTER TABLE public.offers ADD CONSTRAINT "offers_rawProductId_snapshotId_fkey" FOREIGN KEY ("rawProductId","snapshotId") REFERENCES public.raw_products(id,"snapshotId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "offers_snapshotId_idx" ON public.offers("snapshotId");
CREATE INDEX "offers_snapshotId_canonicalProductId_idx" ON public.offers("snapshotId","canonicalProductId");
CREATE INDEX "offers_snapshotId_storeId_idx" ON public.offers("snapshotId","storeId");
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.snapshots,public.source_runs FROM PUBLIC;
GRANT SELECT ON public.snapshots TO aktau_api_reader;
CREATE POLICY aktau_api_reader_select ON public.snapshots FOR SELECT TO aktau_api_reader USING (true);
COMMIT;
