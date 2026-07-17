#!/usr/bin/env python3
"""
build_catalog_index.py — Generate lightweight plasmid catalog from SnapGene .dna files.

Produces:
  gui/designer/public/plasmids-index.json  — lightweight index (~300KB, no sequences)
  gui/designer/public/plasmids-data/*.json — full data per category (loaded on demand)

Usage:
  python scripts/build_catalog_index.py
"""

import json
import hashlib
import sys
from pathlib import Path
from datetime import datetime, timezone

# Import parser from sibling script
sys.path.insert(0, str(Path(__file__).parent))
from fetch_snapgene_plasmids import (
    parse_snapgene_dna, CATEGORY_NAMES, ORGANISM_TAGS,
)

DNA_DIR = Path(__file__).parent / 'snapgene_dna'
OUT_DIR = Path(__file__).parent.parent / 'gui' / 'designer' / 'public'
DATA_DIR = OUT_DIR / 'plasmids-data'


def make_id(name, category):
    """Stable short ID from name + category."""
    h = hashlib.md5(f'{category}/{name}'.encode()).hexdigest()[:10]
    return f'sg_{h}'


def extract_feature_names(features):
    """Extract top feature names for index (max 6)."""
    names = []
    for f in features:
        n = f.get('name', '')
        if n and n not in names and f.get('type') not in ('primer_bind',):
            names.append(n)
        if len(names) >= 6:
            break
    return names


def build():
    if not DNA_DIR.exists():
        print(f'ERROR: {DNA_DIR} not found. Run fetch_snapgene_plasmids.py first.')
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    categories_info = []
    all_index_entries = []
    total = 0

    cat_dirs = sorted(d for d in DNA_DIR.iterdir() if d.is_dir())
    for cat_dir in cat_dirs:
        cat_slug = cat_dir.name
        cat_name = CATEGORY_NAMES.get(cat_slug, cat_slug.replace('_', ' ').title())
        organism = ORGANISM_TAGS.get(cat_slug, '')

        dna_files = sorted(cat_dir.glob('*.dna'))
        if not dna_files:
            continue

        cat_plasmids = []
        cat_index = []

        for dna_path in dna_files:
            try:
                parsed = parse_snapgene_dna(dna_path)
            except Exception:
                continue
            if not parsed or not parsed.get('sequence'):
                continue

            name = dna_path.stem.replace('_', ' ')
            pid = make_id(name, cat_slug)
            features = parsed.get('features', [])
            feature_names = extract_feature_names(features)

            # Convert features to annotations format
            annotations = []
            for f in features:
                ann = {
                    'name': f.get('name', ''),
                    'type': f.get('type', 'misc_feature'),
                    'start': f.get('start', 0),
                    'end': f.get('end', 0),
                    'strand': f.get('strand', 1),
                    'level': 'region',
                }
                if f.get('description'):
                    ann['description'] = f['description']
                if f.get('color'):
                    ann['color'] = f['color']
                annotations.append(ann)

            # Index entry (no sequence)
            cat_index.append({
                'id': pid,
                'name': name,
                'length': parsed['length'],
                'topology': parsed.get('topology', 'circular'),
                'organism': organism,
                'category': cat_slug,
                'features': feature_names,
                'description': parsed.get('description', '')[:80],
            })

            # Full data entry (with sequence + annotations)
            cat_plasmids.append({
                'id': pid,
                'name': name,
                'sequence': parsed['sequence'],
                'length': parsed['length'],
                'topology': parsed.get('topology', 'circular'),
                'organism': organism,
                'annotations': annotations,
                'description': parsed.get('description', ''),
            })

        if cat_plasmids:
            # Write category data file
            cat_data_path = DATA_DIR / f'{cat_slug}.json'
            with open(cat_data_path, 'w', encoding='utf-8') as f:
                json.dump({'plasmids': cat_plasmids}, f, ensure_ascii=False, separators=(',', ':'))
            cat_size = cat_data_path.stat().st_size / 1024
            print(f'  {cat_slug}: {len(cat_plasmids)} plasmids ({cat_size:.0f} KB)')

            categories_info.append({
                'slug': cat_slug,
                'name': cat_name,
                'count': len(cat_plasmids),
                'organism': organism,
            })
            all_index_entries.extend(cat_index)
            total += len(cat_plasmids)

    # Write index file
    index = {
        'version': '1.0',
        'generated': datetime.now(timezone.utc).isoformat(),
        'total': total,
        'categories': categories_info,
        'plasmids': all_index_entries,
    }
    index_path = OUT_DIR / 'plasmids-index.json'
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, separators=(',', ':'))

    index_size = index_path.stat().st_size / 1024
    print(f'\nDone: {total} plasmids, {len(categories_info)} categories')
    print(f'Index: {index_size:.0f} KB ({index_path})')
    print(f'Data:  {DATA_DIR}/')


if __name__ == '__main__':
    build()
