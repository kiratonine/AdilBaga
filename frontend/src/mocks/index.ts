// Типизированный доступ к фикстурам. JSON генерируется scripts/generate-mocks.mjs.
import type { CategoryDto, DashboardDto, FilterSchemaDto, ProductCardDto } from '../api/types'
import categoriesJson from './categories.json'
import dashboardJson from './dashboard.json'
import filtersJson from './filters.json'
import productsJson from './products.json'

export const mockCategories = categoriesJson as CategoryDto[]
export const mockFilters = filtersJson as unknown as Record<string, FilterSchemaDto>
export const mockProducts = productsJson as unknown as ProductCardDto[]
export const mockDashboard = dashboardJson as DashboardDto
