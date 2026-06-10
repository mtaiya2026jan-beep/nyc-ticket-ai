'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const PLAN_LABELS: Record<string, string> = {
  single: 'Single Appeal',
  solo_annual: 'Solo Annual ($299/yr)',
  biz_annual: 'Business Annual ($999/yr)',
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [appeals, setAppeals] = useState<any[]>([])
  const [plan, setPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/'
        return
      }
      setUser(session.user)

      // 获取申诉记录
      const { data: appealData } = await supabase
        .from('appeals')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
      setAppeals(appealData || [])

      // 获取套餐
      const { data: planData } = await supabase
        .from('user_plans')
        .select('plan')
        .eq('user_id', session.user.id)
        .single()
      setPlan(planData?.plan || null)

      setLoading(false)
    }
    init()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#fff' }}>
      Loading...
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #222', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>🗽 NYC Ticket AI</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#888', fontSize: 14 }}>{user?.email}</span>
          <button onClick={handleSignOut} style={{ background: '#222', border: '1px solid #444', color: '#fff', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
        {/* Plan Badge */}
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 12, padding: '20px 24px', marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#888', fontSize: 13, marginBottom: 4 }}>Your Plan</div>
            <div style={{ fontWeight: 600, fontSize: 16, color: plan ? '#4ade80' : '#fff' }}>
              {plan ? PLAN_LABELS[plan] || plan : 'Single Appeal'}
            </div>
          </div>
          <a href="/" style={{ background: '#fff', color: '#000', padding: '8px 18px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
            + New Appeal
          </a>
        </div>

        {/* Appeals List */}
        <div style={{ marginBottom: 16, fontWeight: 600, fontSize: 16 }}>Appeal History</div>
        {appeals.length === 0 ? (
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#555' }}>
            No appeals yet. <a href="/" style={{ color: '#888' }}>Start your first appeal →</a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {appeals.map((appeal) => (
              <div key={appeal.id} style={{ background: '#111', border: '1px solid #333', borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>
                    {appeal.summons_number ? `Summons #${appeal.summons_number}` : 'Appeal'}
                  </div>
                  <div style={{ color: '#555', fontSize: 13 }}>
                    {new Date(appeal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ color: '#888', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {appeal.appeal_text?.slice(0, 200)}...
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
