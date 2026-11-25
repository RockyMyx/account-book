import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { join, resolve } from 'path';
import { existsSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet.default());
  app.use(cookieParser.default());

  const isProd = process.env.NODE_ENV === 'production';

  // CORS：默认允许本地前端开发端口，生产环境通过 CORS_ORIGIN 配置域名
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.enableCors({
    origin: corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true }),
  );

  // 生产环境：前端生产请求带 /api 前缀；开发环境仍由 Vite 代理去掉前缀
  if (isProd) {
    app.setGlobalPrefix('api');
  }

  // 生产环境：后端直接托管前端构建产物
  // 用进程工作目录定位，避免 dist 输出层级变化导致路径漂移
  const frontDist = resolve(process.cwd(), '..', 'frontend', 'dist');
  const servingFrontend = isProd && existsSync(frontDist);
  if (servingFrontend) {
    app.useStaticAssets(frontDist, { maxAge: '1h' });

    // 只给前端路由回退 index.html，不碰 /api，也不影响 Nest 的 404
    // 新增加前端页面时，需要同步把 path 加进这个列表
    const spaPaths = [
      '/',
      '/bind',
      '/add',
      '/reports',
      '/stats',
      '/family',
      '/categories',
    ];
    app.getHttpAdapter().getInstance().get(
      spaPaths,
      (_req: any, res: any) => res.sendFile(join(frontDist, 'index.html')),
    );
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`家庭记账本 API 已启动：http://localhost:${port}`);
}
bootstrap();
