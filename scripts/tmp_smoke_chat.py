import sys, os, json
sys.path.insert(0, r'C:\Users\sinig\Desktop\RESplasmide')
sys.path.insert(0, r'C:\Users\sinig\Desktop\RESplasmide\src')

try:
    from pvcs.parser import parse_dna_file
    print("[OK] imported pvcs.parser.parse_dna_file")
except Exception as e:
    print(f"[FAIL] import pvcs.parser: {e}")
    try:
        from pvcs.snapgene_parser import parse_snapgene_file as parse_dna_file
        print("[OK] fallback: imported pvcs.snapgene_parser.parse_snapgene_file")
    except Exception as e2:
        print(f"[FAIL] fallback also: {e2}")
        sys.exit(1)

base = r'C:\Users\sinig\Desktop\RESplasmide\scripts\snapgene_dna\basic_cloning_vectors'
plasmids = ['pUC19.dna', 'BlueScribe.dna', 'pcDNA3.1(+).dna', 'pBR322.dna']

print("=" * 70)
print("TECH SMOKE: 4 plasmids parse via pvcs parser")
print("=" * 70)

# Load common-features.json
cf_path = r'C:\Users\sinig\Desktop\RESplasmide\gui\designer\public\common-features.json'
if not os.path.exists(cf_path):
    # try alternative paths
    for alt in [r'C:\Users\sinig\Desktop\RESplasmide\gui\designer\src\common-features.json',
                r'C:\Users\sinig\Desktop\RESplasmide\common-features.json',
                r'C:\Users\sinig\Desktop\RESplasmide\scripts\common-features.json']:
        if os.path.exists(alt):
            cf_path = alt
            break

print(f"\ncommon-features.json path: {cf_path}")
print(f"exists: {os.path.exists(cf_path)}")
if os.path.exists(cf_path):
    with open(cf_path, 'r', encoding='utf-8') as f:
        cf_data = json.load(f)
    if isinstance(cf_data, list):
        cf_count = len(cf_data)
        cf_names = set()
        for item in cf_data:
            if isinstance(item, dict):
                cf_names.add(item.get('name', item.get('label', '')))
    elif isinstance(cf_data, dict):
        feats = cf_data.get('features', cf_data)
        if isinstance(feats, list):
            cf_count = len(feats)
            cf_names = set(item.get('name', item.get('label', '')) for item in feats if isinstance(item, dict))
        else:
            cf_count = len(cf_data)
            cf_names = set(cf_data.keys())
    print(f"common-features count: {cf_count}")
    if 'generated' in str(cf_data)[:500]:
        print(f"first 200 chars of file: {str(cf_data)[:200]}")
else:
    cf_count = 0
    cf_names = set()
    print("common-features.json NOT FOUND — skip cross-check")

for fname in plasmids:
    fpath = os.path.join(base, fname)
    print(f"\n--- {fname} ---")
    if not os.path.exists(fpath):
        print(f"  FILE NOT FOUND")
        continue
    try:
        result = parse_dna_file(fpath)
        # Defensive — try multiple result shapes
        if hasattr(result, 'sequence'):
            seq = result.sequence
            features = getattr(result, 'features', [])
        elif isinstance(result, dict):
            seq = result.get('sequence', '')
            features = result.get('features', [])
        elif isinstance(result, tuple) and len(result) >= 2:
            seq, features = result[0], result[1]
        else:
            print(f"  unknown result shape: {type(result)}")
            print(f"  attrs: {dir(result)[:15]}")
            continue

        print(f"  Length: {len(seq) if seq else 0} bp")
        print(f"  Features: {len(features)}")

        cds_count = 0
        cds_div3_count = 0
        cf_matches = 0
        types_seen = {}
        for feat in features:
            if isinstance(feat, dict):
                ftype = feat.get('type', '?')
                fname_attr = feat.get('name', feat.get('label', '?'))
                fstart = feat.get('start', 0)
                fend = feat.get('end', 0)
            else:
                ftype = getattr(feat, 'type', '?')
                fname_attr = getattr(feat, 'name', getattr(feat, 'label', '?'))
                fstart = getattr(feat, 'start', 0)
                fend = getattr(feat, 'end', 0)
            
            types_seen[ftype] = types_seen.get(ftype, 0) + 1
            
            if ftype == 'CDS':
                cds_count += 1
                try:
                    length = int(fend) - int(fstart)
                    if length % 3 == 0:
                        cds_div3_count += 1
                    else:
                        print(f"    [V50 ALERT] CDS '{fname_attr}' length {length} NOT div by 3 ({fstart}-{fend})")
                except Exception:
                    pass
            
            if fname_attr in cf_names:
                cf_matches += 1
        
        print(f"  Types: {dict(sorted(types_seen.items(), key=lambda x: -x[1]))}")
        print(f"  CDS: {cds_count} total, {cds_div3_count} divisible by 3 (V50 fix verification)")
        print(f"  Cross-match with common-features.json: {cf_matches}/{len(features)} features by name")
        
        # First 12 features as sample
        print(f"  Sample features:")
        for feat in list(features)[:12]:
            if isinstance(feat, dict):
                ftype = feat.get('type', '?')
                fname_attr = feat.get('name', feat.get('label', '?'))[:40]
                fstart = feat.get('start', '?')
                fend = feat.get('end', '?')
                strand = feat.get('strand', '?')
            else:
                ftype = getattr(feat, 'type', '?')
                fname_attr = str(getattr(feat, 'name', getattr(feat, 'label', '?')))[:40]
                fstart = getattr(feat, 'start', '?')
                fend = getattr(feat, 'end', '?')
                strand = getattr(feat, 'strand', '?')
            print(f"    {ftype:15s} {str(fstart):>6}..{str(fend):<6} strand={strand!s:>3}  {fname_attr}")
        if len(features) > 12:
            print(f"    ... and {len(features) - 12} more features")
    except Exception as e:
        import traceback
        print(f"  PARSE ERROR: {type(e).__name__}: {e}")
        traceback.print_exc()

print("\n" + "=" * 70)
print("SMOKE DONE")
print("=" * 70)
