import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  console.log('[WEBHOOK] ========== 收到 Stripe Webhook ==========')

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

    // 2. 从 pending_appeals 转移到正式 appeals 表
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
