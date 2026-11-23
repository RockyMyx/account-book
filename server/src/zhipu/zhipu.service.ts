import { Injectable, ServiceUnavailableException } from '@nestjs/common';

// 智谱开放平台客户端
// 端点说明（2026-11-23 实测）：
// - coding plan key 走 /api/coding/paas/v4：文本 chat/completions 可用（glm-4-flash 等）
// - ASR（audio/transcriptions）与多模态音频输入需标准平台余额（coding plan 不覆盖），
//   余额不足时报 1113，上层据此降级为文字输入
@Injectable()
export class ZhipuService {
  private get key() {
    return process.env.ZHIPU_API_KEY || '';
  }
  private get base() {
    // ZHIPU_BASE_URL 支持 coding 端点（默认）或标准端点
    return (
      process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/coding/paas/v4'
    );
  }
  private get llmModel() {
    return process.env.ZHIPU_LLM_MODEL || 'glm-4-flash';
  }

  // ---------- 文本对话（结构化解析用） ----------
  async chat(messages: Array<{ role: string; content: string }>, opts?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.llmModel,
      messages,
      temperature: opts?.temperature ?? 0.1, // 解析任务要稳定
      max_tokens: opts?.maxTokens ?? 2000,
    };
    // glm-4.5+ 系列必须显式给思考档位（"disabled" 会报错），低档足够解析
    if (!this.llmModel.startsWith('glm-4-flash')) {
      (body as any).thinking = { type: 'enabled' };
    }

    const res = await fetch(`${this.base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) {
      throw new ServiceUnavailableException(
        `智谱 LLM 调用失败：${data.error.message}`,
      );
    }
    return data.choices?.[0]?.message?.content || '';
  }
}
