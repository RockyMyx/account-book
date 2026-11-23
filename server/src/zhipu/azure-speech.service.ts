import { Injectable, ServiceUnavailableException } from '@nestjs/common';

// 微软语音识别（Azure Speech STT）
// 复用 english-start 项目验证过的方案：
// - 短音频 REST 接口：{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1
// - 识别语言 zh-CN（家庭记账口令为中文）
// - 输入 wav/ogg（浏览器录音 ffmpeg 服务端转码）
@Injectable()
export class AzureSpeechService {
  private get key() {
    return process.env.AZURE_SPEECH_KEY || '';
  }
  private get region() {
    return process.env.AZURE_SPEECH_REGION || '';
  }

  get configured(): boolean {
    return !!(this.key && this.region);
  }

  // 音频 Buffer（wav）→ 中文文本
  async transcribe(audio: Buffer): Promise<string> {
    if (!this.configured) {
      throw new ServiceUnavailableException('微软语音服务未配置，请用文字输入');
    }
    const url =
      `https://${this.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=zh-CN&format=simple`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.key,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        Accept: 'application/json',
      },
      body: Uint8Array.from(audio).buffer,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(
        `微软语音识别失败（HTTP ${res.status}）`,
      );
    }
    const data = await res.json();
    if (data.RecognitionStatus === 'NoMatch' || !data.DisplayText) {
      return ''; // 没听清 → 上层提示重说或改文字
    }
    return data.DisplayText as string;
  }

  // 浏览器录音（webm/opus 等）→ 16k 单声道 wav
  async toWav(audio: Buffer, filename: string): Promise<Buffer> {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileP = promisify(execFile);
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');

    const tmpIn = path.join(os.tmpdir(), `ab_stt_in_${Date.now()}_${filename}`);
    const tmpOut = tmpIn + '.wav';
    fs.writeFileSync(tmpIn, audio);
    try {
      await execFileP('ffmpeg', [
        '-y', '-i', tmpIn,
        '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
        tmpOut,
      ]);
      return fs.readFileSync(tmpOut);
    } finally {
      try { fs.unlinkSync(tmpIn); } catch {}
      try { fs.unlinkSync(tmpOut); } catch {}
    }
  }
}
