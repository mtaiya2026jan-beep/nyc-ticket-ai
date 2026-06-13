import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// 普通客户端（用于读写数据表）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Admin客户端（用于创建Auth用户、发Magic Link）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PLAN_STORE_LIMITS: Record<string, number> = {
  single:      0,
  solo_annual: 1,
  biz_annual:  5,
}

export async function POST(req: NextRequest) {
  console.log('[WEBHOOK] ========== 收到 Stripe Webhook ==========')
  console.log('[WEBHOOK] RESEND_API_KEY 存在:', !!process.env.RESEND_API_KEY)
  console.log('[WEBHOOK] SUPABASE_URL 存在:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('[WEBHOOK] SERVICE_ROLE_KEY 存在:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

  const resend = new Resend(process.env.RESEND_API_KEY!)
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
    console.log('[WEBHOOK] Stripe 签名验证通过, event.type:', event.type)
  } catch (err: any) {
    console.error('[WEBHOOK] Stripe 签名验证失败:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const plan = session.metadata?.plan || 'single'
    const storeLimit = PLAN_STORE_LIMITS[plan] ?? 0
    const email = session.customer_details?.email

    console.log('[WEBHOOK] checkout.session.completed — session_id:', session.id)
    console.log('[WEBHOOK] plan:', plan, '| email:', email)

    // 1. 写入 paid_sessions
    const { error: paidErr } = await supabase.from('paid_sessions').insert({
      session_id: session.id,
      customer_email: email,
      amount: session.amount_total,
      plan,
      paid_at: new Date().toISOString(),
    })
    if (paidErr) console.error('[WEBHOOK] paid_sessions 写入失败:', paidErr.message)
    else console.log('[WEBHOOK] paid_sessions 写入成功')

    // 2. 创建账户 / 更新 user_plans + 发 Magic Link
    if (!email) {
      console.error('[WEBHOOK] email 为空，跳过账户创建和 Magic Link')
    } else {
      // 查是否已有 Auth 用户
      const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers()
      if (listErr) console.error('[WEBHOOK] listUsers 失败:', listErr.message)

      const users = listData?.users || []
      console.log('[WEBHOOK] 当前 Auth 用户总数:', users.length)
      const existingUser = users.find(u => u.email === email)

      let userId: string | undefined

      if (existingUser) {
        userId = existingUser.id
        console.log('[WEBHOOK] 已有用户 uid:', userId)
      } else {
        console.log('[WEBHOOK] 新用户，开始创建...')
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
        })
        if (createError || !newUser?.user) {
          console.error('[WEBHOOK] 创建用户失败:', createError?.message)
        } else {
          userId = newUser.user.id
          console.log('[WEBHOOK] 新用户已创建 uid:', userId)
        }
      }

      // 更新 user_plans（年费套餐）
      if (plan !== 'single' && userId) {
        const { error: planErr } = await supabase.from('user_plans').upsert({
          user_id: userId,
          plan,
          store_limit: storeLimit,
          activated_at: new Date().toISOString(),
        })
        if (planErr) console.error('[WEBHOOK] user_plans upsert 失败:', planErr.message)
        else console.log('[WEBHOOK] user_plans 已更新:', email, plan)
      }

      // 3. 生成 Magic Link
      console.log('[WEBHOOK] 开始生成 Magic Link, email:', email)
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ask-sophia.com'
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: `${siteUrl}/dashboard` },
      })

      if (linkError) {
        console.error('[WEBHOOK] generateLink 失败:', linkError.message, '| code:', linkError.status)
      } else {
        console.log('[WEBHOOK] generateLink 成功, linkData keys:', Object.keys(linkData ?? {}))
        const props = (linkData as any)?.properties
        console.log('[WEBHOOK] properties keys:', props ? Object.keys(props) : 'null')
        const actionLink = props?.action_link
        console.log('[WEBHOOK] action_link:', actionLink ? actionLink.slice(0, 80) + '...' : '⚠️ 为空！')

        if (!actionLink) {
          console.error('[WEBHOOK] action_link 为空，无法发送邮件')
        } else {
          // 4. 用 Resend 发送邮件
          // ⚠️ onboarding@resend.dev 仅限发给 Resend 账户自己的邮箱（测试用）
          // 生产上线需在 Resend 验证自定义域名，并将 from 改为 noreply@yourdomain.com
          console.log('[WEBHOOK] 准备发送 Resend 邮件 → to:', email)
          console.log('[WEBHOOK] from: noreply@ask-sophia.com')

          let sendResult: any
          try {
            sendResult = await resend.emails.send({
              from: 'noreply@ask-sophia.com',
              to: email,
              subject: '登录 NYC Ticket AI — 点击链接一键登录',
              html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
                  <h2 style="margin-bottom:8px">NYC Ticket AI</h2>
                  <p style="color:#555;margin-bottom:24px">您的付款已确认，点击下方按钮登录查看申诉进度：</p>
                  <a href="${actionLink}"
                     style="display:inline-block;padding:12px 28px;background:#f5a623;color:#000;
                            text-decoration:none;border-radius:8px;font-weight:600">
                    一键登录 Dashboard
                  </a>
                  <p style="color:#999;font-size:12px;margin-top:24px">
                    链接15分钟内有效，仅限单次使用。
                  </p>
                </div>
              `,
            })
          } catch (e: any) {
            console.error('[WEBHOOK] Resend 发送异常:', e.message)
            sendResult = null
          }

          if (!sendResult) {
            console.error('[WEBHOOK] Resend 返回 null')
          } else if (sendResult.error) {
            console.error('[WEBHOOK] Resend 发送失败:', JSON.stringify(sendResult.error))
          } else {
            console.log('[WEBHOOK] ✅ Resend 发送成功 email_id:', sendResult.data?.id)
          }
        }
      }
    }

    // 5. 从 pending_appeals 转移到正式 appeals 表
    const { data: pending } = await supabase
      .from('pending_appeals')
      .select('*')
      .eq('session_id', session.id)
      .single()

    if (pending) {
      await supabase.from('appeals').insert({
        user_id: pending.user_id || null,
        session_id: session.id,
        summons_number: pending.summons_number || null,
        appeal_text: pending.appeal_text,
        created_at: new Date().toISOString(),
      })
      await supabase.from('pending_appeals').delete().eq('session_id', session.id)
      console.log('[WEBHOOK] pending_appeal 已转移')
    }

    console.log('[WEBHOOK] ========== 处理完成 ==========')
  }

  return NextResponse.json({ received: true })
}
