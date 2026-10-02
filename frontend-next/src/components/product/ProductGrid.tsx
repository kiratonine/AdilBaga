import type { ProductCardDto } from '../../api/types'
import { ProductCard } from './ProductCard'

type Props = {
  products: ProductCardDto[]
  /** Колонок на широком экране: без панели фильтров места больше */
  wide?: boolean
}

export function ProductGrid({ products, wide = false }: Props) {
  return (
    <ul className={`grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 ${wide ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      {products.map((product) => (
        <li key={product.id} className="[&>article]:h-full">
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  )
}
