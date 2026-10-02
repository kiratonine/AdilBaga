import type { ProductCardDto } from '../../api/types'
import { ProductCard } from './ProductCard'
import { productGridClass } from './layout'

type Props = {
  products: ProductCardDto[]
  /** Без колонки фильтров места больше: 4 колонки с lg */
  wide?: boolean
}

export function ProductGrid({ products, wide = false }: Props) {
  return (
    <ul className={productGridClass(wide)}>
      {products.map((product) => (
        <li key={product.id} className="[&>article]:h-full">
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  )
}
