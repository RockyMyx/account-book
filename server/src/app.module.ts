import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { FamilyModule } from './family/family.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';
import { ValuationsModule } from './valuations/valuations.module';
import { ReportsModule } from './reports/reports.module';
import { ZhipuModule } from './zhipu/zhipu.module';
import { VoiceModule } from './voice/voice.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    FamilyModule,
    TransactionsModule,
    CategoriesModule,
    ValuationsModule,
    ReportsModule,
    ZhipuModule,
    VoiceModule,
  ],
})
export class AppModule {}
