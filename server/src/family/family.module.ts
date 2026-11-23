import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FamilyController],
  providers: [FamilyService],
})
export class FamilyModule {}
