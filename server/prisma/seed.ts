/**
 * 预置科目 seed —— 全部沿用《家庭财务三张表.xlsx》Sheet1/Sheet2 原文命名
 * Sheet3 现金流水的粗分类（工资收入/理财收益/日常消费/固定支出/投资）在系统里
 * 由同一套科目 + 交易类型覆盖，不单独建科目。
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 科目字典：[名称, direction, tag, 排序, 图标]
// 图标名取自 Vant 4 图标库真实存在的名称（van-icon-*）
const categories: Array<[string, string, string, number, string]> = [
  // ===== 收入（利润表口径）=====
  ['工资薪金', 'income', 'fixed', 1, 'balance-o'],
  ['租金收入', 'income', 'fixed', 2, 'wap-home-o'],
  ['其他固定收入', 'income', 'fixed', 3, 'circle'],
  ['奖金津贴', 'income', 'variable', 4, 'gift-o'],
  ['副业收入', 'income', 'variable', 5, 'desktop-o'],
  ['理财收益', 'income', 'variable', 6, 'chart-trending-o'],
  ['其他浮动收入', 'income', 'variable', 7, 'circle'],
  // ===== 支出（利润表口径；房贷/车贷利息侧、投资另走交易类型）=====
  ['房贷/房租', 'expense', 'rigid', 11, 'home-o'],
  ['车贷', 'expense', 'rigid', 12, 'logistics'],
  ['保险费', 'expense', 'rigid', 13, 'shield-o'],
  ['其他刚性支出', 'expense', 'rigid', 14, 'circle'],
  ['衣食住行', 'expense', 'flexible', 21, 'bag-o'],
  ['交通通信', 'expense', 'flexible', 22, 'logistics'],
  ['教育医疗', 'expense', 'flexible', 23, 'bookmark-o'],
  ['休闲娱乐', 'expense', 'flexible', 24, 'smile-o'],
  ['其他弹性支出', 'expense', 'flexible', 25, 'circle'],
  // ===== 备用金计提（Excel 独立板块：应急备用金计提 → 月度备用金计提）=====
  ['月度备用金计提', 'expense', 'earmark', 31, 'umbrella-circle'],
  // ===== 投资配置科目（资产负债表-金融资产侧；invest 交易类型用）=====
  ['储蓄存款', 'invest', 'investment', 41, 'cash-o'],
  ['固定收益投资', 'invest', 'investment', 42, 'bill-o'],
  ['权益类投资', 'invest', 'investment', 43, 'chart-trending-o'],
  ['其他投资', 'invest', 'investment', 44, 'gold-coin-o'],
  // ===== 负债科目（loan_repay / loan_disburse 用）=====
  // 注：支出板块已有"车贷"（利息记支出），此处负债科目名加"负债"后缀避免与全局唯一名冲突
  ['房贷负债', 'debt', 'mortgage', 51, 'wap-home-o'],
  ['车贷负债', 'debt', 'loan', 52, 'logistics'],
  ['消费贷', 'debt', 'loan', 53, 'credit-pay'],
  // ===== 资产购置科目（asset_buy 用）=====
  ['房产', 'asset', 'fixedasset', 61, 'wap-home-o'],
  ['车辆', 'asset', 'fixedasset', 62, 'logistics'],
];

async function main() {
  for (const [name, direction, tag, sortNo, icon] of categories) {
    await prisma.category.upsert({
      where: { name },
      update: { direction, tag, sortNo, icon },
      create: { name, direction, tag, sortNo, icon, isBuiltin: true },
    });
  }
  console.log(`已预置 ${categories.length} 个科目（Excel 原文命名）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
