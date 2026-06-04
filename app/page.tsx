'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { exportAppealAsDocx, exportAppealAsPdf } from "@/lib/exportAppeal"

type ViolationResult = {
  violation_code: string
  line_item: number
  law_violated: string
  hasDbData: boolean
  analysis: {
    violationTitle: string
    violationTitleCN: string
    severity: string
    baseFineRange: string
    avgFinalPenalty: number | null
    dismissRate: number | null
    reducedRate: number | null
    upheldRate: number | null
    totalHistoricalCases: number
    caseJudgment: string
    description: string
    strategies: string[]
    risks: { level: string; text: string }[]
    estimatedSaving: string
    urgentActions: string
  }
}

type ScanResult = {
  agency: string
  summons_number: string
  hearing_date: string | null
  business_name: string | null
  place_of_occurrence: string | null
  violations: { line_item: number; violation_code: string; law_violated: string; description: string }[]
  confidence: number
}

const QUICK_CASES = [
  { agency: 'DOHMH', code: '02A', desc: '食品温度不合格', sev: 'Critical' },
  { agency: 'DOHMH', code: '04M', desc: '发现鼠患迹象', sev: 'Critical' },
  { agency: 'DOHMH', code: '10B', desc: '设备清洁不合格', sev: 'Major' },
  { agency: 'DOB', code: '28-06', desc: '建筑无证施工', sev: 'Critical' },
]

const sevColor = (s: string) => s==='Critical'?'var(--red)':s==='Major'?'var(--amber)':'var(--green)'
const riskIcon = (l: string) => l==='danger'?'alert-circle':l==='warning'?'alert-triangle':'circle-check'
const riskColor = (l: string) => l==='danger'?'var(--red)':l==='warning'?'var(--amber)':'var(--green)'

// 将 YYYY-MM-DD 转为美国格式 MM/DD/YYYY
function toUSDate(dateStr: string): string {
  if (!dateStr) return ''
  // already in US format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) return dateStr
  // from HTML date input: YYYY-MM-DD
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${parseInt(m[2])}/${parseInt(m[3])}/${m[1]}`
  return dateStr
}

// 将 MM/DD/YYYY 或 YYYY-MM-DD 转为 input[type=date] 需要的 YYYY-MM-DD
function toInputDate(dateStr: string): string {
  if (!dateStr) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`
  return dateStr
}

function HomeContent() {
  const [tab, setTab] = useState<'analyze'|'dashboard'|'pricing'>('analyze')
  const [agency, setAgency] = useState('')
  const [code, setCode] = useState('')
  const [summons, setSummons] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [placeOfOccurrence, setPlaceOfOccurrence] = useState('')
  const [hearingDate, setHearingDate] = useState('') // stored as YYYY-MM-DD for input
  const [fieldConfidence, setFieldConfidence] = useState<Record<string,number>>({})
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadStep, setLoadStep] = useState(0)
  const [multiResults, setMultiResults] = useState<ViolationResult[]>([])
  const [singleResult, setSingleResult] = useState<any>(null)
  const [hasDbData, setHasDbData] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [error, setError] = useState('')
  const [modalContent, setModalContent] = useState('')
  const [modalTitle, setModalTitle] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [isPaid, setIsPaid] = useState(false)

  const searchParams = useSearchParams()
  useEffect(() => {
    const payment = searchParams.get('payment')
    if (payment === 'success') {
      sessionStorage.setItem('isPaid', 'true')
      setIsPaid(true)
      window.history.replaceState({}, '', '/')
    } else {
      if (sessionStorage.getItem('isPaid') === 'true') {
        setIsPaid(true)
      }
    }
  }, [searchParams])
  const [scanning, setScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string|null>(null)
  const [scanSuccess, setScanSuccess] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scannedViolations, setScannedViolations] = useState<any[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const evidenceInputRef = useRef<HTMLInputElement>(null)

  // 问卷 state
  const [showQuestionnaire, setShowQuestionnaire] = useState(false)
  const [questionnaire, setQuestionnaire] = useState<Record<string, string>>({})
  const [evidenceFiles, setEvidenceFiles] = useState<{name: string; base64: string; type: string}[]>([])
  const [storeHistory, setStoreHistory] = useState({pastViolations: '', allRemediated: ''})
  const [hearingManualLoading, setHearingManualLoading] = useState(false)

  const handleScanMultiPage = async (files: File[]) => {
    if (files.length === 1) {
      handleScan(files[0])
      return
    }
    // 多页：转base64后一起发给scan
    setScanError(''); setScanSuccess(false); setScanning(true)
    try {
      const toBase64 = (f: File) => new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res((r.result as string).split(',')[1])
        r.onerror = rej
        r.readAsDataURL(f)
      })
      const pages = await Promise.all(files.map(async f => ({
        base64: await toBase64(f),
        mimeType: f.type
      })))
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ pages })
      })
      const data = await res.json()
      if (!res.ok || !data.success) { setScanError(data.error || '识别失败'); return }
      const r = data.result
        const val = (f) => (f && typeof f === "object" ? f.value : f)
        const conf = (f) => (f && typeof f === "object" ? f.confidence : null)
        if (val(r.summons_number)) setSummons(val(r.summons_number))
        if (val(r.business_name)) setBusinessName(val(r.business_name))
        if (val(r.place_of_occurrence)) setPlaceOfOccurrence(val(r.place_of_occurrence))
        const ag = val(r.agency)
        if (ag) setAgency(ag)
        if (val(r.hearing_date)) setHearingDate(val(r.hearing_date))
        setFieldConfidence(p => ({...p,
          summons: conf(r.summons_number) ?? p.summons,
          business_name: conf(r.business_name) ?? p.business_name,
          hearing_date: conf(r.hearing_date) ?? p.hearing_date,
          place_of_occurrence: conf(r.place_of_occurrence) ?? p.place_of_occurrence,
        }))
        setScannedViolations(r.violations)
        setScanSuccess(true)
        setTimeout(() => runMultiAnalysis(ag || agency, r.violations), 100)
    } catch { setScanError('网络错误') }
    finally { setScanning(false) }
  }

  const handleScan = async (file: File) => {
    setScanError(''); setScanSuccess(false); setScanning(true)
    const reader = new FileReader()
    reader.onload = e => setScanPreview(e.target?.result as string)
    reader.readAsDataURL(file)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/scan', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok || !data.success) { setScanError(data.error || '识别失败'); return }
      const r: ScanResult = data.result
      if (r.agency) setAgency(r.agency.includes('-') ? r.agency.split('-')[0].trim() : r.agency.trim())
      if (r.summons_number) setSummons(r.summons_number)
        if (r.business_name) setBusinessName(r.business_name)
        if (r.place_of_occurrence) setPlaceOfOccurrence(r.place_of_occurrence)
      if (r.hearing_date) {
        // convert to YYYY-MM-DD for input storage
        setHearingDate(toInputDate(r.hearing_date))
      }
      if (r.violations?.length > 0) {
        setCode(r.violations[0].violation_code)
        setScannedViolations(r.violations)
      }
      setScanSuccess(true)
      const ag = r.agency?.includes('-') ? r.agency.split('-')[0].trim() : r.agency?.trim()
      if (ag && r.violations?.length > 0) {
        setTimeout(() => runMultiAnalysis(ag, r.violations), 300)
      }
    } catch { setScanError('网络错误') }
    finally { setScanning(false) }
  }

  const runMultiAnalysis = async (ag: string, violations: any[]) => {
    setLoading(true); setMultiResults([]); setSingleResult(null); setError(''); setLoadStep(1); setActiveTab(0)
    ;[1,2,3,4].forEach((s,i) => setTimeout(() => setLoadStep(s+1), (i+1)*500))
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency: ag, violations }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) { setError(data.error || '分析失败'); return }
      setMultiResults(data.multiResults || [])
    } catch { setError('网络错误') }
    finally { setLoading(false); setLoadStep(0) }
  }

  const runSingleAnalysis = async (overrideAgency?: string, overrideCode?: string) => {
    const ag = overrideAgency || agency
    const vc = overrideCode || code
    if (!ag || !vc) { setError('请填写机构和违规代码'); return }
    setLoading(true); setSingleResult(null); setMultiResults([]); setError(''); setLoadStep(1)
    ;[1,2,3,4].forEach((s,i) => setTimeout(() => setLoadStep(s+1), (i+1)*450))
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency: ag, violationCode: vc, summonsNumber: summons, hearingDate: toUSDate(hearingDate), description }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) { setError(data.error || '分析失败'); return }
      setSingleResult(data.analysis); setHasDbData(data.hasDbData)
    } catch { setError('网络错误') }
    finally { setLoading(false); setLoadStep(0) }
  }

  const runHearingManual = async () => {
    if (!multiResults.length) return
    setModalTitle('听证准备手册'); setModalContent(''); setModalLoading(true); setShowModal(true)
    setHearingManualLoading(true)
    try {
      const res = await fetch('/api/hearing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          violations: scannedViolations,
          questionnaire,
          business_name: businessName,
        }),
      })
      const data = await res.json()
      setModalContent(data.content || data.error || '生成失败')
    } catch { setModalContent('网络错误') }
    finally { setModalLoading(false); setHearingManualLoading(false) }
  }

  const handleCheckout = async (plan) => {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ plan, summonsNumber: summons })
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else alert("支付初始化失败：" + data.error)
  }

  const runFullAppeal = async () => {
    if (!multiResults.length) return
    // 先弹问卷
    setShowQuestionnaire(true)
  }

  const submitAppealWithQuestionnaire = async () => {
    setShowQuestionnaire(false)
    setModalTitle('完整申诉书 — 所有违规项'); setModalContent(''); setModalLoading(true); setShowModal(true)
    try {
      const res = await fetch('/api/appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency,
          summons_number: summons,
          hearing_date: hearingDate,
          business_name: businessName,
          place_of_occurrence: placeOfOccurrence,
          violations: scannedViolations,
          results: multiResults.map(r => r.analysis),
          questionnaire,
          evidenceFiles: evidenceFiles.map(f => ({ name: f.name, type: f.type })),
          storeHistory,
        }),
      })
      const data = await res.json()
      setModalContent(data.content || data.error || '生成失败')
    } catch { setModalContent('网络错误') }
    finally { setModalLoading(false) }
  }

  const runMode = async (mode: string, violationCode?: string, violationDescription?: string) => {
    const vc = violationCode || code
    const titles: Record<string,string> = { appeal:'申诉材料', evidence:'证据清单', plan:'整改计划' }
    setModalTitle(`${vc} — ${titles[mode]}`); setModalContent(''); setModalLoading(true); setShowModal(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency, violationCode: vc, mode, description: violationDescription || description }),
      })
      const data = await res.json()
      setModalContent(data.content || data.error || '生成失败')
    } catch { setModalContent('网络错误') }
    finally { setModalLoading(false) }
  }

  const hasResults = multiResults.length > 0 || singleResult

  const ResultCard = ({ r, vc, isDb, desc }: { r: any, vc: string, isDb: boolean, desc?: string }) => (
    <div>
      <div style={{display:'flex', alignItems:'center', gap:12, paddingBottom:14, borderBottom:'1px solid var(--border)', marginBottom:16, flexWrap:'wrap'}}>
        <span style={{fontFamily:'DM Mono', fontSize:11, background:'rgba(110,181,255,0.1)', color:'var(--blue)', border:'1px solid rgba(110,181,255,0.25)', padding:'3px 10px', borderRadius:4}}>{agency}</span>
        <span style={{fontFamily:'Syne', fontWeight:800, fontSize:22}}>{vc}</span>
        <span style={{fontSize:13, color:'var(--text2)', flex:1}}>{r.violationTitle}</span>
        <span style={{fontSize:10, padding:'4px 10px', borderRadius:20, fontFamily:'DM Mono', background:`${sevColor(r.severity)}22`, color:sevColor(r.severity), border:`1px solid ${sevColor(r.severity)}44`}}>{r.severity}</span>
        {isDb && <span style={{fontSize:9, padding:'3px 8px', borderRadius:4, background:'rgba(71,255,154,0.1)', color:'var(--green)', border:'1px solid rgba(71,255,154,0.2)', fontFamily:'DM Mono'}}>真实数据</span>}
      </div>
      <div style={{marginBottom:16, padding:'12px 14px', background:'rgba(232,255,71,0.04)', border:'1px solid rgba(232,255,71,0.12)', borderRadius:8, fontSize:13, color:'var(--text)', lineHeight:1.7}}>
        <span style={{fontFamily:'DM Mono', fontSize:10, color:'var(--accent)', marginRight:8}}>▸ 案件判断</span>{r.caseJudgment}
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14}}>
        {[
          {label:'基础罚款区间', value:r.baseFineRange, sub:'官方标准', color:'var(--amber)'},
          {label:'历史中位罚款（含未申诉）', value:r.avgFinalPenalty?`$${r.avgFinalPenalty}`:'—', sub:`${r.totalHistoricalCases} 案例`, color:'var(--green)'},
          {label:'撤销率', value:r.dismissRate!==null?`${r.dismissRate}%`:'—', sub:'完全免除'},
          {label:'减免率', value:r.reducedRate!==null?`${r.reducedRate}%`:'—', sub:'部分减免'},
        ].map(m=>(
          <div key={m.label} style={{background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px'}}>
            <div style={{fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4}}>{m.label}</div>
            <div style={{fontFamily:'Syne', fontWeight:700, fontSize:18, color:m.color||'var(--text)'}}>{m.value}</div>
            <div style={{fontSize:9, color:'var(--text3)', marginTop:2}}>{m.sub}</div>
          </div>
        ))}
      </div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14}}>
        <div style={{background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:12}}>
          <div style={{fontFamily:'DM Mono', fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8}}>
            <i className="ti ti-chart-pie" style={{color:'var(--blue)', marginRight:5}} aria-hidden />历史分布
          </div>
          {r.dismissRate!==null && <>
            <div style={{display:'flex', borderRadius:3, overflow:'hidden', height:5, gap:2, marginBottom:6}}>
              <div style={{background:'var(--green)', flex:r.dismissRate, borderRadius:2}} />
              <div style={{background:'var(--amber)', flex:r.reducedRate||0, borderRadius:2}} />
              <div style={{background:'var(--red)', flex:r.upheldRate||0, borderRadius:2}} />
            </div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              {[['var(--green)',`撤 ${r.dismissRate}%`],['var(--amber)',`减 ${r.reducedRate}%`],['var(--red)',`维 ${r.upheldRate}%`]].map(([c,l])=>(
                <div key={l as string} style={{display:'flex', alignItems:'center', gap:4, fontSize:9, color:'var(--text2)'}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:c as string}} />{l}
                </div>
              ))}
            </div>
          </>}
          <div style={{marginTop:8, paddingTop:8, borderTop:'1px solid var(--border)', fontSize:11, color:'var(--text)', lineHeight:1.5}}>
            <span style={{fontFamily:'DM Mono', fontSize:9, color:'var(--amber)', marginRight:5}}>⚡</span>{r.urgentActions}
          </div>
        </div>
        <div style={{background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:12}}>
          <div style={{fontFamily:'DM Mono', fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8}}>
            <i className="ti ti-list-check" style={{color:'var(--green)', marginRight:5}} aria-hidden />处理建议
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:7}}>
            {r.strategies?.map((s: string, i: number)=>(
              <div key={i} style={{display:'flex', gap:7, fontSize:11, color:'var(--text)', lineHeight:1.5}}>
                <div style={{width:15,height:15,borderRadius:'50%',background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#000',flexShrink:0,marginTop:1}}>{i+1}</div>{s}
              </div>
            ))}
          </div>
        </div>
        <div style={{background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:12}}>
          <div style={{fontFamily:'DM Mono', fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8}}>
            <i className="ti ti-alert-triangle" style={{color:'var(--red)', marginRight:5}} aria-hidden />风险提示
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:7}}>
            {r.risks?.map((ri: any, i: number)=>(
              <div key={i} style={{display:'flex', gap:7, fontSize:11, color:'var(--text2)', lineHeight:1.5}}>
                <i className={`ti ti-${riskIcon(ri.level)}`} style={{color:riskColor(ri.level),fontSize:13,marginTop:1,flexShrink:0}} aria-hidden />{ri.text}
              </div>
            ))}
          </div>
        </div>
        <div style={{background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:12}}>
          <div style={{fontFamily:'DM Mono', fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8}}>
            <i className="ti ti-coin" style={{color:'var(--amber)', marginRight:5}} aria-hidden />费用预测
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            <div><div style={{fontSize:9, color:'var(--text3)', marginBottom:2}}>原始罚款</div><div style={{fontFamily:'Syne', fontWeight:700, fontSize:16, color:'var(--amber)'}}>{r.baseFineRange}</div></div>
            <div><div style={{fontSize:9, color:'var(--text3)', marginBottom:2}}>撤销可省</div><div style={{fontFamily:'Syne', fontWeight:700, fontSize:16, color:'var(--green)'}}>{r.estimatedSaving}</div></div>
          </div>
        </div>
      </div>
<div style={{display:"flex",gap:8,paddingTop:12,borderTop:"1px solid var(--border)"}}><button onClick={()=>handleCheckout("basic")} style={{flex:1,padding:"9px",borderRadius:8,border:"none",background:"var(--accent)",color:"#000",fontFamily:"Inter",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontWeight:700}}><i className="ti ti-credit-card" aria-hidden /> $49 立即解锁申诉书</button><button onClick={()=>handleCheckout("pro")} style={{flex:1,padding:"9px",borderRadius:8,border:"1px solid rgba(232,255,71,0.25)",background:"rgba(232,255,71,0.08)",color:"var(--accent)",fontFamily:"Inter",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><i className="ti ti-star" aria-hidden /> 专业版 $99</button></div>
      <div style={{display:'flex', gap:8, paddingTop:12, borderTop:'1px solid var(--border)'}}><button onClick={isPaid ? runFullAppeal : () => alert('请先完成支付后再生成申诉书')} disabled={!isPaid} style={{flex:2, padding:'9px', borderRadius:8, border:'1px solid rgba(232,255,71,0.25)', background:'rgba(232,255,71,0.08)', color:'var(--accent)', fontFamily:'Inter', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}><i className="ti ti-file-text" aria-hidden />生成完整申诉书（所有违规项）</button>
        {[{icon:'file-text',label:'申诉材料',primary:true,mode:'appeal'},{icon:'list',label:'证据清单',mode:'evidence'},{icon:'calendar',label:'整改计划',mode:'plan'}].map(btn=>(
          <button key={btn.label} onClick={()=>runMode(btn.mode, vc, desc)} style={{flex:1, padding:'9px', borderRadius:8, border:btn.primary?'1px solid rgba(232,255,71,0.25)':'1px solid var(--border2)', background:btn.primary?'rgba(232,255,71,0.08)':'var(--bg3)', color:btn.primary?'var(--accent)':'var(--text)', fontFamily:'Inter', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
            <i className={`ti ti-${btn.icon}`} aria-hidden />{btn.label}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{display:'flex', height:'100vh', overflow:'hidden'}}>
      {/* ===== 问卷 Modal ===== */}
      {showQuestionnaire && (() => {
        const violationCodes = scannedViolations.map((v: any) => v.violation_code)
        const has02B = violationCodes.some((c: string) => c === '02B')
        const has06C = violationCodes.some((c: string) => c === '06C')
        const has10F = violationCodes.some((c: string) => c === '10F')
        const has2805 = violationCodes.some((c: string) => c === '28-05')

        const q = (key: string, label: string, options?: string[], placeholder?: string) => (
          <div key={key} style={{marginBottom:16}}>
            <label style={{fontSize:12, color:'var(--text2)', display:'block', marginBottom:6, lineHeight:1.5}}>{label}</label>
            {options ? (
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                {options.map(o => (
                  <button key={o} onClick={() => setQuestionnaire(prev => ({...prev, [key]: o}))}
                    style={{padding:'6px 14px', borderRadius:20, fontSize:11, cursor:'pointer', border:'1px solid', borderColor: questionnaire[key]===o ? 'var(--accent)' : 'var(--border2)', background: questionnaire[key]===o ? 'rgba(232,255,71,0.15)' : 'var(--bg3)', color: questionnaire[key]===o ? 'var(--accent)' : 'var(--text2)', fontWeight: questionnaire[key]===o ? 600 : 400}}>
                    {o}
                  </button>
                ))}
              </div>
            ) : (
              <textarea value={questionnaire[key]||''} onChange={e => setQuestionnaire(prev => ({...prev, [key]: e.target.value}))}
                placeholder={placeholder||''} rows={2}
                style={{width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:8, color:'var(--text)', fontSize:12, padding:'8px 10px', outline:'none', resize:'vertical', fontFamily:'inherit'}} />
            )}
          </div>
        )

        const section = (title: string, color: string, children: React.ReactNode) => (
          <div style={{marginBottom:20, paddingBottom:20, borderBottom:'1px solid var(--border)'}}>
            <div style={{fontFamily:'DM Mono', fontSize:10, color, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12}}>▸ {title}</div>
            {children}
          </div>
        )

        return (
          <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.82)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:24}}>
            <div style={{background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:16, width:'100%', maxWidth:680, maxHeight:'88vh', display:'flex', flexDirection:'column'}}>
              {/* Header */}
              <div style={{padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <div>
                  <div style={{fontFamily:'Syne', fontWeight:700, fontSize:15, color:'var(--accent)'}}>当事人情况问卷</div>
                  <div style={{fontSize:11, color:'var(--text3)', marginTop:2}}>填写越详细，申诉书精准度越高（目标 92 分）</div>
                </div>
                <button onClick={() => setShowQuestionnaire(false)} style={{background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:20}}>✕</button>
              </div>

              {/* Body */}
              <div style={{flex:1, overflowY:'auto', padding:20}}>

                {/* 通用基础 10 题 */}
                {section('通用情况（每单必填）', 'var(--text3)', <>
                  {q('priorViolations', '① 过去3年是否有同类违规记录？', ['无', '有1次', '有2次及以上'])}
                  {q('immediatelyRemediated', '② 检查当天是否已立即整改？', ['是，当场整改', '当天整改', '次日整改', '尚未整改'])}
                  {q('willingToAttend', '③ 是否愿意出席听证？', ['是', '否，书面申诉'])}
                  {q('inspectorExtraStatement', '④ 检查员当时是否有额外口头陈述？', ['无', '有'], '如有，请描述...')}
                  {questionnaire['inspectorExtraStatement'] === '有' && q('inspectorExtraDetail', '请描述检查员的具体陈述：', undefined, '例如：检查员表示...')}
                  {q('inspectionType', '⑤ 检查方式？', ['突击检查', '预约检查', '不清楚'])}
                  {q('storeOpenDuringInspection', '⑥ 检查时门店是否正常营业中？', ['是', '否，未营业'])}
                  {q('witnessEmployee', '⑦ 检查时是否有员工在场目击？', ['有', '无'])}
                  {q('hasLegalCounsel', '⑧ 是否已联系律师或合规顾问？', ['否', '是'])}
                  {q('currentRemediationStatus', '⑨ 当前所有违规的整改状态？', ['全部已整改', '部分整改中', '尚未开始'])}
                  {q('hasWrittenProof', '⑩ 是否有书面整改证明（照片/收据/记录）？', ['有', '无'])}
                </>)}

                {/* 证据层 6 题 */}
                {section('实质证据（+5分）', 'var(--green)', <>
                  {q('hasRemedyPhotos', '⑪ 是否有整改前后对比照片/视频？', ['有', '无'])}
                  {q('hasPurchaseReceipts', '⑫ 是否有购买整改设备的收据？（温控设备/防护罩/标签重印等）', ['有', '无'])}
                  {q('hasTrainingRecords', '⑬ 是否有员工食品安全培训记录？', ['有', '无'])}
                  {q('hasSupplierDocs', '⑭ 是否有供应商资质/食品来源证明文件？', ['有', '无'])}
                  {q('hasEquipmentInvoice', '⑮ 是否有设备购置发票（证明设备已更新）？', ['有', '无'])}
                  {q('hasEmployeeTestimony', '⑯ 是否有员工可以出庭作证？', ['有', '无'])}
                  {/* 证据文件上传 */}
                  <div style={{marginBottom:16}}>
                    <label style={{fontSize:12, color:'var(--text2)', display:'block', marginBottom:6}}>上传证据文件（照片/PDF，可多选）</label>
                    <div onClick={() => evidenceInputRef.current?.click()} style={{border:'1px dashed var(--border2)', borderRadius:8, padding:'10px 14px', cursor:'pointer', background:'var(--bg3)', textAlign:'center', fontSize:11, color:'var(--text3)'}}>
                      {evidenceFiles.length > 0
                        ? <span style={{color:'var(--green)'}}>已上传 {evidenceFiles.length} 个文件：{evidenceFiles.map(f=>f.name).join('、')}</span>
                        : '点击上传证据文件（图片/PDF）'}
                    </div>
                    <input ref={evidenceInputRef} type="file" accept="image/*,.pdf" multiple style={{display:'none'}} onChange={async e => {
                      const files = Array.from(e.target.files || [])
                      const toBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1]); r.onerror = rej; r.readAsDataURL(f) })
                      const converted = await Promise.all(files.map(async f => ({ name: f.name, base64: await toBase64(f), type: f.type })))
                      setEvidenceFiles(prev => [...prev, ...converted])
                    }} />
                  </div>
                </>)}

                {/* 程序瑕疵层 4 题 */}
                {section('程序瑕疵（+3分）', 'var(--amber)', <>
                  {q('inspectorShowedId', '⑰ 检查员是否出示了执法证件？', ['是', '否', '不记得'])}
                  {q('inspectionTimeReasonable', '⑱ 检查时间是否合理（非深夜/未营业时段）？', ['正常营业时间', '接近打烊', '营业前', '深夜'])}
                  {q('allowedToSpeak', '⑲ 检查员是否给予当事人陈述机会？', ['给了', '没有'])}
                  {q('ticketSignMethod', '⑳ 罚单签字方式？', ['当场签字', '事后邮寄', '不确定'])}
                </>)}

                {/* 本店历史 2 题 */}
                {section('本店合规历史（+2分）', 'var(--blue)', <>
                  <div style={{marginBottom:16}}>
                    <label style={{fontSize:12, color:'var(--text2)', display:'block', marginBottom:6}}>㉑ 过去3年本店共收到违规罚单几次？</label>
                    <input value={storeHistory.pastViolations} onChange={e => setStoreHistory(prev => ({...prev, pastViolations: e.target.value}))}
                      placeholder="例如：0次 / 1次（已整改）" style={{width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:8, color:'var(--text)', fontSize:12, padding:'8px 10px', outline:'none'}} />
                  </div>
                  <div>
                    <label style={{fontSize:12, color:'var(--text2)', display:'block', marginBottom:6}}>㉒ 过去所有违规是否均已按时整改并提交证明？</label>
                    <div style={{display:'flex', gap:8}}>
                      {['是，全部按时整改', '大部分已整改', '部分未按时'].map(o => (
                        <button key={o} onClick={() => setStoreHistory(prev => ({...prev, allRemediated: o}))}
                          style={{padding:'6px 14px', borderRadius:20, fontSize:11, cursor:'pointer', border:'1px solid', borderColor: storeHistory.allRemediated===o ? 'var(--accent)' : 'var(--border2)', background: storeHistory.allRemediated===o ? 'rgba(232,255,71,0.15)' : 'var(--bg3)', color: storeHistory.allRemediated===o ? 'var(--accent)' : 'var(--text2)'}}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                </>)}

                {/* 02B 专属 */}
                {has02B && section('02B 专属问题（食品温度）', 'var(--red)', <>
                  {q('02B_offDuration', '食品关火/低温保存了多久？', ['30分钟以内', '约1小时', '约2小时', '超过2小时'])}
                  {q('02B_reheated', '被发现后是否立即复热至165°F？', ['是，当场复热', '稍后复热', '未复热'])}
                  {q('02B_foodType', '当时在准备/处理什么食品？', undefined, '例如：茶叶蛋、熟食拼盘...')}
                </>)}

                {/* 06C 专属 */}
                {has06C && section('06C 专属问题（防护/异物）', 'var(--amber)', <>
                  {q('06C_hairLocation', '头发/异物发现位置？', ['顾客自取区', '食品展示柜内', '操作台', '不确定'])}
                  {q('06C_selfServeArea', '涉及区域是否属于顾客自取区？', ['是', '否'])}
                  {q('06C_coverInstalled', '防护罩现已安装？', ['是，已安装', '正在安装', '未安装'])}
                </>)}

                {/* 10F 专属 */}
                {has10F && section('10F 专属问题（积灰/清洁）', 'var(--text3)', <>
                  {q('10F_dustArea', '积灰面积大小？', ['轻微（点状）', '中等（片状）', '较大（大面积）'])}
                  {q('10F_foodContact', '积灰表面是否与食品直接接触？', ['否，非食品接触面', '是'])}
                  {q('10F_lastCleaned', '上次该区域清洁记录？', undefined, '例如：每周清洁，上次为检查前3天...')}
                </>)}

                {/* 28-05 专属 */}
                {has2805 && section('28-05 专属问题（标签合规）', 'var(--blue)', <>
                  {q('2805_productTypes', '违规商品具体种类？', undefined, '例如：酱料、调味品、零食包装...')}
                  {q('2805_productCount', '大约违规商品数量？', ['10件以下', '10-50件', '50-100件', '100件以上'])}
                  {q('2805_labelReason', '只有中文标签的原因？', ['供应商提供时已是中文', '未意识到需要英文', '正在更换中'])}
                  {q('2805_nowReplaced', '现已全部更换为英文标签？', ['是，全部更换', '正在更换', '未更换'])}
                </>)}

              </div>

              {/* Footer */}
              <div style={{padding:'12px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{fontSize:11, color:'var(--text3)'}}>
                  已填 {Object.values(questionnaire).filter(Boolean).length + (storeHistory.pastViolations ? 1 : 0) + (storeHistory.allRemediated ? 1 : 0)} 题
                  {evidenceFiles.length > 0 && <span style={{color:'var(--green)', marginLeft:8}}>· {evidenceFiles.length} 个证据文件</span>}
                </div>
                <div style={{display:'flex', gap:10}}>
                  <button onClick={() => { setShowQuestionnaire(false); submitAppealWithQuestionnaire() }}
                    style={{padding:'8px 12px', borderRadius:8, border:'1px solid var(--border2)', background:'var(--bg3)', color:'var(--text2)', fontSize:12, cursor:'pointer'}}>
                    跳过，直接生成
                  </button>
                  <button onClick={submitAppealWithQuestionnaire}
                    style={{padding:'8px 20px', borderRadius:8, border:'none', background:'var(--accent)', color:'#000', fontSize:12, cursor:'pointer', fontWeight:700}}>
                    ✓ 提交并生成申诉书
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {showModal && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:24}}>
          <div style={{background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:16, width:'100%', maxWidth:700, maxHeight:'80vh', display:'flex', flexDirection:'column'}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--border)'}}>
              <div style={{fontFamily:'Syne', fontWeight:700, fontSize:15, color:'var(--accent)'}}>{modalTitle}</div>
              <button onClick={()=>setShowModal(false)} style={{background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:20}}>✕</button>
            </div>
            <div style={{flex:1, overflowY:'auto', padding:20}}>
              {modalLoading
                ? <div style={{display:'flex', alignItems:'center', gap:12, color:'var(--text3)', padding:40, justifyContent:'center'}}><div className="spinner" style={{width:24,height:24}} /> AI 生成中...</div>
                : <pre style={{whiteSpace:'pre-wrap', fontSize:13, color:'var(--text)', lineHeight:1.8, fontFamily:'Inter'}}>{modalContent}</pre>
              }
            </div>
            <div style={{padding:'12px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', gap:10}}>
              <button onClick={()=>exportAppealAsDocx(modalContent, modalTitle==='听证准备手册' ? 'hearing_manual' : undefined)} style={{padding:'8px 16px', borderRadius:8, border:'none', background:'#2563eb', color:'#fff', fontSize:12, cursor:'pointer', fontWeight:600}}>下载 Word</button><button onClick={()=>{const w=window.open("","_blank");if(w){w.document.write("<html><head><meta charset='utf-8'><title>"+(modalTitle==='听证准备手册'?'听证准备手册':'申诉书')+"</title><style>body{font-family:serif;font-size:12pt;margin:72pt;line-height:1.8}pre{white-space:pre-wrap;font-family:serif}h2{font-size:14pt;margin-top:24pt}strong{font-weight:bold}</style></head><body><h1 style='font-size:16pt;text-align:center'>"+(modalTitle==='听证准备手册'?'听证准备手册':'听证申诉书')+"</h1><pre>"+modalContent+"</pre></body></html>");w.document.close();w.print()}}} style={{padding:'8px 16px', borderRadius:8, border:'none', background:'#dc2626', color:'#fff', fontSize:12, cursor:'pointer', fontWeight:600}}>下载 PDF</button>
                <button onClick={()=>navigator.clipboard.writeText(modalContent).then(()=>alert("已复制到剪贴板！"))} style={{padding:'8px 16px', borderRadius:8, border:'1px solid var(--border2)', background:'var(--bg3)', color:'var(--text)', fontSize:12, cursor:'pointer'}}>复制</button>
              <button onClick={()=>setShowModal(false)} style={{padding:'8px 16px', borderRadius:8, border:'none', background:'var(--accent)', color:'#000', fontSize:12, cursor:'pointer', fontWeight:600}}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div style={{width:220, minWidth:220, background:'var(--bg2)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', padding:'20px 0'}}>
        <div style={{padding:'0 20px 20px', borderBottom:'1px solid var(--border)', marginBottom:16}}>
          <div style={{fontFamily:'Syne', fontWeight:800, fontSize:15, color:'var(--accent)'}}>NYC Ticket AI</div>
          <div style={{fontFamily:'DM Mono', fontSize:9, color:'var(--text3)', letterSpacing:'0.12em', textTransform:'uppercase', marginTop:3}}>POWERED BY SOPHIA OS</div>
        </div>
        <div style={{padding:'0 12px', marginBottom:20}}>
          <div style={{fontFamily:'DM Mono', fontSize:9, color:'var(--text3)', letterSpacing:'0.1em', textTransform:'uppercase', padding:'0 8px', marginBottom:6}}>主功能</div>
          {[{icon:'search',label:'罚单智能分析',t:'analyze',badge:'LIVE'},{icon:'chart-bar',label:'数据看板',t:'dashboard'},{icon:'tag',label:'定价方案',t:'pricing',badge:'NEW'}].map(n=>(
            <div key={n.t} onClick={()=>setTab(n.t as any)} style={{display:'flex', alignItems:'center', gap:9, padding:'8px 10px', borderRadius:8, cursor:'pointer', fontSize:13, marginBottom:2, color:tab===n.t?'var(--accent)':'var(--text2)', background:tab===n.t?'rgba(232,255,71,0.08)':'transparent', border:tab===n.t?'1px solid rgba(232,255,71,0.2)':'1px solid transparent'}}>
              <i className={`ti ti-${n.icon}`} style={{fontSize:15}} aria-hidden /><span style={{flex:1}}>{n.label}</span>
              {n.badge && <span style={{background:n.badge==='LIVE'?'var(--green)':'var(--accent)', color:'#000', fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:20}}>{n.badge}</span>}
            </div>
          ))}
        </div>
        <div style={{padding:'0 12px', marginBottom:20}}>
          <div style={{fontFamily:'DM Mono', fontSize:9, color:'var(--text3)', letterSpacing:'0.1em', textTransform:'uppercase', padding:'0 8px', marginBottom:6}}>业务类型</div>
          {[{icon:'tools-kitchen-2',label:'餐饮卫生 DOHMH',ag:'DOHMH'},{icon:'building',label:'建筑违规 DOB',ag:'DOB'},{icon:'trash',label:'卫生清洁 DSNY',ag:'DSNY'},{icon:'receipt',label:'外卖平台合规',ag:'DCA',badge:'Beta'}].map(n=>(
            <div key={n.ag} onClick={()=>{setAgency(n.ag);setTab('analyze')}} style={{display:'flex', alignItems:'center', gap:9, padding:'8px 10px', borderRadius:8, cursor:'pointer', fontSize:13, marginBottom:2, color:'var(--text2)', border:'1px solid transparent'}}>
              <i className={`ti ti-${n.icon}`} style={{fontSize:15}} aria-hidden /><span style={{flex:1}}>{n.label}</span>
              {(n as any).badge && <span style={{background:'var(--amber)', color:'#000', fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:20}}>{(n as any).badge}</span>}
            </div>
          ))}
        </div>
        <div style={{marginTop:'auto', padding:16, borderTop:'1px solid var(--border)'}}>
          <div style={{background:'rgba(232,255,71,0.08)', border:'1px solid rgba(232,255,71,0.2)', borderRadius:8, padding:'8px 10px'}}>
            <div style={{color:'var(--accent)', fontWeight:500, fontSize:11}}>⚡ 专业版 Pro</div>
            <div style={{color:'var(--text3)', fontSize:10, marginTop:2}}>$99/月 · 无限分析次数</div>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        <div style={{height:56, minHeight:56, background:'var(--bg2)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 24px', gap:16}}>
          <div style={{fontFamily:'Syne', fontWeight:700, fontSize:15}}>{tab==='analyze'?'罚单分析工作台':tab==='dashboard'?'数据看板':'定价方案'}</div>
          <div style={{fontFamily:'DM Mono', fontSize:9, padding:'3px 8px', borderRadius:4, background:'rgba(71,255,154,0.1)', color:'var(--green)', border:'1px solid rgba(71,255,154,0.2)'}}>V1.8 LIVE</div>
          <div style={{marginLeft:'auto', display:'flex', gap:12}}>
            <div style={{display:'flex', alignItems:'center', gap:6, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:6, padding:'5px 10px', fontSize:11, color:'var(--text2)'}}>
              <i className="ti ti-database" style={{fontSize:13}} aria-hidden /> <span style={{color:'var(--text)', fontWeight:500}}>数据库 236万+ 条</span>
            </div>
          </div>
        </div>

        {tab==='analyze' && (
          <div style={{flex:1, overflow:'hidden', display:'flex', gap:20, padding:24}}>
            {/* Left */}
            <div style={{width:320, minWidth:320, display:'flex', flexDirection:'column', gap:14, overflowY:'auto'}}>
              <div style={{background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:16}}>
                <div style={{fontFamily:'DM Mono', fontSize:10, color:'var(--text3)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:12}}>
                  <i className="ti ti-file-text" aria-hidden /> &nbsp;输入罚单信息
                </div>
                {/* 上传区 */}
                <div style={{marginBottom:14}}>
                  <label style={{fontSize:11, color:'var(--text3)', marginBottom:6, display:'block', textTransform:'uppercase', letterSpacing:'0.06em'}}>📷 上传罚单（识别所有违规项）</label>
                  <div onClick={()=>fileInputRef.current?.click()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleScan(f)}} onDragOver={e=>e.preventDefault()}
                    style={{border:`1px dashed ${scanSuccess?'var(--green)':scanning?'var(--accent)':'var(--border2)'}`, borderRadius:8, padding:'12px', textAlign:'center', cursor:'pointer', background:scanning?'rgba(232,255,71,0.04)':scanSuccess?'rgba(71,255,154,0.04)':'var(--bg3)'}}>
                    {scanPreview && <img src={scanPreview} alt="" style={{width:'100%', maxHeight:70, objectFit:'cover', borderRadius:4, marginBottom:6, opacity:0.8}} />}
                    {scanning ? <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:7, color:'var(--accent)', fontSize:12}}><div className="spinner" style={{width:13,height:13}} /> 识别中...</div>
                    : scanSuccess ? (
                      <div>
                        <div style={{fontSize:12, color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', gap:5, marginBottom:4}}><i className="ti ti-check" aria-hidden /> 识别成功</div>
                        {scannedViolations.length > 0 && <div>
                <div style={{fontSize:10, color:'var(--text3)', marginBottom:8}}>发现 {scannedViolations.length} 个违规项 · 请确认描述完整后生成申诉书</div>
                {scannedViolations.map((v: any, i: number) => (
                  <div key={i} style={{marginBottom:8, background:'var(--bg3)', borderRadius:6, padding:'8px 10px', border:'1px solid var(--border)'}}> 
                    <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:4}}>
                      <span style={{fontFamily:'DM Mono', fontSize:10, color:'var(--accent)', background:'rgba(232,255,71,0.08)', padding:'2px 6px', borderRadius:4}}>{v.violation_code}</span>
                      <span style={{fontSize:10, color:'var(--text3)'}}>{v.law_violated}</span>
                    </div>
                    <textarea
                      value={v.description || ''}
                      onChange={(e) => {
                        const updated = [...scannedViolations]
                        updated[i] = {...updated[i], description: e.target.value}
                        setScannedViolations(updated)
                      }}
                      placeholder="粘贴罚单中该违规项的完整英文描述..."
                      rows={3}
                      style={{width:'100%', fontSize:10, background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:4, color:'var(--text)', padding:'6px 8px', resize:'vertical', fontFamily:'inherit', outline:'none'}}
                    />
                  </div>
                ))}
              </div>}
                      </div>
                    ) : (
                      <div>
                        <i className="ti ti-camera" style={{fontSize:20, color:'var(--text3)', display:'block', marginBottom:4}} aria-hidden />
                        <div style={{fontSize:11, color:'var(--text2)'}}>请上传罚单所有页面（如有多页请全部选择）</div>
                        <div style={{fontSize:9, color:'var(--text3)', marginTop:2}}>JPG / PNG / PDF / Word · 支持多页同时上传
            <br/>提示：02B等违规可能跨页，漏传会导致识别不全</div>
                      </div>
                    )}
                  </div>
                  {scanError && <div style={{fontSize:11, color:'var(--red)', marginTop:5, padding:'5px 8px', background:'rgba(255,92,92,0.1)', borderRadius:6, cursor:'pointer'}} onClick={()=>setScanError('')}>{scanError} ✕</div>}
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleScan(f)}} />
                </div>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
                  <div style={{flex:1, height:'1px', background:'var(--border)'}} />
                  <span style={{fontSize:10, color:'var(--text3)'}}>或手动填写</span>
                  <div style={{flex:1, height:'1px', background:'var(--border)'}} />
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11, color:'var(--text3)', marginBottom:5, display:'block', textTransform:'uppercase', letterSpacing:'0.06em'}}>执法机构 Agency</label>
                  <select value={agency} onChange={e=>setAgency(e.target.value)} style={{width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:8, color:'var(--text)', fontSize:13, padding:'8px 10px', outline:'none', appearance:'none'}}>
                    <option value="">— 选择机构 —</option>
                    <option value="DOHMH">DOHMH — 餐馆卫生</option>
                    <option value="DOB">DOB — 建筑违规</option>
                    <option value="DSNY">DSNY — 卫生清洁</option>
                    <option value="DCA">DCA — 商业许可</option>
                    <option value="ECB">ECB — 环境控制</option>
                  </select>
                </div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12}}>
                  <div>
                    <label style={{fontSize:11, color:'var(--text3)', marginBottom:5, display:'block', textTransform:'uppercase', letterSpacing:'0.06em'}}>违规代码</label>
                    <input value={code} onChange={e=>setCode(e.target.value)} placeholder="如 02A" style={{width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:8, color:'var(--text)', fontSize:13, padding:'8px 10px', outline:'none'}} />
                  </div>
                  <div>
                    <label style={{fontSize:11, color:'var(--text3)', marginBottom:5, display:'block', textTransform:'uppercase', letterSpacing:'0.06em'}}>传票号码</label>
                    <input value={summons} onChange={e=>setSummons(e.target.value)} placeholder="如 123456789" title={fieldConfidence.summons != null && fieldConfidence.summons < 0.7 ? `识别置信度${Math.round((fieldConfidence.summons||0)*100)}%，请确认` : undefined} style={{width:'100%', background: fieldConfidence.summons != null && fieldConfidence.summons < 0.5 ? 'rgba(255,80,80,0.13)' : fieldConfidence.summons != null && fieldConfidence.summons < 0.7 ? 'rgba(255,180,0,0.13)' : 'var(--bg3)', border: fieldConfidence.summons != null && fieldConfidence.summons < 0.5 ? '1px solid #ff5050' : fieldConfidence.summons != null && fieldConfidence.summons < 0.7 ? '1px solid #ffb400' : '1px solid var(--border2)', borderRadius:8, color:'var(--text)', fontSize:13, padding:'8px 10px', outline:'none'}} />
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11, color:'var(--text3)', marginBottom:5, display:'block', textTransform:'uppercase', letterSpacing:'0.06em'}}>
                    听证日期（选填）
                    {hearingDate && <span style={{color:'var(--accent)', marginLeft:8, textTransform:'none', letterSpacing:0}}>{toUSDate(hearingDate)}</span>}
                  </label>
                  <input
                    type="date"
                    value={hearingDate}
                    onChange={e=>setHearingDate(e.target.value)}
                    style={{width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:8, color:'var(--text)', fontSize:13, padding:'8px 10px', outline:'none', colorScheme:'dark'}}
                  />
                  <div style={{fontSize:9, color:'var(--text3)', marginTop:3}}>显示格式：月/日/年（美国标准）</div>
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11, color:'var(--text3)', marginBottom:5, display:'block', textTransform:'uppercase', letterSpacing:'0.06em'}}>补充描述（选填）</label>
                  <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="可描述现场情况、整改措施等..." rows={2} style={{width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', borderRadius:8, color:'var(--text)', fontSize:12, padding:'8px 10px', outline:'none', resize:'vertical', fontFamily:'inherit'}} />
                </div>
                {error && <div style={{fontSize:12, color:'var(--red)', marginBottom:10, padding:'7px 10px', background:'rgba(255,92,92,0.1)', borderRadius:7}}>{error}</div>}
                <button onClick={()=>runSingleAnalysis()} disabled={loading} style={{width:'100%', background:loading?'rgba(232,255,71,0.2)':'var(--accent)', color:loading?'var(--accent)':'#0a0a0f', border:'none', borderRadius:8, padding:'11px', fontFamily:'Syne', fontWeight:700, fontSize:13, cursor:loading?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7}}>
                  {loading ? <><div className="spinner" style={{width:14,height:14}} /> 分析中...</> : <><i className="ti ti-sparkles" aria-hidden /> AI 智能分析</>}
                </button>
              </div>
              <div style={{background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:16}}>
                <div style={{fontFamily:'DM Mono', fontSize:10, color:'var(--text3)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:12}}><i className="ti ti-bolt" aria-hidden /> &nbsp;快速测试案例</div>
                <div style={{display:'flex', flexDirection:'column', gap:7}}>
                  {QUICK_CASES.map(qc=>(
                    <div key={qc.code} onClick={()=>{setAgency(qc.agency);setCode(qc.code);setSummons(String(Math.floor(Math.random()*900000000+100000000)));setTimeout(()=>runSingleAnalysis(qc.agency,qc.code),100)}} style={{display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:7, cursor:'pointer'}}>
                      <span style={{fontFamily:'DM Mono', fontSize:10, color:'var(--accent)', background:'rgba(232,255,71,0.08)', padding:'2px 6px', borderRadius:4, minWidth:72}}>{qc.agency} {qc.code}</span>
                      <span style={{fontSize:11, color:'var(--text2)', flex:1}}>{qc.desc}</span>
                      <span style={{fontSize:9, padding:'2px 5px', borderRadius:4, background:qc.sev==='Critical'?'rgba(255,92,92,0.15)':'rgba(255,179,71,0.15)', color:qc.sev==='Critical'?'var(--red)':'var(--amber)'}}>{qc.sev}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right */}
            <div style={{flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:14}}>
              {loading && (
                <div style={{background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:18, flex:1, display:'flex', alignItems:'center', justifyContent:'center'}}>
                  <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:14, padding:40}}>
                    <div className="spinner" style={{width:36,height:36}} />
                    <div style={{fontFamily:'DM Mono', fontSize:12, color:'var(--text3)'}}>
                      {scannedViolations.length > 1 ? `并行分析 ${scannedViolations.length} 个违规项...` : 'AI 正在分析...'}
                    </div>
                    <div style={{display:'flex', flexDirection:'column', gap:5}}>
                      {['识别违规代码','查询220万条数据库','并行统计各项规律','GPT-4o 生成报告'].map((s,i)=>(
                        <div key={i} style={{fontSize:11, display:'flex', alignItems:'center', gap:6, color:loadStep>i+1?'var(--green)':loadStep===i+1?'var(--accent)':'var(--text3)'}}>
                          <i className={`ti ti-${loadStep>i+1?'check':loadStep===i+1?'loader':'circle'}`} style={{fontSize:11}} aria-hidden /> {s}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!loading && !hasResults && (
                <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'var(--text3)', padding:40, textAlign:'center'}}>
                  <i className="ti ti-file-search" style={{fontSize:48, opacity:0.3, marginBottom:16}} aria-hidden />
                  <div style={{fontFamily:'Syne', fontWeight:600, fontSize:16, color:'var(--text2)', marginBottom:8}}>等待分析</div>
                  <div style={{fontSize:13, lineHeight:1.8, maxWidth:300}}>
                    输入罚单信息或点击左侧快速案例，AI 将在数秒<br/>内完成深度分析
                  </div>
                </div>
              )}

              {!loading && multiResults.length > 0 && (
                <div style={{background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden'}}>
                  <div style={{display:'flex', borderBottom:'1px solid var(--border)', background:'var(--bg3)'}}>
                    {multiResults.map((r, i) => (
                      <div key={i} onClick={()=>setActiveTab(i)} style={{padding:'10px 16px', cursor:'pointer', fontSize:12, fontFamily:'DM Mono', borderBottom: activeTab===i?'2px solid var(--accent)':'2px solid transparent', color:activeTab===i?'var(--accent)':'var(--text3)', background:activeTab===i?'var(--bg2)':'transparent', display:'flex', alignItems:'center', gap:6}}>
                        <span style={{fontSize:9, padding:'1px 5px', borderRadius:3, background:sevColor(r.analysis.severity)+'22', color:sevColor(r.analysis.severity)}}>{r.analysis.severity}</span>
                        {r.violation_code}
                        {r.hasDbData && <span style={{width:5, height:5, borderRadius:'50%', background:'var(--green)', display:'inline-block'}} />}
                      </div>
                    ))}
                    <div style={{marginLeft:'auto', padding:'10px 14px', fontSize:10, color:'var(--text3)', display:'flex', alignItems:'center', gap:5}}>
                      <i className="ti ti-files" aria-hidden /> {multiResults.length} 项违规
                    </div>
                  </div>
                  <div style={{padding:18}}>
                    {multiResults[activeTab] && (
                      <ResultCard r={multiResults[activeTab].analysis} vc={multiResults[activeTab].violation_code} isDb={multiResults[activeTab].hasDbData} desc={multiResults[activeTab].analysis?.violationTitleCN} />
                    )}
                  </div>
                  {(() => {
                    // 综合汇总计算
                    const FINE_RANGE_MAP: Record<string, {min:number,max:number}> = {
  '02B': {min:200,max:2000}, '02G': {min:200,max:2000}, '02H': {min:200,max:2000},
  '04L': {min:200,max:2000}, '06A': {min:200,max:2000}, '06B': {min:200,max:2000},
  '06C': {min:200,max:2000}, '08A': {min:200,max:2000}, '10F': {min:200,max:2000},
  '10H': {min:200,max:2000}, '15I': {min:200,max:2000}, '22A': {min:200,max:2000},
  '28-05': {min:250,max:1000},
}
const parseFineRange = (s: string) => {
                      const m = s?.match(/\$([0-9,]+)[^\d]*\$([0-9,]+)/)
                      if (!m) return null
                      return { min: parseInt(m[1].replace(/,/g,'')), max: parseInt(m[2].replace(/,/g,'')) }
                    }
                    const ranges = multiResults.map(r => FINE_RANGE_MAP[r.violation_code] || parseFineRange(r.analysis.baseFineRange)).filter(Boolean) as {min:number,max:number}[]
                    const totalMin = ranges.reduce((a,b) => a + b.min, 0)
                    const totalMax = ranges.reduce((a,b) => a + b.max, 0)
                    const ratesWithData = multiResults.filter(r => r.analysis.dismissRate !== null)
                    const avgDismissRate = ratesWithData.length > 0
                      ? Math.round(ratesWithData.reduce((a,r) => a + (r.analysis.dismissRate||0), 0) / ratesWithData.length)
                      : null
                    const totalAvgPenalty = multiResults.reduce((a,r) => a + (r.analysis.avgFinalPenalty||0), 0)
                    const estimatedSaving = avgDismissRate !== null && totalAvgPenalty > 0
                      ? Math.round(avgDismissRate / 100 * totalAvgPenalty)
                      : null
                    const avgReducedRate = ratesWithData.length > 0
                      ? Math.round(ratesWithData.reduce((a,r) => a + (r.analysis.reducedRate||0), 0) / ratesWithData.length)
                      : null
                    const predictedSaving = totalMax > 0 && avgReducedRate !== null
                      ? Math.round(totalMax * avgReducedRate / 100)
                      : null
                    return (
                      <div style={{padding:'14px 18px', borderTop:'1px solid var(--border)', background:'var(--bg3)'}}>
                        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:10}}>
                          <div style={{background:'var(--bg2)', borderRadius:8, padding:'10px 12px', border:'1px solid var(--border)'}}>
                            <div style={{fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4}}>总罚款区间</div>
                            <div style={{fontFamily:'DM Mono', fontWeight:700, fontSize:15, color:'var(--amber)'}}>
                              ${totalMin.toLocaleString()}–${totalMax.toLocaleString()}
                            </div>
                            <div style={{fontSize:9, color:'var(--text3)', marginTop:2}}>全部维持最坏情况</div>
                          </div>
                          <div style={{background:'var(--bg2)', borderRadius:8, padding:'10px 12px', border:'1px solid var(--border)'}}>
                            <div style={{fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4}}>综合减免率</div>
                            <div style={{fontFamily:'DM Mono', fontWeight:700, fontSize:15, color:(avgReducedRate||0)>30?'var(--green)':'var(--amber)'}}>
                              {avgReducedRate !== null ? `${avgReducedRate}%` : '—'}
                              {avgDismissRate !== null && <span style={{fontSize:10, color:'var(--text3)', fontWeight:400, marginLeft:6}}>撤{avgDismissRate}%</span>}
                            </div>
                            <div style={{fontSize:9, color:'var(--text3)', marginTop:2}}>历史减免+撤销综合</div>
                          </div>
                          <div style={{background:'rgba(71,255,154,0.06)', borderRadius:8, padding:'10px 12px', border:'1px solid rgba(71,255,154,0.2)'}}>
                            <div style={{fontSize:9, color:'var(--green)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4}}>申诉成功预计可省</div>
                            <div style={{fontFamily:'DM Mono', fontWeight:700, fontSize:15, color:'var(--green)'}}>
                              {avgReducedRate !== null
                                ? `$${Math.round(totalMin * avgReducedRate / 100).toLocaleString()}–$${Math.round(totalMax * avgReducedRate / 100).toLocaleString()}`
                                : '—'}
                            </div>
                            <div style={{fontSize:9, color:'var(--text3)', marginTop:2}}>减免率×罚款区间</div>
                          </div>
                        </div>
                        <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
                          <span style={{fontSize:10, color:'var(--text3)'}}>各项明细：</span>
                          {multiResults.map(r=>(
                            <span key={r.violation_code} style={{fontFamily:'DM Mono', fontSize:10, padding:'2px 8px', borderRadius:4, background:'var(--bg2)', border:'1px solid var(--border)', color:(r.analysis.dismissRate||0)>30?'var(--green)':'var(--amber)'}}>
                              {r.violation_code} {r.analysis.baseFineRange} 撤{r.analysis.dismissRate??'—'}% 减{r.analysis.reducedRate??'—'}%
                            </span>
                          ))}
                        </div>
                        <div style={{display:'flex', gap:8, padding:'12px 18px', borderTop:'1px solid var(--border)'}}>
                          <button onClick={isPaid ? runFullAppeal : () => alert('请先完成支付后再生成申诉书')} disabled={!isPaid} style={{flex:2, padding:'9px', borderRadius:8, border:'1px solid rgba(232,255,71,0.25)', background:'rgba(232,255,71,0.08)', color:'var(--accent)', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
                            <i className="ti ti-file-text" aria-hidden /> 生成完整申诉书
                          </button>
                          <button onClick={runHearingManual} disabled={hearingManualLoading} style={{flex:1, padding:'9px', borderRadius:8, border:'1px solid rgba(71,255,154,0.25)', background:'rgba(71,255,154,0.06)', color:'var(--green)', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
                            <i className="ti ti-school" aria-hidden /> {hearingManualLoading ? '生成中...' : '听证准备手册'}
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {!loading && singleResult && multiResults.length === 0 && (
                <div style={{background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:18}}>
                  <ResultCard r={singleResult} vc={code} isDb={hasDbData} />
                  <div style={{marginTop:12, padding:'9px 12px', background:'rgba(255,255,255,0.02)', borderRadius:7, border:'1px solid var(--border)'}}>
                    <div style={{fontSize:10, color:'var(--text3)', lineHeight:1.7}}>⚠️ 免责声明：本分析基于历史数据，仅供参考，不构成法律意见。</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab==='pricing' && (
          <div style={{flex:1, overflowY:'auto', padding:24}}>
            <div style={{marginBottom:20}}>
              <div style={{fontFamily:'Syne', fontWeight:700, fontSize:20, marginBottom:6}}>行业收费 1/10，AI 驱动专业服务</div>
              <div style={{fontSize:13, color:'var(--text2)'}}>传统代理公司 $500–$3,000/次，我们 $99/月无限次。</div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16}}>
              {[
                {name:'入门版',price:'$29',per:'/月',vs:'传统 $500+/次',features:['每月10次','DOHMH覆盖','历史案例','处理建议']},
                {name:'专业版 Pro',price:'$99',per:'/月',vs:'传统 $1,500+/次',featured:true,features:['无限次分析','全机构覆盖','220万条数据','多违规并析','PDF识别','申诉材料生成']},
                {name:'机构版',price:'$299',per:'/月',vs:'传统律所 $3,000+',features:['Pro全功能','团队管理','API接入','白标','专属经理']},
              ].map(p=>(
                <div key={p.name} style={{background:p.featured?'rgba(232,255,71,0.04)':'var(--bg3)', border:p.featured?'1px solid rgba(232,255,71,0.35)':'1px solid var(--border)', borderRadius:12, padding:20, position:'relative'}}>
                  {p.featured && <div style={{position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:'var(--accent)', color:'#000', fontSize:10, fontWeight:700, padding:'3px 12px', borderRadius:20, whiteSpace:'nowrap'}}>最受欢迎</div>}
                  <div style={{fontFamily:'Syne', fontWeight:700, fontSize:16, marginBottom:6}}>{p.name}</div>
                  <div style={{fontFamily:'DM Mono', fontSize:28, color:'var(--accent)', marginBottom:4}}>{p.price}<span style={{fontSize:13, color:'var(--text3)'}}>{p.per}</span></div>
                  <div style={{fontSize:11, color:'var(--text3)', marginBottom:14, textDecoration:'line-through'}}>{p.vs}</div>
                  <ul style={{listStyle:'none', display:'flex', flexDirection:'column', gap:7}}>
                    {p.features.map(f=>(
                      <li key={f} style={{fontSize:12, color:'var(--text2)', display:'flex', gap:7}}>
                        <i className="ti ti-check" style={{color:'var(--green)', fontSize:13, marginTop:1, flexShrink:0}} aria-hidden />{f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab==='dashboard' && (
          <div style={{flex:1, overflowY:'auto', padding:24}}>
            <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
              {[{label:'历史案例总量',value:'220万+',change:'已全量导入'},{label:'统计节省总额',value:'$482K',change:'+31%',color:'var(--green)'},{label:'撤销成功率',value:'67%',change:'+4%',color:'var(--accent)'},{label:'支持违规代码',value:'200+',change:'持续更新'}].map(s=>(
                <div key={s.label} style={{background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:14}}>
                  <div style={{fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8}}>{s.label}</div>
                  <div style={{fontFamily:'Syne', fontWeight:700, fontSize:24, color:s.color||'var(--text)'}}>{s.value}</div>
                  <div style={{fontSize:11, color:'var(--green)', marginTop:3}}>{s.change}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  )
}
