import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private cats: CategoriesService) {}

  @Get()
  list() {
    return this.cats.list();
  }

  @Post()
  create(
    @Body()
    data: { name: string; direction: string; tag: string; icon?: string },
  ) {
    return this.cats.create(data);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() data: { name?: string; icon?: string; sortNo?: number },
  ) {
    return this.cats.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cats.remove(id);
  }
}
