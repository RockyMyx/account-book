import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ValuationsController } from './valuations.controller';
import { ValuationsService } from './valuations.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ValuationsController],
  providers: [ValuationsService],
  exports: [ValuationsService],
})
export class ValuationsModule {}
