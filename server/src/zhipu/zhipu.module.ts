import { Global, Module } from '@nestjs/common';
import { ZhipuService } from './zhipu.service';
import { AzureSpeechService } from './azure-speech.service';

@Global()
@Module({
  providers: [ZhipuService, AzureSpeechService],
  exports: [ZhipuService, AzureSpeechService],
})
export class ZhipuModule {}
