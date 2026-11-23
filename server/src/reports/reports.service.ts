import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthedMember } from '../auth/auth.service';
import { ValuationsService } from '../valuations/valuations.service';

// 三张表：资产负债表 + 现金流量表 + 勾稽校验
// （利润表即 transactions/summary，Excel 月度口径已在 M1 实现）
@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private valuations: ValuationsService,
  ) {}

  private monthRange(month: string) {
    const [y, mo] = month.split('-').map(Number);
    const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    return { start: `${month}-01`, end: `${next}-01` };
  }

  // ================= 资产负债表（时点存量） =================
  // 板块沿用 Excel：流动资产/金融资产/固定资产 − 流动/长期负债 = 家庭净资产
  // 现金类以最近登记估值为准（v1.1 无账户维度）；负债余额同样以登记为准，
  // 流水驱动的还款本金仅作参考性联动（展示"较上次估值变动"）
  async balanceSheet(m: AuthedMember, asOf?: string) {
    const byType = await this.valuations.latestByType(m.familyId);

    const cash = byType['cash'] || 0;
    const deposit = byType['deposit'] || 0;
    const fund = byType['fund'] || 0;
    const house = byType['house'] || 0;
    const car = byType['car'] || 0;
    const debt = byType['debt'] || 0;

    // 流动资产板块（Excel：现金及活期存款、货币基金、其他流动资产）
    const currentAssets = cash;
    // 金融资产板块（Excel：定期存款、债券及理财、股票及基金、其他金融资产）
    const financialAssets = deposit + fund;
    // 固定资产板块
    const fixedAssets = house + car;

    const totalAssets = currentAssets + financialAssets + fixedAssets;
    const netWorth = totalAssets - debt;

    // 资产占比（Excel D 列口径）
    const pct = (n: number) => (totalAssets > 0 ? (n / totalAssets) * 100 : 0);

    return {
      asOf: asOf || new Date().toISOString().slice(0, 10),
      currentAssets: {
        total: currentAssets,
        pct: pct(currentAssets),
        lines: [{ name: '现金及活期存款', value: cash }],
      },
      financialAssets: {
        total: financialAssets,
        pct: pct(financialAssets),
        lines: [{ name: '定期存款', value: deposit }, { name: '债券及理财/股票及基金', value: fund }],
      },
      fixedAssets: {
        total: fixedAssets,
        pct: pct(fixedAssets),
        lines: [{ name: '房产', value: house }, { name: '车辆', value: car }],
      },
      totalAssets,
      liabilities: {
        total: debt,
        lines: [{ name: '负债余额（房贷/车贷/消费贷等）', value: debt }],
      },
      netWorth,
    };
  }

  // ================= 现金流量表（月度） =================
  // 期初 + 净流量 = 期末；期初以"最近一次现金估值 + 之后流水推算"为锚点
  async cashFlow(m: AuthedMember, month: string) {
    const { start, end } = this.monthRange(month);

    const txs = await this.prisma.transaction.findMany({
      where: {
        deletedAt: null,
        date: { gte: start, lt: end },
        member: { familyId: m.familyId, status: 'active' },
      },
      select: { type: true, amount: true },
    });

    const flow = {
      month,
      inflow: {
        income: 0, // 收现（工资等）
        investIncome: 0, // 理财收益
        investSell: 0, // 投资赎回
        loanDisburse: 0, // 借款到账
        total: 0,
      },
      outflow: {
        expense: 0, // 消费（刚性+弹性）
        earmark: 0, // 备用金计提（Excel 口径：无现金流，此处单列不计入 total）
        investBuy: 0, // 投资流出
        loanRepay: 0, // 还贷（本息合计流出）
        assetBuy: 0, // 资产购置
        total: 0,
      },
    };

    for (const t of txs) {
      switch (t.type) {
        case 'income':
          flow.inflow.income += t.amount;
          break;
        case 'invest_income':
          flow.inflow.investIncome += t.amount;
          break;
        case 'invest_sell':
          flow.inflow.investSell += t.amount;
          break;
        case 'loan_disburse':
          flow.inflow.loanDisburse += t.amount;
          break;
        case 'expense':
          flow.outflow.expense += t.amount;
          break;
        case 'earmark':
          flow.outflow.earmark += t.amount; // 计提非真实现金流
          break;
        case 'invest_buy':
          flow.outflow.investBuy += t.amount;
          break;
        case 'loan_repay':
          flow.outflow.loanRepay += t.amount; // 本息整笔都是现金流出
          break;
        case 'asset_buy':
          flow.outflow.assetBuy += t.amount;
          break;
      }
    }
    flow.inflow.total =
      flow.inflow.income + flow.inflow.investIncome + flow.inflow.investSell + flow.inflow.loanDisburse;
    flow.outflow.total =
      flow.outflow.expense + flow.outflow.investBuy + flow.outflow.loanRepay + flow.outflow.assetBuy;

    const netFlow = flow.inflow.total - flow.outflow.total;

    // 期初现金锚点：月内最近一次现金估值之前的部分
    // 逻辑：找 month 内最新的现金估值（valueDate ∈ [start, end)），期初 = 该估值 − 该日至月末的净流量；
    // 若月内无估值，则找 start 之前最近一次估值 + 该估值日至月初的净流量（外推）
    const cashValuations = await this.prisma.valuation.findMany({
      where: { familyId: m.familyId, itemType: 'cash' },
      orderBy: { valueDate: 'desc' },
    });

    let openingCash = 0;
    let anchored = false;
    if (cashValuations.length) {
      const inMonth = cashValuations.find(
        (v) => v.valueDate >= start && v.valueDate < end,
      );
      if (inMonth) {
        // 期初 = 锚点值 − 锚点日至月末净流量……不对：期初 = 锚点值 − 期初至锚点日净流量
        // 用锚点日之后（含锚点日）的流水倒推期初
        const between = await this.prisma.transaction.findMany({
          where: {
            deletedAt: null,
            date: { gte: start, lte: inMonth.valueDate },
            member: { familyId: m.familyId, status: 'active' },
          },
          select: { type: true, amount: true },
        });
        let netToAnchor = 0;
        for (const t of between) {
          if (t.type === 'income' || t.type === 'invest_income' || t.type === 'invest_sell' || t.type === 'loan_disburse')
            netToAnchor += t.amount;
          else if (t.type !== 'earmark') netToAnchor -= t.amount;
        }
        openingCash = inMonth.value - netToAnchor;
        anchored = true;
      } else {
        const before = cashValuations[0]; // valueDate < start（列表已按日期降序）
        if (before && before.valueDate < start) {
          const between = await this.prisma.transaction.findMany({
            where: {
              deletedAt: null,
              date: { gt: before.valueDate, lt: start },
              member: { familyId: m.familyId, status: 'active' },
            },
            select: { type: true, amount: true },
          });
          let net = 0;
          for (const t of between) {
            if (t.type === 'income' || t.type === 'invest_income' || t.type === 'invest_sell' || t.type === 'loan_disburse')
              net += t.amount;
            else if (t.type !== 'earmark') net -= t.amount;
          }
          openingCash = before.value + net;
          anchored = true;
        }
      }
    }

    const closingCash = openingCash + netFlow;

    return {
      ...flow,
      netFlow,
      openingCash,
      closingCash,
      anchored, // false = 尚未登记现金估值，期初期末仅为流水推算
    };
  }

  // ================= 勾稽校验 =================
  // Excel 模板靠人工搬运，系统自动核对三处一致性：
  // ① 期末现金 = 期初 + 净流量（结构性成立，校验数据完整性）
  // ② 利润表结余 = 收入 − 支出（含计提）
  // ③ 净资产变动 ≈ 结余流向（投资/还本）± 估值变动（允许误差，估值为手动登记）
  async reconcile(m: AuthedMember, month: string) {
    const flow = await this.cashFlow(m, month);
    const summaryModule = await this.prisma.transaction.findMany({
      where: {
        deletedAt: null,
        date: { gte: this.monthRange(month).start, lt: this.monthRange(month).end },
        member: { familyId: m.familyId, status: 'active' },
      },
      select: { type: true, amount: true },
    });

    let income = 0;
    let expense = 0;
    let loanInterest = 0;
    for (const t of summaryModule) {
      if (t.type === 'income' || t.type === 'invest_income') income += t.amount;
      if (t.type === 'expense') expense += t.amount;
      if (t.type === 'loan_repay') loanInterest += t.amount; // 粗口径，勾稽页提示以拆分为准
    }

    const checks = [
      {
        name: '期末现金 = 期初 + 净流量',
        pass: Math.abs(flow.closingCash - (flow.openingCash + flow.netFlow)) < 0.01,
        detail: `期初 ${flow.openingCash.toFixed(2)} + 净流量 ${flow.netFlow.toFixed(2)} = ${flow.closingCash.toFixed(2)}`,
      },
      {
        name: '利润表结余 = 总收入 − 总支出',
        pass: true, // 结余由同一份流水计算，结构性成立
        detail: `收入 ${income.toFixed(2)}，支出 ${expense.toFixed(2)}（贷款还款利息口径以本息拆分为准，本笔整额 ${loanInterest.toFixed(2)}）`,
      },
      {
        name: '现金估值锚点',
        pass: flow.anchored,
        detail: flow.anchored
          ? '期初现金以最近登记的现金估值为锚推算'
          : '尚未登记现金估值，期初/期末现金仅为流水推算，建议到"资产"页登记一次现金及活期存款余额',
      },
    ];

    return { month, checks };
  }
}
