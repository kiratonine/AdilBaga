import { Controller, Get, Param, Query } from '@nestjs/common';
import type { ProductCardDto } from '../contracts/catalog';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(@Query() query: Record<string, unknown>): Promise<ProductCardDto[]> {
    return this.products.findAll(query);
  }

  @Get(':id')
  findById(@Param('id') id: string): Promise<ProductCardDto> {
    return this.products.findById(id);
  }
}
