import csv
import json
import os
from datetime import datetime

INPUT_FILE  = os.path.expanduser("~/Downloads/dohmh_inspections_raw.csv")
OUTPUT_FILE = os.path.expanduser("~/Downloads/dohmh_inspections_clean.json")

FIELD_MAP = {
    "CAMIS":                "camis",
    "DBA":                  "dba",
    "BORO":                 "boro",
    "BUILDING":             "building",
    "STREET":               "street",
    "ZIPCODE":              "zipcode",
    "PHONE":                "phone",
    "CUISINE DESCRIPTION":  "cuisine_description",
    "INSPECTION DATE":      "inspection_date",
    "ACTION":               "action",
    "VIOLATION CODE":       "violation_code",
    "VIOLATION DESCRIPTION":"violation_description",
    "CRITICAL FLAG":        "critical_flag",
    "SCORE":                "score",
    "GRADE":                "grade",
    "GRADE DATE":           "grade_date",
    "RECORD DATE":          "record_date",
    "INSPECTION TYPE":      "inspection_type",
    "Latitude":             "latitude",
    "Longitude":            "longitude",
    "Community Board":      "community_board",
    "Council District":     "council_district",
    "Census Tract":         "census_tract",
    "BIN":                  "bin",
    "BBL":                  "bbl",
    "NTA":                  "nta",
}

def parse_date(s):
    if not s or s.strip() == "01/01/1900":
        return None
    try:
        return datetime.strptime(s.strip(), "%m/%d/%Y").strftime("%Y-%m-%d")
    except:
        return None

def parse_float(s):
    try:
        v = float(s)
        return v if v != 0.0 else None
    except:
        return None

def parse_int(s):
    try:
        return int(s)
    except:
        return None

records = []
skipped = 0

with open(INPUT_FILE, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader):
        inspection_date = parse_date(row.get("INSPECTION DATE", ""))
        if inspection_date is None and not row.get("VIOLATION CODE", "").strip():
            skipped += 1
            continue

        record = {}
        for csv_col, db_col in FIELD_MAP.items():
            val = row.get(csv_col, "").strip() or None
            if db_col in ("inspection_date", "grade_date", "record_date"):
                val = parse_date(row.get(csv_col, ""))
            elif db_col in ("latitude", "longitude"):
                val = parse_float(row.get(csv_col, ""))
            elif db_col == "score":
                val = parse_int(row.get(csv_col, ""))
            elif db_col == "boro":
                val = (row.get(csv_col, "").strip().upper()) or None
            record[db_col] = val

        records.append(record)
        if (i + 1) % 50000 == 0:
            print(f"  已处理 {i+1:,} 行...")

print(f"\n✅ 处理完成：{len(records):,} 条有效记录，跳过 {skipped:,} 条占位行")

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, default=str)

print(f"📄 输出：{OUTPUT_FILE}")
print(f"   大小：{os.path.getsize(OUTPUT_FILE)/1024/1024:.1f} MB")
