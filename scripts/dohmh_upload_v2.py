import json, os, time, urllib.request, urllib.error

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
INPUT_FILE   = os.path.expanduser("~/Downloads/dohmh_inspections_clean.json")
BATCH_SIZE   = 300
ENDPOINT     = f"{SUPABASE_URL}/rest/v1/dohmh_inspections"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json; charset=utf-8",
    "Prefer": "return=minimal",
}

print("读取数据中...")
with open(INPUT_FILE, "r", encoding="utf-8") as f:
    records = json.load(f)

print(f"共 {len(records):,} 条，开始上传...\n")
success = 0
errors  = 0

for i in range(0, len(records), BATCH_SIZE):
    batch = records[i : i + BATCH_SIZE]
    body  = json.dumps(batch, ensure_ascii=False).encode("utf-8")
    req   = urllib.request.Request(ENDPOINT, data=body, method="POST")
    for k, v in HEADERS.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
        success += len(batch)
        if success % 10000 == 0:
            print(f"  ✅ {success:,} / {len(records):,}  ({success/len(records)*100:.1f}%)")
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        errors += len(batch)
        print(f"  ❌ 批次 {i}: HTTP {e.code} — {err[:120]}")
    except Exception as e:
        errors += len(batch)
        print(f"  ❌ 批次 {i}: {e}")
    time.sleep(0.05)

print(f"\n完成：成功 {success:,} 条，失败 {errors:,} 条")
