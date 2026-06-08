import json
import os
import time
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
INPUT_FILE = os.path.expanduser("~/Downloads/dohmh_inspections_clean.json")
BATCH_SIZE = 200

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

with open(INPUT_FILE, "r", encoding="utf-8") as f:
    records = json.load(f)

print(f"共 {len(records):,} 条，开始上传...\n")

success = 0
errors = 0

for i in range(0, len(records), BATCH_SIZE):
    batch = records[i : i + BATCH_SIZE]
    # 清理每条记录里的非ASCII字符问题
    clean_batch = []
    for row in batch:
        clean_row = {}
        for k, v in row.items():
            if isinstance(v, str):
                v = v.encode("utf-8", errors="replace").decode("utf-8")
            clean_row[k] = v
        clean_batch.append(clean_row)
    try:
        supabase.table("dohmh_inspections").insert(clean_batch).execute()
        success += len(clean_batch)
        if success % 10000 == 0:
            print(f"  ✅ {success:,} / {len(records):,}")
    except Exception as e:
        errors += len(clean_batch)
        print(f"  ❌ 批次 {i} 失败：{e}")
    time.sleep(0.05)

print(f"\n完成：成功 {success:,} 条，失败 {errors:,} 条")
