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
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('Webhook签名验证失败:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    const plan = session.metadata?.plan || 'single'
    const storeLimit = PLAN_STORE_LIMITS[plan] ?? 0

    // 1. 写入 paid_sessions
    await supabase.from('paid_sessions').insert({
      session_id: session.id,
      customer_email: session.customer_details?.email,
      amount: session.amount_total,
      plan,
      paid_at: new Date().toISOString(),
    })
    console.log('付款成功已记录:', session.id, 'plan:', plan)

    // 2. 创建账户 / 更新 user_plans + 发 Magic Link
    const email = session.customer_details?.email
    if (email) {
      // 查是否已有 Auth 用户
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers()
      const users = listData?.users || []
      const existingUser = users.find(u => u.email === email)

      let userId: string

      if (existingUser) {
        // 已有账户，直接用
        userId = existingUser.id
        console.log('已有用户:', email)
      } else {
        // 新用户，创建 Auth 账户
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
        })
        if (createError || !newUser.user) {
          console.error('创建用户失败:', createError?.message)
        } else {
          userId = newUser.user.id
          console.log('新用户已创建:', email)
        }
      }

      // 更新 user_plans（年费套餐）
      if (plan !== 'single' && userId!) {
        await supabase.from('user_plans').upsert({
          user_id: userId!,
          plan,
          store_limit: storeLimit,
          activated_at: new Date().toISOString(),
        })
        console.log('用户plan已更新:', email, plan)
      }

      // 发 Magic Link（所有套餐都发，让用户能登录看申诉记录）
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://nycticketai.vercel.app'
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: `${siteUrl}/dashboard`,
        },
      })
      if (linkError) {
        console.error('Magic Link生成失败:', linkError.message)
      } else {
        const actionLink = (linkData as any)?.properties?.action_link
        if (actionLink) {
          // TODO: 生产上线前在 Resend 验证自定义域名，将 from 改为 noreply@yourdomain.com
          const { error: emailError } = await resend.emails.send({
            from: 'onboarding@resend.dev',
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
          if (emailError) {
            console.error('Resend发送失败:', emailError.message)
          } else {
            console.log('Magic Link已通过Resend发送至:', email)
          }
        }
      }
    }

    // 3. 从 pending_appeals 转移到正式 appeals 表
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
    }
  }

  return NextResponse.json({ received: true })
}
