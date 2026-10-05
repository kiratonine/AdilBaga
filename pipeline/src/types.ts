import { z } from 'zod'

export const STORE_CODES = ['DINA', 'DANA', 'FIX_PRICE', 'ANVAR'] as const
export type StoreCode = (typeof STORE_CODES)[number]

const price = z.number().int().positive().max(2_147_483_647)

export const SourceProductSchema = z.object({
  sourceProductId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  price,
  oldPrice: price.nullable(),
  imageUrl: z.string().url().nullable(),
  sourceUrl: z.string().url().nullable(),
  brand: z.string().trim().min(1).nullable(),
  /** Путь категории в источнике, от корня к листу: ['Молочные продукты', 'Молоко'] */
  sourceCategoryPath: z.array(z.string()),
  rawPayload: z.record(z.unknown()),
})
export type SourceProduct = z.infer<typeof SourceProductSchema>

export const SourceFileSchema = z.object({
  storeCode: z.enum(STORE_CODES),
  city: z.literal('Aktau'),
  capturedAt: z.string().datetime(),
  errorCount: z.number().int().nonnegative(),
  sourceStats: z.record(z.union([z.number(), z.string(), z.boolean()])),
  products: z.array(SourceProductSchema),
})
export type SourceFile = z.infer<typeof SourceFileSchema>
