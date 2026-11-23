import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  // 全量科目树（按 direction + 板块 tag + sortNo 排序）
  async list() {
    const cats = await this.prisma.category.findMany({
      orderBy: [{ direction: 'desc' }, { tag: 'asc' }, { sortNo: 'asc' }],
    });
    return cats;
  }

  // 新增自定义科目
  async create(data: {
    name: string;
    direction: string;
    tag: string;
    icon?: string;
  }) {
    const exists = await this.prisma.category.findUnique({ where: { name: data.name } });
    if (exists) throw new BadRequestException('科目名已存在');
    return this.prisma.category.create({ data: { ...data, isBuiltin: false } });
  }

  // 改名/图标/排序（预置科目允许改名，不允许改板块归属）
  async update(
    id: string,
    data: { name?: string; icon?: string; sortNo?: number },
  ) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('科目不存在');
    if (data.name && data.name !== cat.name) {
      const dup = await this.prisma.category.findUnique({ where: { name: data.name } });
      if (dup) throw new BadRequestException('科目名已存在');
    }
    return this.prisma.category.update({ where: { id }, data });
  }

  // 删除：预置科目不可删；有流水的科目软性拒绝（历史数据要保持可读）
  async remove(id: string) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('科目不存在');
    if (cat.isBuiltin) throw new BadRequestException('预置科目不可删除');

    const usedCount = await this.prisma.transaction.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (usedCount > 0) {
      throw new BadRequestException(
        `该科目还有 ${usedCount} 笔流水，请先处理流水后再删除`,
      );
    }
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }
}
