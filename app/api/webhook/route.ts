import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// plan -> 允许的最大门店数
const PLAN_STORE_LIMITS: Record<string, number> = {
  single:       0,  // 单次申诉，无门店权限
  solo_annual:  1,
  biz_annual:   5,
}

export async function POST(req: NextRequest) {
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

    // 读取 plan（checkout 已在 metadata 里传入）
    const plan = session.metadata?.plan || 'single'
    const storeLimit = PLAN_STORE_LIMITS[plan] ?? 0

    // 1. 写入 paid_sessions（含 plan）
    await supabase.from('paid_sessions').insert({
      session_id: session.id,
      customer_email: session.customer_details?.email,
      amount: session.amount_total,
      plan,
      paid_at: new Date().toISOString(),
    })
    console.log('付款成功已记录:', session.id, 'plan:', plan)

    // 2. 写入 / 更新 user_plans（通过 email 查 user_id）
    const email = session.customer_details?.email
    if (email && plan !== 'single') {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single()

      if (userData?.id) {
        await supabase.from('user_plans').upsert({
          user_id: userData.id,
          plan,
          store_limit: storeLimit,
          activated_at: new Date().toISOString(),
        })
        console.log('用户plan已更新:', email, plan, '门店上限:', storeLimit)
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
