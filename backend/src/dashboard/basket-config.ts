export type BasketSlot = {
  key: string;
  name: string;
  categorySlug: string;
  attributeKey: 'volumeMl' | 'weightGrams';
  min: number;
  max: number;
  namePattern: string;
};

// Must stay identical to the `slots` CTE in backend-go/internal/postgres/dashboard.go.
// Patterns are case-insensitive and use only syntax shared by POSIX ARE and JS RegExp.
export const BASKET_SLOTS: readonly BasketSlot[] = [
  { key: 'basket-milk', name: 'Молоко 1 л', categorySlug: 'milk', attributeKey: 'volumeMl', min: 1000, max: 1000, namePattern: '^молоко ' },
  { key: 'basket-pasta', name: 'Макароны 400 г', categorySlug: 'groats', attributeKey: 'weightGrams', min: 400, max: 400, namePattern: '^(макароны|спагетти)' },
  { key: 'basket-rice', name: 'Рис 800 г', categorySlug: 'groats', attributeKey: 'weightGrams', min: 800, max: 800, namePattern: '^рис ' },
  { key: 'basket-yogurt', name: 'Йогурт Fruttis 115 г', categorySlug: 'dairy', attributeKey: 'weightGrams', min: 115, max: 115, namePattern: 'fruttis' },
  { key: 'basket-oil', name: 'Масло подсолнечное 0,8–1 л', categorySlug: 'oil', attributeKey: 'volumeMl', min: 800, max: 1000, namePattern: 'подсолнеч' },
];
