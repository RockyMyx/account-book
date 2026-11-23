import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ZhipuModule } from '../zhipu/zhipu.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({
  imports: [PrismaModule, AuthModule, ZhipuModule, TransactionsModule],
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}
