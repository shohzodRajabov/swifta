import json, re, os, sys
root='src'
msgs=json.load(open('messages/uz.json'))
def has(key):
    cur=msgs
    for part in key.split('.'):
        if not isinstance(cur, dict) or part not in cur: return False
        cur=cur[part]
    return True
missing={}
for dp,_,fs in os.walk(root):
    for f in fs:
        if not f.endswith(('.ts','.tsx')): continue
        p=os.path.join(dp,f); s=open(p).read()
        ns_m=re.search(r'(?:useTranslations|getTranslations)\(\s*"([^"]+)"\s*\)', s)
        ns=ns_m.group(1) if ns_m else None
        # files using both namespaced and plain translators are rare; treat t( as namespaced if ns
        for m in re.finditer(r'\bt\(\s*"([^"$`]+)"', s):
            k=m.group(1)
            full=f"{ns}.{k}" if ns and not has(k) else k
            if not has(full) and not has(k):
                missing.setdefault(full, set()).add(p.replace('src/',''))
for k in sorted(missing): print(k, '  <-', ', '.join(sorted(missing[k]))[:120])
print(len(missing), 'missing', file=sys.stderr)
