import { NextResponse } from 'next/server'
import { getDashboardStats } from '@/lib/supabase'

export async function GET() {
  try {
    const stats = await getDashboardStats()
    if (!stats) {
      return NextResponse.json({ error: '无法获取统计数据' }, { status: 500 })
    }
    return NextResponse.json({ success: true, stats })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
