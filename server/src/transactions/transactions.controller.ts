import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthedMember } from '../auth/auth.service';
import { CurrentMember, DeviceGuard } from '../auth/device.guard';
import {
  CreateTxDto,
  ListQuery,
  TransactionsService,
} from './transactions.service';

@Controller('transactions')
@UseGuards(DeviceGuard)
export class TransactionsController {
  constructor(private txs: TransactionsService) {}

  @Post()
  create(@CurrentMember() m: AuthedMember, @Body() dto: CreateTxDto) {
    return this.txs.create(m, dto);
  }

  @Get()
  list(@CurrentMember() m: AuthedMember, @Query() q: ListQuery) {
    return this.txs.list(m, q);
  }

  @Get('summary')
  summary(
    @CurrentMember() m: AuthedMember,
    @Query('month') month: string,
  ) {
    const mo = month || new Date().toISOString().slice(0, 7);
    return this.txs.monthlySummary(m, mo);
  }

  // 近 N 月收支结余趋势（统计页折线图）
  @Get('trend')
  trend(
    @CurrentMember() m: AuthedMember,
    @Query('months') months: string,
  ) {
    return this.txs.trend(m, Math.min(Number(months) || 6, 24));
  }

  @Put(':id')
  update(
    @CurrentMember() m: AuthedMember,
    @Param('id') id: string,
    @Body() dto: Partial<CreateTxDto>,
  ) {
    return this.txs.update(m, id, dto);
  }

  @Delete(':id')
  remove(@CurrentMember() m: AuthedMember, @Param('id') id: string) {
    return this.txs.remove(m, id);
  }
}
