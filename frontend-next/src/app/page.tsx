import { catalogApi } from '../api/catalogApi'
import { ProductGrid } from '../components/product/ProductGrid'

// Временная страница-проверка каркаса: данные берутся на сервере, карточки приходят в HTML.
// Заменяется лендингом в сессии Next 2
export default async function Page() {
  const dashboard = await catalogApi.getDashboard()
  const ids = dashboard.priceSpreads.slice(0, 8).map((spread) => spread.productId)
  const products = await Promise.all(ids.map((id) => catalogApi.getProduct(id)))

  return (
    <div className="container-page py-8">
      <h1 className="mb-6 font-display text-2xl font-bold">Adil Bağa</h1>
      <ProductGrid products={products} wide />
    </div>
  )
}
