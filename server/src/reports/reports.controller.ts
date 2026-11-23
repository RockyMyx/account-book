import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthedMember } from '../auth/auth.service';
import { CurrentMember, DeviceGuard } from '../auth/device.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(DeviceGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  // 资产负债表（asOf 预留，当前以最近估值为准）
  @Get('balance-sheet')
  balanceSheet(
    @CurrentMember() m: AuthedMember,
    @Query('asOf') asOf: string,
  ) {
    return this.reports.balanceSheet(m, asOf);
  }

  // 现金流量表（月度）
  @Get('cash-flow')
  cashFlow(
    @CurrentMember() m: AuthedMember,
    @Query('month') month: string,
  ) {
    return this.reports.cashFlow(m, month || new Date().toISOString().slice(0, 7));
  }

  // 勾稽校验
  @Get('reconcile')
  reconcile(
    @CurrentMember() m: AuthedMember,
    @Query('month') month: string,
  ) {
    return this.reports.reconcile(m, month || new Date().toISOString().slice(0, 7));
  }
}
