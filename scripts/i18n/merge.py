"""Merge translation tables into messages/{uz,ru,en}.json. Usage: python3 scripts/i18n/merge.py scripts/i18n/<file>.py"""
import json, sys, runpy

table = runpy.run_path(sys.argv[1])["T"]  # {"a.b.c": (uz, ru, en)}
for i, loc in enumerate(["uz", "ru", "en"]):
    p = f"messages/{loc}.json"
    d = json.load(open(p))
    for key, vals in table.items():
        cur = d
        parts = key.split(".")
        for part in parts[:-1]:
            if not isinstance(cur.get(part), dict):
                cur[part] = {}
            cur = cur[part]
        cur[parts[-1]] = vals[i]
    json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
    open(p, "a").write("\n")
print(f"merged {len(table)} keys")
