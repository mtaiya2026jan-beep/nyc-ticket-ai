import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: stores } = await supabase
    .from('stores')
    .select('*, appeals(count)')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })

  // 同时返回当前 plan 信息，前端可以用来显示剩余名额
  const { data: userPlan } = await supabase
    .from('user_plans')
    .select('plan, store_limit')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    stores: stores || [],
    plan: userPlan?.plan || null,
    store_limit: userPlan?.store_limit ?? 0,
  })
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 检查用户 plan 和当前门店数量
  const { data: userPlan } = await supabase
    .from('user_plans')
    .select('plan, store_limit')
    .eq('user_id', user.id)
    .single()

  const storeLimit = userPlan?.store_limit ?? 0

  if (storeLimit === 0) {
    return NextResponse.json(
      { error: '单次申诉套餐不支持门店管理，请升级为年费套餐' },
      { status: 403 }
    )
  }

  const { count } = await supabase
    .from('stores')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', user.id)

  if ((count ?? 0) >= storeLimit) {
    return NextResponse.json(
      { error: `当前套餐最多支持 ${storeLimit} 家门店，如需更多请升级机构版` },
      { status: 403 }
    )
  }

  const { name, address, borough, zip, phone } = await req.json()
  if (!name || !address) return NextResponse.json({ error: '门店名称和地址必填' }, { status: 400 })

  const { data, error } = await supabase
    .from('stores')
    .insert({ owner_id: user.id, name, address, borough, zip, phone })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ store: data })
}

export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  const { error } = await supabase
    .from('stores')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
