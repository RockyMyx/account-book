import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ValuationsModule } from '../valuations/valuations.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [PrismaModule, AuthModule, ValuationsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
