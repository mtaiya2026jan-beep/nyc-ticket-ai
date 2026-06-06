'use client'
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AuthModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: (user: any) => void }) {
  const [mode, setMode] = useState<'login'|'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handle = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    if (mode === 'register') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('注册成功！请查收邮件验证账号后登录。')
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else { onSuccess(data.user); onClose() }
    }
    setLoading(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#1a1a1a', border:'1px solid #333', borderRadius:12, padding:32, width:360 }}>
        <h2 style={{ color:'#fff', marginBottom:20, fontSize:20 }}>{mode === 'login' ? '登录账号' : '注册账号'}</h2>
        <input placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)}
          style={{ width:'100%', padding:'10px 12px', background:'#2a2a2a', border:'1px solid #444', borderRadius:8, color:'#fff', marginBottom:12, boxSizing:'border-box' }} />
        <input placeholder="密码" type="password" value={password} onChange={e => setPassword(e.target.value)}
          style={{ width:'100%', padding:'10px 12px', background:'#2a2a2a', border:'1px solid #444', borderRadius:8, color:'#fff', marginBottom:16, boxSizing:'border-box' }} />
        {error && <p style={{ color:'#ff4444', marginBottom:12, fontSize:14 }}>{error}</p>}
        {message && <p style={{ color:'#44ff88', marginBottom:12, fontSize:14 }}>{message}</p>}
        <button onClick={handle} disabled={loading}
          style={{ width:'100%', padding:'12px', background:'#c8f135', color:'#000', border:'none', borderRadius:8, fontWeight:'bold', cursor:'pointer', marginBottom:12 }}>
          {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
        </button>
        <p style={{ color:'#888', fontSize:14, textAlign:'center', cursor:'pointer' }}
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? '没有账号？点此注册' : '已有账号？点此登录'}
        </p>
        <p style={{ color:'#555', fontSize:14, textAlign:'center', cursor:'pointer', marginTop:8 }} onClick={onClose}>关闭</p>
      </div>
    </div>
  )
}
