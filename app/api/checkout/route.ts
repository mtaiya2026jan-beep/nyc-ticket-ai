import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const PLANS = {
  single:      { amount: 4900,  name: 'Single Appeal',   description: 'One-time appeal letter (Word+PDF)' },
  solo_annual: { amount: 29900, name: 'Solo Annual',      description: 'Unlimited appeals for 1 location, 1 year' },
  biz_annual:  { amount: 99900, name: 'Business Annual',  description: 'Unlimited appeals for up to 5 locations, 1 year' },
}

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2026-05-27.dahlia' })
    const { plan, summonsNumber } = await req.json()
    const p = PLANS[plan as keyof typeof PLANS]
    if (!p) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

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
