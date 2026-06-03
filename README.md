# NYC Ticket AI

**纽约行政处罚单 AI 智能分析平台**  
Claude + Supabase + Next.js → Vercel 一键部署

---

## 10 分钟上线指南

### 第一步：准备代码（2 分钟）

```bash
# 在你的电脑终端执行（需要安装 Node.js 18+）
cd nyc-ticket-ai
npm install
```

把 `.env.example` 复制为 `.env.local`，填入三个值：
```
NEXT_PUBLIC_SUPABASE_URL=https://你的项目ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon key
ANTHROPIC_API_KEY=sk-ant-你的key
```

本地测试：
```bash
npm run dev
# 打开 http://localhost:3000
```

---

### 第二步：上传到 GitHub（2 分钟）

1. 去 github.com，新建一个私有仓库，名字 `nyc-ticket-ai`
2. 在终端执行：
```bash
git init
git add .
git commit -m "NYC Ticket AI v1.0"
git remote add origin https://github.com/你的用户名/nyc-ticket-ai.git
git push -u origin main
```

---

### 第三步：Vercel 部署（3 分钟）

1. 打开 **vercel.com**，用 GitHub 账号登录
2. 点击 **"Add New Project"**
3. 选择刚才的 `nyc-ticket-ai` 仓库
4. 在 **"Environment Variables"** 里填入三个变量：
   - `NEXT_PUBLIC_SUPABASE_URL` → 你的 Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → 你的 anon key
   - `ANTHROPIC_API_KEY` → 你的 Claude API key
5. 点击 **"Deploy"**
6. 等待约 90 秒，获得 `https://nyc-ticket-ai-xxx.vercel.app` 域名

---

### 第四步：Supabase 权限确认（3 分钟）

确保 `hearing_cases` 表开启了 Row Level Security (RLS) 的读取权限：

在 Supabase Dashboard > SQL Editor 执行：
```sql
-- 允许匿名用户读取（前端查询用）
create policy "Allow public read" on hearing_cases
  for select using (true);

-- 如果 RLS 未开启
alter table hearing_cases enable row level security;
```

---

## 项目结构

```
nyc-ticket-ai/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts   ← Claude 分析接口
│   │   └── cases/route.ts     ← 看板统计接口
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               ← 主界面（全部 UI）
├── lib/
│   └── supabase.ts            ← 数据库查询逻辑
├── .env.example               ← 环境变量模板
└── vercel.json
```

---

## 核心数据流

```
用户输入 agency + violation_code
  ↓
/api/analyze 接口
  ↓
queryTicketData() → Supabase hearing_cases 表
  ↓ (返回真实统计：撤销率、平均罚款、辩护样本)
Claude claude-sonnet-4-20250514
  ↓ (结合真实数据生成中文分析)
JSON 结构化输出
  ↓
前端渲染：案件判断 / 历史分布 / 处理建议 / 风险提示
```

---

## 下一步扩展

- **Stripe 接入**：在 `/app/api/checkout/route.ts` 添加支付接口
- **用户登录**：用 Supabase Auth，限制免费用户次数
- **申诉材料生成**：新增 `/api/generate-appeal/route.ts`
- **图片 OCR**：用 Claude Vision 解析罚单照片

---

**联系**：Telegram Bot `@nyc_ticket_ai_bot` 仍可同步运行，两个渠道互补。
