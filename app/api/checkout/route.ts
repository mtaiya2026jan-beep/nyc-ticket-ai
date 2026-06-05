import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })

const PLANS = {
  basic:       { amount: 100,  name: '基础版 · 单次申诉',  description: '生成完整申诉书（Word+PDF）' },
  pro:         { amount: 9900,  name: '专业版 · 单次申诉',  description: '申诉书+听证手册+优先处理' },
  monthly:     { amount: 7900,  name: '基础版 · 月订阅',    description: '每月无限次分析' },
  pro_monthly: { amount: 14900, name: '专业版 · 月订阅',    description: '每月无限次+所有功能' },
}

export async function POST(req: NextRequest) {
  try {
    const { plan, summonsNumber } = await req.json()
    const p = PLANS[plan as keyof typeof PLANS]
    if (!p) return NextResponse.json({ error: '无效套餐' }, { status: 400 })

    const isSubscription = plan.includes('monthly')
    const origin = req.headers.get('origin') || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: p.amount,
          product_data: { name: p.name, description: p.description },
          ...(isSubscription ? { recurring: { interval: 'month' } } : {}),
        },
        quantity: 1,
      }],
      metadata: { summonsNumber: summonsNumber || '', plan },
      success_url: `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/?payment=cancelled`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
