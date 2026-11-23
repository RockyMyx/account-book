import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { join } from 'path';
import { existsSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet.default());
  app.use(cookieParser.default());

  // CORS：默认允许本地前端开发端口，生产环境通过 CORS_ORIGIN 配置域名
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.enableCors({
    origin: corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true }),
  );

  // 生产环境：直接托管前端构建产物（dist 单容器部署）
  const frontDist = join(__dirname, '..', '..', 'frontend', 'dist');
  if (process.env.NODE_ENV === 'production' && existsSync(frontDist)) {
    app.useStaticAssets(frontDist, { maxAge: '1h' });
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`家庭记账本 API 已启动：http://localhost:${port}`);
}
bootstrap();
