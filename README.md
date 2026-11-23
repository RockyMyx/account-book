# 家庭记账本

多成员免登录的家庭记账 PWA：语音智能记账 + 公司财务三张表（利润表 / 资产负债表 / 现金流量表）逻辑。科目命名沿用《家庭财务三张表.xlsx》原文。

## 技术栈

- 前端：Vue 3 + TypeScript + Vite + Vant 4（蓝色科技风主题）
- 后端：Node.js 20+ + NestJS + Prisma + SQLite（WAL 模式）
- 部署：Docker Compose + Caddy HTTPS（M5）

## 本地开发

```bash
# 服务端（端口 3001；本机 3000 已有其他服务）
cd server
cp .env.example .env      # 填 JWT_SECRET（随机串）等
npm install
npx prisma migrate deploy
npx ts-node prisma/seed.ts   # 预置 17 个 Excel 科目
npm run start:dev

# 前端（端口 5173，/api 代理到 3001）
cd frontend
npm install
npm run dev
```

首次访问 http://localhost:5173 会进入初始化引导：设置家庭名和管理员昵称，生成 6 位家庭码；家人用家庭码 + 昵称绑定各自设备，之后免登录。

## 配置说明

- 本地配置一律放 `.env`（已在 .gitignore，不提交）；模板见 `server/.env.example`
- 需要配置：`JWT_SECRET`（令牌签名密钥）、`ZHIPU_API_KEY`（语音记账，M2 起）

## 里程碑

- [x] M1 基础骨架：家庭码认证 + 手动记账 + 流水 + 月度汇总（Excel 口径）
- [ ] M2 语音记账：录音 → ASR → GLM 解析 → 待确认清单
- [ ] M3 三张表：规则引擎 + 资产负债/现金流页面 + 自动勾稽
- [ ] M4 统计增强：图表 + 财务健康指标 + 预算
- [ ] M5 部署上线：Docker 化 + HTTPS + 每日备份
