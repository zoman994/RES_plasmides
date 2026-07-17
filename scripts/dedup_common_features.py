"""
dedup_common_features.py — collapse exact-sequence duplicates in
common-features.json into single canonical entries with aliases.

06.05.2026 round-14 (biolog: «AmpR-BlaR накладываются друг на друга
именами, хотя это одни и те же гены»). Detection runs each DB entry
independently, so two entries with identical sequence (e.g.
'5\\' LTR' / 'LTR' / '3\\' LTR (truncated)' typographic variants of
the same retroviral LTR) emit two regions on the same plasmid → two
overlapping labels in the viewer.

Strategy:
  1. Load common-features.json.
  2. Group entries by exact sequence.
  3. For each group with >1 entry, pick a canonical name (curated
     dict below + fallback to shortest cleaner name) and add the
     other names to the canonical's aliases array.
  4. Also collapse the AmpR / Amp(R) pair (2-nt diff but same
     gene — explicitly mentioned by biolog).
  5. Drop redundant entries.
  6. Backup original to ignored scripts/.backups/ before rewriting.

Run:
  py scripts/dedup_common_features.py
"""

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / 'gui' / 'designer' / 'public' / 'common-features.json'
BACKUP_DIR = ROOT / 'scripts' / '.backups'

# Curated canonical names — pick the cleaner / more conventional
# form when both share an exact sequence. Keys are members of a
# duplicate group, the value is the canonical name to keep.
CANONICAL = {
    # Tet-On registered-mark variant — keep the plain ASCII form.
    ("Tet-On® 3G", "Tet-On 3G"): "Tet-On 3G",
    # T7 epitope tag — keep the short form.
    ("T7 tag", "T7 tag (gene 10 leader)"): "T7 tag",
    # SacB / sacB — keep gene-convention lowercase.
    ("SacB", "sacB"): "sacB",
    # SV40 promoter — keep the descriptive «promoter» suffix.
    ("SV40 promoter", "SV40"): "SV40 promoter",
    # Ubi / UbiC — keep the more specific «UbiC promoter».
    ("Ubi Promoter", "UbiC promoter"): "UbiC promoter",
    # Retroviral LTR variants — keep the generic name; specific
    # 5'/3' position is conveyed by feature COORDS, not the name.
    ("5' LTR (truncated)", "3' LTR (truncated)", "LTR (truncated)"): "LTR (truncated)",
    ("3' LTR (ΔU3)", "LTR (ΔU3)"): "LTR (ΔU3)",
    ("5' LTR", "LTR"): "LTR",
    # ITR variants.
    ("ITR", "5' ITR"): "ITR",
}

# Near-duplicate pair (h=2 nt diff, same gene). Biolog specifically
# called out the AmpR / Amp(R) confusion. Merge these too.
NEAR_DUP_MERGES = [
    {
        'canonical_name': 'AmpR',
        'merge_names': ['Amp(R)'],
        'note': '2 nt silent variation; same gene (β-lactamase / bla).',
    },
]


def main():
    if not DB_PATH.exists():
        print(f"common-features.json not found at {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    db = json.loads(DB_PATH.read_text(encoding='utf-8'))
    features = db['features']
    print(f'Loaded {len(features)} features.')

    # Backup pre-dedupe.
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().strftime('%Y%m%d')
    backup = BACKUP_DIR / f'common-features_v_pre_dedupe_{stamp}.json'
    backup.write_text(DB_PATH.read_text(encoding='utf-8'), encoding='utf-8')
    print(f'Backup -> {backup}')

    # Build name -> entry map for quick lookup.
    by_name = {f['name']: f for f in features}

    drop_names = set()

    # Pass 1: exact-sequence dup groups via CANONICAL map.
    for group, canonical_name in CANONICAL.items():
        canonical = by_name.get(canonical_name)
        if not canonical:
            print(f'  skip group {group!r}: canonical {canonical_name!r} missing', file=sys.stderr)
            continue
        aliases = list(canonical.get('aliases', []) or [])
        for member in group:
            if member == canonical_name:
                continue
            other = by_name.get(member)
            if not other:
                continue
            # Sanity: confirm same sequence.
            if other.get('sequence') != canonical.get('sequence'):
                print(f'  WARN seq mismatch in group {group}: {member} vs {canonical_name}', file=sys.stderr)
            if member not in aliases:
                aliases.append(member)
            # Merge sourceFiles too.
            for sf in other.get('sourceFiles', []) or []:
                if sf not in (canonical.get('sourceFiles') or []):
                    canonical.setdefault('sourceFiles', []).append(sf)
            drop_names.add(member)
        canonical['aliases'] = aliases

    # Pass 2: near-dup merges (AmpR / Amp(R)).
    for merge in NEAR_DUP_MERGES:
        canonical = by_name.get(merge['canonical_name'])
        if not canonical:
            continue
        aliases = list(canonical.get('aliases', []) or [])
        for name in merge['merge_names']:
            other = by_name.get(name)
            if not other:
                continue
            if name not in aliases:
                aliases.append(name)
            for sf in other.get('sourceFiles', []) or []:
                if sf not in (canonical.get('sourceFiles') or []):
                    canonical.setdefault('sourceFiles', []).append(sf)
            drop_names.add(name)
        canonical['aliases'] = aliases

    new_features = [f for f in features if f['name'] not in drop_names]
    print(f'Dropped {len(features) - len(new_features)} dup entries:')
    for n in sorted(drop_names):
        # ASCII-safe to survive a cp1251 console.
        print('  - ' + n.encode('ascii', 'replace').decode('ascii'))

    db['features'] = new_features
    db['stats']['total_unique'] = len(new_features)
    # Recompute by_type.
    by_type = {}
    for f in new_features:
        by_type[f['type']] = by_type.get(f['type'], 0) + 1
    db['stats']['by_type'] = by_type
    db['generated'] = datetime.utcnow().isoformat() + '+00:00'

    DB_PATH.write_text(
        json.dumps(db, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    print(f'Wrote {len(new_features)} features to {DB_PATH}.')


if __name__ == '__main__':
    main()
