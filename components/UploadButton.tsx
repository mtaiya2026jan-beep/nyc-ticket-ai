'use client'
import { useState, useRef } from 'react'

type ScanResult = {
  agency: string
  violation_code: string
  summons_number: string
  hearing_date: string | null
  penalty_amount: number | null
  business_name: string | null
  violation_description: string
  confidence: number
}

type Props = {
  onResult: (result: ScanResult) => void
}

export default function UploadButton({ onResult }: Props) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file) return
    setError('')
    setScanning(true)

    // 显示预览
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/scan', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || '识别失败，请重试')
        return
      }

      onResult(data.result)
    } catch {
      setError('网络错误，请重试')
    } finally {
      setScanning(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div style={{marginBottom: 14}}>
      <label style={{fontSize:11, color:'var(--text3)', marginBottom:6, display:'block', textTransform:'uppercase', letterSpacing:'0.06em'}}>
        上传罚单（图片或PDF）
      </label>

      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        style={{
          border: '1px dashed var(--border2)',
          borderRadius: 8,
          padding: '16px 12px',
          textAlign: 'center',
          cursor: 'pointer',
          background: scanning ? 'rgba(232,255,71,0.04)' : 'var(--bg3)',
          transition: 'all 0.15s',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {preview && (
          <img src={preview} alt="预览" style={{width:'100%', maxHeight:120, objectFit:'cover', borderRadius:6, marginBottom:8, opacity:0.7}} />
        )}

        {scanning ? (
          <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:8, color:'var(--accent)', fontSize:12}}>
            <div className="spinner" style={{width:14,height:14}} />
            AI 正在识别罚单...
          </div>
        ) : (
          <div>
            <i className="ti ti-scan" style={{fontSize:24, color:'var(--text3)', display:'block', marginBottom:6}} aria-hidden />
            <div style={{fontSize:12, color:'var(--text2)'}}>点击上传或拖拽罚单</div>
            <div style={{fontSize:10, color:'var(--text3)', marginTop:3}}>支持 JPG、PNG、PDF</div>
          </div>
        )}
      </div>

      {error && (
        <div style={{fontSize:11, color:'var(--red)', marginTop:6, padding:'6px 10px', background:'rgba(255,92,92,0.1)', borderRadius:6}}>
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        style={{display:'none'}}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
    </div>
  )
}
