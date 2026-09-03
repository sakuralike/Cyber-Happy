# 赛博鱼乐 · 运营与技术管理后台

面向内部运营与技术人员的管理后台，覆盖 APP 版本管理、YOLO 模型管理、用户误报管理、数据看板四大核心模块，并内置账号鉴权与关键操作日志。

> 配套设计文档：`赛博鱼乐管理后台 · 系统设计说明书.html`（功能结构 / 数据模型 / 接口契约 / 技术栈）。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 + Vite 5 + TypeScript + Ant Design 5 + TanStack Query + Recharts + React Router |
| 后端 | Node.js 20+ + TypeScript + Fastify 4 + Prisma 5 |
| 数据库 | SQLite（默认，零配置；可一行切换 PostgreSQL） |
| 鉴权 | JWT（`@fastify/jwt`），登录失败锁定、角色 + 权限点双控 |
| 文件 | 本地流式落盘，内容寻址（SHA-256 命名） |
| 调度 | 内置下发单调度器（演示模拟，生产可替换真实长连接推送） |

## 目录结构

```
cyberfish-admin/
├── package.json               # npm workspaces 根
├── server/                    # 后端
│   ├── prisma/
│   │   ├── schema.prisma      # 数据模型（12 张表；枚举以 String 承载，值域见 src/lib/enums.ts）
│   │   └── seed.ts            # 演示数据种子
│   └── src/
│       ├── app.ts             # Fastify 装配
│       ├── index.ts           # 入口 + 下发调度器
│       ├── config/            # 环境配置（.env 加载）
│       ├── lib/               # prisma / errors / query / hash / storage / serialize…
│       ├── plugins/           # auth(鉴权) / audit(审计) / error-handler
│       ├── modules/           # auth / admin / file / app-version / model / misreport / dashboard / audit-log
│       └── jobs/              # dispatch-worker 下发调度器
└── web/                       # 前端
    └── src/
        ├── api/               # 类型 + 各模块 API 封装
        ├── store/             # AuthProvider
        ├── components/        # AppLayout / EnumTag / FileUpload / Guards
        ├── pages/             # 登录 / 看板 / 版本 / 模型 / 误报 / 日志 / 账号
        └── utils/             # 枚举映射 + 格式化
```

## 快速开始

```bash
# 1. 安装依赖（workspaces）
npm install

# 2. 初始化数据库 + 生成 Prisma Client + 写入演示数据
cd server
npm run db:push
npm run db:seed

# 3. 启动后端（:3001）
npm run dev
# 或根目录同时启动前后端
cd .. && npm run dev
```

前端开发服务器默认 `http://localhost:5173`，已配置代理将 `/api`、`/files` 转发到后端 `:3001`。

## 演示账号

| 账号 | 密码 | 角色 | 权限 |
|---|---|---|---|
| admin | admin123 | 管理员 | 全部 |
| operator | operator123 | 运营 | 版本/模型/误报读写、下发 |
| reviewer | reviewer123 | 复核员 | 误报复核 |
| viewer | viewer123 | 只读 | 仅查看 |

## 常用命令

```bash
npm run dev          # 前后端并行开发
npm run build        # 前端 + 后端构建
npm run typecheck    # 前后端类型检查
npm run db:reset     # 重置数据库并重新灌入演示数据
npm run db:studio    # Prisma Studio 可视化查看数据
```

## 生产部署要点

- 将 `server/prisma/schema.prisma` 的 `provider` 改为 `postgresql` 并更新 `DATABASE_URL`，业务代码零改动。
- 修改 `.env` 中的 `JWT_SECRET`、`APP_API_TOKEN`、`CORS_ORIGIN`。
- 前端 `npm run build` 产物位于 `web/dist`，用 Nginx 静态托管并反向代理 `/api`、`/files` 到后端。
- `server/src/jobs/dispatch-worker.ts` 为演示模拟下发，生产替换为真实推送通道（接口契约不变）。

## 接口约定

- 统一响应包裹：`{ code, message, data, requestId }`，`code === 0` 表示成功。
- 列表接口统一返回：`{ list, pagination: { page, pageSize, total, totalPages } }`。
- 鉴权：后台接口走 `Authorization: Bearer <JWT>`；APP 端接口（`/app-versions/check`、`/models/check`、`/misreports` 上报等）走 `X-App-Token`。
- 关键写操作自动落审计日志（`AuditLog`），支持按模块/动作/结果筛选与详情查看。
