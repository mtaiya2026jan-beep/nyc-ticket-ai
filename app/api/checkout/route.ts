import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2026-04-30.basil' })

const PLANS = {
  single:      { amount: 4900,  name: '单次申诉',  description: '生成完整申诉书（Word+PDF），一次性使用' },
  solo_annual: { amount: 29900, name: '单店年费版', description: '全年无限申诉+合规提醒，1家门店' },
  biz_annual:  { amount: 99900, name: '机构年费版', description: '全年无限申诉+多店联动+风险预警+仪表盘，最多5家门店' },
}

export async function POST(req: NextRequest) {
  try {
    const { plan, summonsNumber } = await req.json()
    const p = PLANS[plan as keyof typeof PLANS]
    if (!p) return NextResponse.json({ error: '无效套餐' }, { status: 400 })

    const origin = req.headers.get('origin') || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: p.amount,
          product_data: { name: p.name, description: p.description },
        },
        quantity: 1,
      }],
      metadata: { summonsNumber: summonsNumber || '', plan },
      success_url: `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/?payment=cancelled`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: (err as any).message }, { status: 500 })
  }
}
