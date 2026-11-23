import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { ZhipuService } from '../zhipu/zhipu.service';
import { AzureSpeechService } from '../zhipu/azure-speech.service';
import { AuthedMember } from '../auth/auth.service';

// 语音记账：录音 → 微软 STT 转写 → 智谱 GLM 结构化解析 → 待确认清单 → 批量入账
// 设计原则：AI 只做"草稿"，最终以用户确认的清单为准

interface ParsedItem {
  direction: 'income' | 'expense'; // 方向
  amount: number; // 金额（元）
  categoryName: string; // 分类名（尽量映射到现有科目）
  date?: string; // 日期 YYYY-MM-DD（口语"昨天"等由模型换算）
  note?: string; // 备注
  confidence: number; // 模型自评置信度 0~1
}

export class ApplyTxItem {
  @IsNotEmpty()
  type!: string; // income | expense | invest_buy | ... （与手动记账同一套类型
  @IsNumber()
  amount!: number;
  @IsNotEmpty()
  categoryName!: string; // 分类名（后端按名解析/新建）
  @IsOptional() @IsString()
  note?: string;
  @IsOptional() @IsString()
  date?: string;
  @IsOptional() @IsNumber()
  confidence?: number;
  @IsOptional() @IsString() @MaxLength(2000)
  transcript?: string;
}

export class ApplyDto {
  @IsString() @IsNotEmpty() @MaxLength(2000)
  transcript!: string; // 原话（留档可回溯）
  @IsArray()
  @Type(() => ApplyTxItem)
  items!: ApplyTxItem[];
}

@Injectable()
export class VoiceService {
  constructor(
    private prisma: PrismaService,
    private zhipu: ZhipuService,
    private azure: AzureSpeechService,
  ) {}

  // ---------- ① 音频 → 转写文本（微软 STT，zh-CN） ----------
  async transcribe(file?: Express.Multer.File): Promise<string> {
    if (!file) throw new BadRequestException('请上传音频文件');
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('音频过大（限 10MB，约 5 分钟）');
    }
    try {
      const wav = await this.azure.toWav(file.buffer, file.originalname || 'audio.webm');
      const text = await this.azure.transcribe(wav);
      if (!text) {
        throw new ServiceUnavailableException('没听清，请靠近一点重说，或用文字输入');
      }
      return text;
    } catch (e: any) {
      if (e instanceof ServiceUnavailableException) throw e;
      throw new ServiceUnavailableException(
        `语音识别失败：${e.message || '未知错误'}，可改用文字输入`,
      );
    }
  }

  // ---------- ② 文本 → 结构化待确认清单 ----------
  async parse(text: string, m: AuthedMember) {
    const text_ = (text || '').trim().slice(0, 500);
    if (!text_) throw new BadRequestException('请说出或输入记账内容');

    // 分类树给模型做映射参考（含自定义科目）
    const cats = await this.prisma.category.findMany({
      orderBy: [{ direction: 'asc' }, { sortNo: 'asc' }],
    });
    const catList = cats
      .map((c) => `${c.name}(${c.direction})`)
      .join('、');

    const today = new Date().toISOString().slice(0, 10);
    const system = `你是家庭记账解析器。用户会说一句话（可能含多笔账），你把它解析成 JSON 数组。
规则：
1. direction 只能是 income 或 expense；amount 为正数（元）；
2. categoryName 从这个清单里选最贴切的：${catList}；实在没有贴切的就用用户的原词（用户确认时可新建）；
3. 中文数字要转数值（"三十五"→35，"两百"→200）；
4. 日期：用户没说就是今天（${today}）；"昨天"=${this.shiftDate(-1)}；只输出 YYYY-MM-DD；
5. confidence 为你对这笔解析的把握 0~1（金额含糊、分类拿不准时降低）；
6. note 简短记录原始说法（如"午饭""地铁"）；
7. 只输出 JSON 数组本身，不要 markdown 代码块、不要解释。
示例输入："今天午饭花了35，地铁3块，发的工资两万到账"
示例输出：[{"direction":"expense","amount":35,"categoryName":"衣食住行","date":"${today}","note":"午饭","confidence":0.95},{"direction":"expense","amount":3,"categoryName":"交通通信","date":"${today}","note":"地铁","confidence":0.95},{"direction":"income","amount":20000,"categoryName":"工资薪金","date":"${today}","note":"工资到账","confidence":0.98}]`;

    let raw: string;
    try {
      raw = await this.zhipu.chat([
        { role: 'system', content: system },
        { role: 'user', content: text_ },
      ]);
    } catch (e: any) {
      throw new ServiceUnavailableException(
        `AI 解析暂不可用：${e.message || '服务异常'}`,
      );
    }

    const items = this.extractJson(raw);
    if (!Array.isArray(items) || !items.length) {
      throw new ServiceUnavailableException('没能从这段话里解析出账目，请换个说法试试');
    }

    // 与现有科目模糊匹配：完全同名 → 直接给 id；否则置 needCreate 提示
    const catByName = new Map(cats.map((c) => [c.name, c]));
    const result = items.slice(0, 20).map((it: ParsedItem) => {
      const cat = catByName.get(it.categoryName);
      return {
        type: it.direction,
        amount: Number(it.amount) || 0,
        categoryName: it.categoryName,
        categoryId: cat?.id || null,
        needCreate: !cat,
        date: /^\d{4}-\d{2}-\d{2}$/.test(it.date || '') ? it.date : today,
        note: it.note || '',
        confidence: Math.min(Math.max(Number(it.confidence) || 0.5, 0), 1),
      };
    });

    return { transcript: text_, items: result };
  }

  // ---------- ③ 确认清单 → 批量入账 ----------
  async apply(m: AuthedMember, dto: ApplyDto) {
    if (!dto.items?.length) throw new BadRequestException('清单为空');

    const created: string[] = [];
    for (const it of dto.items) {
      if (!it.amount || it.amount <= 0) continue; // 跳过无效项（用户可先删）

      // 分类：有 id 用 id；按名找；找不到 → 新建（用户确认过 = 授权创建）
      let cat = it.categoryName
        ? await this.prisma.category.findUnique({ where: { name: it.categoryName } })
        : null;
      if (!cat) {
        const dir =
          it.type === 'income' || it.type === 'invest_income' ? 'income' : 'expense';
        cat = await this.prisma.category.create({
          data: {
            name: it.categoryName || '未分类',
            direction: dir,
            tag: dir === 'income' ? 'variable' : 'flexible',
          },
        });
      }

      const tx = await this.prisma.transaction.create({
        data: {
          date: (it.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
          type: it.type,
          amount: it.amount,
          categoryId: cat.id,
          memberId: m.memberId,
          note: it.note,
          source: 'voice',
          aiConfidence: it.confidence,
          transcript: dto.transcript,
        },
      });
      created.push(tx.id);
    }

    return { created: created.length, ids: created };
  }

  // 从模型输出中提取 JSON（容忍 ```json 包裹、前后杂文）
  private extractJson(raw: string): unknown {
    let s = raw.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    const start = s.indexOf('[');
    const end = s.lastIndexOf(']');
    if (start >= 0 && end > start) {
      s = s.slice(start, end + 1);
    }
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  private shiftDate(days: number): string {
    const d = new Date(Date.now() + days * 86400000);
    return d.toISOString().slice(0, 10);
  }
}
