import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { AuthedMember } from '../auth/auth.service';

// 交易类型 → 利润表口径归属（v1.1 无账户维度）
// income/expense 直接按科目 tag 归集；
// invest_buy/invest_sell 是资产内部转移，不进利润表（现金流表体现流出/流入）
// loan_repay 仅利息进刚性支出（拆分表 TxSplit 支撑）
const TX_TYPES = [
  'income',
  'expense',
  'invest_buy',
  'invest_sell',
  'invest_income',
  'loan_repay',
  'loan_disburse',
  'asset_buy',
  'earmark',
] as const;

export class TxSplitDto {
  @IsString() @IsNotEmpty()
  part!: string; // interest | principal
  @IsNumber()
  amount!: number;
}

export class CreateTxDto {
  @IsString() @IsNotEmpty()
  date!: string;

  @IsString() @IsNotEmpty()
  type!: string;

  @IsNumber()
  amount!: number;

  @IsString() @IsNotEmpty()
  categoryId!: string;

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;

  @IsOptional() @IsString()
  source?: string;

  @IsOptional() @IsNumber()
  aiConfidence?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  transcript?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TxSplitDto)
  splits?: TxSplitDto[];
}

export class ListQuery {
  month?: string; // YYYY-MM
  memberId?: string;
  categoryId?: string;
  keyword?: string;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  // ---------- 记一笔 ----------
  async create(m: AuthedMember, dto: CreateTxDto) {
    this.validate(dto)

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new BadRequestException('科目不存在');

    // 科目 direction 与交易类型一致性：
    // income/invest_income → income 科目
    // expense/earmark → expense 科目
    // invest_buy/invest_sell → invest 科目（资产转移，不进利润表）
    // loan_repay/loan_disburse → debt 科目
    // asset_buy → asset 科目
    const dirByType: Record<string, string> = {
      income: 'income',
      invest_income: 'income',
      expense: 'expense',
      earmark: 'expense',
      invest_buy: 'invest',
      invest_sell: 'invest',
      loan_repay: 'debt',
      loan_disburse: 'debt',
      asset_buy: 'asset',
    };
    const needDir = dirByType[dto.type];
    if (!needDir || category.direction !== needDir) {
      throw new BadRequestException('科目方向与交易类型不一致');
    }

    return this.prisma.transaction.create({
      data: {
        date: dto.date,
        type: dto.type,
        amount: dto.amount,
        categoryId: dto.categoryId,
        memberId: m.memberId,
        note: dto.note,
        source: dto.source || 'manual',
        aiConfidence: dto.aiConfidence,
        transcript: dto.transcript,
        splits: dto.splits
          ? { create: dto.splits }
          : undefined,
      },
      include: { category: true, splits: true },
    });
  }

  // ---------- 编辑 ----------
  async update(m: AuthedMember, id: string, dto: Partial<CreateTxDto>) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, deletedAt: null, member: { familyId: m.familyId } },
    });
    if (!tx) throw new NotFoundException('流水不存在');

    if (dto.type && !TX_TYPES.includes(dto.type as any)) {
      throw new BadRequestException('交易类型不合法');
    }
    if (dto.amount !== undefined && dto.amount <= 0) {
      throw new BadRequestException('金额必须大于 0');
    }

    return this.prisma.transaction.update({
      where: { id },
      data: {
        date: dto.date,
        type: dto.type,
        amount: dto.amount,
        categoryId: dto.categoryId,
        note: dto.note,
        splits: dto.splits
          ? {
              deleteMany: {},
              create: dto.splits,
            }
          : undefined,
      },
      include: { category: true, splits: true },
    });
  }

  // ---------- 软删除（留痕） ----------
  async remove(m: AuthedMember, id: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, deletedAt: null, member: { familyId: m.familyId } },
    });
    if (!tx) throw new NotFoundException('流水不存在');
    await this.prisma.transaction.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  // ---------- 流水列表（按月查询、按日分组返回） ----------
  async list(m: AuthedMember, q: ListQuery) {
    const month = q.month || new Date().toISOString().slice(0, 7);
    const start = `${month}-01`;
    // 次月 1 日前一日：直接用字符串比较（YYYY-MM-DD 字典序即时间序）
    const [y, mo] = month.split('-').map(Number);
    const nextMonth = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    const end = `${nextMonth}-01`;

    const where: Prisma.TransactionWhereInput = {
      deletedAt: null,
      date: { gte: start, lt: end },
      member: { familyId: m.familyId, status: 'active' },
    };
    if (q.memberId) where.memberId = q.memberId;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.keyword) where.note = { contains: q.keyword };
    if (q.minAmount !== undefined || q.maxAmount !== undefined) {
      where.amount = {};
      if (q.minAmount !== undefined) where.amount.gte = q.minAmount;
      if (q.maxAmount !== undefined) where.amount.lte = q.maxAmount;
    }

    const page = q.page || 1;
    const pageSize = Math.min(q.pageSize || 200, 500);

    const [total, items] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        include: {
          category: true,
          member: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // 按日分组（前端直接渲染）
    const byDay: Record<string, typeof items> = {};
    for (const it of items) {
      (byDay[it.date] = byDay[it.date] || []).push(it);
    }

    return { month, total, page, pageSize, byDay };
  }

  // ---------- 月度汇总（Excel 利润表口径：固定/浮动收入小计、刚性/弹性支出小计、备用金计提） ----------
  async monthlySummary(m: AuthedMember, month: string) {
    const start = `${month}-01`;
    const [y, mo] = month.split('-').map(Number);
    const nextMonth = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;

    const rows = await this.prisma.transaction.groupBy({
      by: ['type', 'categoryId'],
      where: {
        deletedAt: null,
        date: { gte: start, lt: `${nextMonth}-01` },
        member: { familyId: m.familyId, status: 'active' },
      },
      _sum: { amount: true },
    });

    // 贷款还款的利息部分单独取（按拆分明细聚合）
    const loanInterest = await this.prisma.txSplit.aggregate({
      _sum: { amount: true },
      where: {
        part: 'interest',
        tx: {
          deletedAt: null,
          type: 'loan_repay',
          date: { gte: start, lt: `${nextMonth}-01` },
          member: { familyId: m.familyId, status: 'active' },
        },
      },
    });
    const loanRepayTotalRow = rows.find((r) => r.type === 'loan_repay');
    const loanInterestSum = loanInterest._sum.amount || 0;

    const catIds = [...new Set(rows.map((r) => r.categoryId))];
    const cats = await this.prisma.category.findMany({
      where: { id: { in: catIds } },
    });
    const catMap = new Map(cats.map((c) => [c.id, c]));

    // Excel 板块小计口径
    const summary = {
      month,
      fixedIncome: 0, // 固定收入小计
      variableIncome: 0, // 浮动收入小计
      totalIncome: 0, // 总收入合计
      rigidExpense: 0, // 刚性支出小计
      flexibleExpense: 0, // 弹性支出小计
      earmark: 0, // 应急备用金计提
      totalExpense: 0, // 总支出合计（含备用金计提，Excel 口径）
      balance: 0, // 月度收支结余（= 总收入 − 总支出）
      investOut: 0, // 投资配置流出（invest_buy，资产转移不进支出）
      investIn: 0, // 投资卖出/赎回流入
      loanPrincipal: 0, // 贷款还款中的本金部分（减负债，不进利润表）
    };

    for (const r of rows) {
      const cat = catMap.get(r.categoryId);
      const amount = r._sum.amount || 0;

      switch (r.type) {
        case 'income':
          if (cat?.tag === 'fixed') summary.fixedIncome += amount;
          else summary.variableIncome += amount;
          break;
        case 'invest_income':
          summary.variableIncome += amount; // 理财收益归浮动收入
          break;
        case 'expense':
          if (cat?.tag === 'rigid') summary.rigidExpense += amount;
          else if (cat?.tag === 'flexible') summary.flexibleExpense += amount;
          else if (cat?.tag === 'earmark') summary.earmark += amount;
          break;
        case 'invest_buy':
          summary.investOut += amount;
          break;
        case 'invest_sell':
          summary.investIn += amount;
          break;
        case 'loan_repay':
          // 仅利息进刚性支出（本金是还债，不进利润表）；金额已在外面按拆分计
          break;
        case 'asset_buy':
        case 'loan_disburse':
        case 'earmark':
          // 资产购置/借款到账不影响利润表；earmark 类型（计提）在上面 expense 分支不会走到
          break;
      }
    }

    summary.totalIncome = summary.fixedIncome + summary.variableIncome;
    summary.totalExpense =
      summary.rigidExpense + summary.flexibleExpense + summary.earmark;
    summary.balance = summary.totalIncome - summary.totalExpense;

    // 贷款还款口径（按拆分明细）：利息进刚性支出，本金不进利润表
    if (loanRepayTotalRow) {
      summary.rigidExpense += loanInterestSum;
      summary.totalExpense += loanInterestSum;
      summary.balance -= loanInterestSum;
      summary.loanPrincipal =
        (loanRepayTotalRow._sum.amount || 0) - loanInterestSum;
    }

    return summary;
  }

  // ---------- 趋势（近 N 月收支结余，统计页折线图用） ----------
  async trend(m: AuthedMember, months = 6) {
    const now = new Date()
    const list: Array<{ month: string; income: number; expense: number; balance: number }> = []
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const s = await this.monthlySummary(m, mo)
      list.push({ month: mo, income: s.totalIncome, expense: s.totalExpense, balance: s.balance })
    }
    return { months: list }
  }

  private validate(dto: CreateTxDto) {
    // 兼容 ISO 时间串（new Date().toISOString() 等）：只取日期部分
    if (dto.date) {
      dto.date = dto.date.slice(0, 10);
    }
    if (!dto.date || !/^\d{4}-\d{2}-\d{2}$/.test(dto.date)) {
      throw new BadRequestException('日期格式应为 YYYY-MM-DD');
    }
    if (!TX_TYPES.includes(dto.type as any)) {
      throw new BadRequestException('交易类型不合法');
    }
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('金额必须大于 0');
    }
    if (!dto.categoryId) throw new BadRequestException('请选择科目');
    if (dto.splits?.length) {
      const sum = dto.splits.reduce((s, x) => s + x.amount, 0);
      if (Math.abs(sum - dto.amount) > 0.01) {
        throw new BadRequestException('本息拆分之和必须等于还款金额');
      }
      for (const sp of dto.splits) {
        if (!['interest', 'principal'].includes(sp.part)) {
          throw new BadRequestException('拆分部分只能是 interest 或 principal');
        }
      }
    }
    // 贷款还款必须带本息拆分（利息进刚性支出，本金减负债）
    if (dto.type === 'loan_repay' && !dto.splits?.length) {
      throw new BadRequestException('贷款还款请填写利息/本金拆分');
    }
  }
}
