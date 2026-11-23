import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
    // SQLite WAL 模式：读写不互斥，家庭并发记账不锁库
    // journal_mode 是返回结果集的 PRAGMA，需用 queryRaw 而非 executeRaw
    await this.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
