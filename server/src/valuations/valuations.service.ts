import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IsNotEmpty, IsNumber, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthedMember } from '../auth/auth.service';

// 估值类型 → 资产负债表板块映射（沿用 Excel 科目板块）
export const ITEM_TYPES = [
  'cash', // 流动资产：现金及活期存款（含货币基金，v1.1 无账户维度，一并手动登记）
  'deposit', // 金融资产：定期存款
  'fund', // 金融资产：债券及理财 + 股票及基金（登记时取名区分）
  'house', // 固定资产：房产
  'car', // 固定资产：车辆
  'debt', // 负债：房贷/车贷/消费贷余额（正数，报表侧取负）
] as const;

export class CreateValuationDto {
  @IsString() @IsNotEmpty()
  itemType!: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  itemName!: string;

  @IsNumber()
  value!: number; // 负债为正数

  @IsString() @IsNotEmpty()
  valueDate!: string; // YYYY-MM-DD
}

@Injectable()
export class ValuationsService {
  constructor(private prisma: PrismaService) {}

  async create(m: AuthedMember, dto: CreateValuationDto) {
    if (!ITEM_TYPES.includes(dto.itemType as any)) {
      throw new BadRequestException('估值类型不合法');
    }
    dto.valueDate = dto.valueDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.valueDate)) {
      throw new BadRequestException('日期格式应为 YYYY-MM-DD');
    }
    return this.prisma.valuation.create({
      data: {
        familyId: m.familyId,
        itemType: dto.itemType,
        itemName: dto.itemName,
        value: dto.value,
        valueDate: dto.valueDate,
      },
    });
  }

  // 登记项列表（每个 itemName 取最新一次估值为当前值）
  async list(m: AuthedMember) {
    const all = await this.prisma.valuation.findMany({
      where: { familyId: m.familyId },
      orderBy: { valueDate: 'desc' },
    });
    // 同名登记项：保留最新估值 + 最近历史
    const latestByName = new Map<string, (typeof all)[number]>();
    for (const v of all) {
      if (!latestByName.has(v.itemName)) latestByName.set(v.itemName, v);
    }
    return {
      items: [...latestByName.values()],
      totalRegistered: latestByName.size,
    };
  }

  async remove(m: AuthedMember, id: string) {
    const v = await this.prisma.valuation.findFirst({
      where: { id, familyId: m.familyId },
    });
    if (!v) throw new NotFoundException('估值记录不存在');
    await this.prisma.valuation.delete({ where: { id } });
    return { ok: true };
  }

  // 各类型最新估值合计（资产负债表用）
  async latestByType(familyId: string) {
    const all = await this.prisma.valuation.findMany({
      where: { familyId },
      orderBy: { valueDate: 'desc' },
    });
    const byName = new Map<string, number>();
    for (const v of all) {
      if (!byName.has(v.itemName)) byName.set(v.itemName, v.value);
    }
    const byType: Record<string, number> = {};
    for (const v of all) {
      if (byName.get(v.itemName) === v.value) {
        // 仅统计每个登记项最新那条
        if (all.find((x) => x.itemName === v.itemName && x.id !== v.id && x.valueDate > v.valueDate)) continue;
        byType[v.itemType] = (byType[v.itemType] || 0) + v.value;
      }
    }
    return byType;
  }
}
