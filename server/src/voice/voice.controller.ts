import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString, MaxLength } from 'class-validator';
import { AuthedMember } from '../auth/auth.service';
import { CurrentMember, DeviceGuard } from '../auth/device.guard';
import { ApplyDto, VoiceService } from './voice.service';

class ParseDto {
  @IsString() @MaxLength(500)
  text!: string;
}

@Controller('voice')
@UseGuards(DeviceGuard)
export class VoiceController {
  constructor(private voice: VoiceService) {}

  // ① 录音上传 → 转写文本（multipart file 字段名 audio）
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  async transcribe(@UploadedFile() file?: Express.Multer.File) {
    const text = await this.voice.transcribe(file);
    return { text };
  }

  // ② 文本（转写结果或手打）→ 结构化待确认清单
  @Post('parse')
  parse(@Body() dto: ParseDto, @CurrentMember() m: AuthedMember) {
    return this.voice.parse(dto.text, m);
  }

  // ③ 确认后的清单 → 批量入账
  @Post('apply')
  apply(@Body() dto: ApplyDto, @CurrentMember() m: AuthedMember) {
    return this.voice.apply(m, dto);
  }
}
