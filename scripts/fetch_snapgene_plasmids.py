#!/usr/bin/env python3
"""
fetch_snapgene_plasmids.py — Download & parse SnapGene's free plasmid library (2,800+).

SnapGene provides 2,800+ annotated .dna files for academic use.
License: free for academic/nonprofit with attribution to snapgene.com/resources.

Download URLs (discovered via network interception):
  XML index:  https://www.snapgene.com/local/fetch.php?set={category}
  .dna file:  https://www.snapgene.com/local/fetch.php?set={category}&plasmid={slug}

Usage:
  pip install requests beautifulsoup4 tqdm
  python fetch_snapgene_plasmids.py --output ../gui/designer/public/plasmids-db.json
  python fetch_snapgene_plasmids.py --categories basic_cloning_vectors,pet_and_duet_vectors_(novagen)
  python fetch_snapgene_plasmids.py --skip-download --download-dir ./snapgene_dna/
"""

import argparse
import json
import os
import sys
import time
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

# ── DEC-PARSER-UNIFY-01: pvcs.snapgene_parser is the single source of
# truth for .dna byte-level parsing. Make it importable when this
# script is run straight from repo root. The catalog still applies its
# own TYPE_MAP overlay below to remap pvcs's preserved feature types
# (gene / sig_peptide / polyA_signal / misc_recomb) into the wider
# catalog vocabulary the frontend Importer expects.
_REPO_SRC = Path(__file__).resolve().parent.parent / 'src'
if _REPO_SRC.is_dir() and str(_REPO_SRC) not in sys.path:
    sys.path.insert(0, str(_REPO_SRC))

from pvcs.snapgene_parser import parse_dna_file as _pvcs_parse_dna_file  # noqa: E402

import requests

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("pip install beautifulsoup4")
    sys.exit(1)

try:
    from tqdm import tqdm
except ImportError:
    def tqdm(it, **kw):
        total = kw.get('total')
        desc = kw.get('desc', '')
        for i, item in enumerate(it):
            if total:
                print(f"\r  {desc} {i+1}/{total}", end='', flush=True)
            yield item
        if total:
            print()

# ═══ Constants ═══

BASE_URL = "https://www.snapgene.com"
FETCH_URL = f"{BASE_URL}/local/fetch.php"
RATE_LIMIT = 0.3  # seconds between requests

ORGANISM_TAGS = {
    "basic_cloning_vectors": "E. coli",
    "pet_and_duet_vectors_(novagen)": "E. coli",
    "pgex_vectors_(ge_healthcare)": "E. coli",
    "qiagen_vectors": "E. coli",
    "ta_and_gc_cloning_vectors": "E. coli",
    "topo_cloning_vectors": "E. coli",
    "lucigen_vectors": "E. coli",
    "structural_genomics_vectors": "E. coli",
    "gateway_cloning_vectors": "E. coli",
    "yeast_plasmids": "Yeast",
    "mammalian_expression_vectors": "Mammalian",
    "fluorescent_protein_genes_and_plasmids": "Multi",
    "viral_expression_and_packaging_vectors": "Mammalian",
    "luciferase_vectors": "Mammalian",
    "crispr_plasmids": "Multi",
    "plant_vectors": "Plant",
    "insect_cell_vectors": "Insect",
    "image_consortium_plasmids": "E. coli",
    "coronavirus_resources": "Virus",
}

CATEGORY_NAMES = {
    "basic_cloning_vectors": "Basic Cloning Vectors",
    "pet_and_duet_vectors_(novagen)": "pET & Duet Vectors",
    "pgex_vectors_(ge_healthcare)": "pGEX Vectors",
    "qiagen_vectors": "Qiagen Vectors",
    "ta_and_gc_cloning_vectors": "TA/GC Cloning",
    "topo_cloning_vectors": "TOPO Cloning",
    "lucigen_vectors": "Lucigen Vectors",
    "structural_genomics_vectors": "Structural Genomics",
    "gateway_cloning_vectors": "Gateway Cloning",
    "yeast_plasmids": "Yeast Plasmids",
    "mammalian_expression_vectors": "Mammalian Expression",
    "fluorescent_protein_genes_and_plasmids": "Fluorescent Proteins",
    "viral_expression_and_packaging_vectors": "Viral Vectors",
    "luciferase_vectors": "Luciferase Vectors",
    "crispr_plasmids": "CRISPR Plasmids",
    "plant_vectors": "Plant Vectors",
    "insect_cell_vectors": "Insect Cell Vectors",
    "image_consortium_plasmids": "I.M.A.G.E. Consortium",
    "coronavirus_resources": "Coronavirus",
}

ONBOARDING_GROUPS = {
    'ecoli': {
        'label': 'E. coli (экспрессия + клонирование)',
        'label_en': 'E. coli (expression + cloning)',
        'categories': ['basic_cloning_vectors', 'pet_and_duet_vectors_(novagen)',
                       'pgex_vectors_(ge_healthcare)', 'qiagen_vectors',
                       'ta_and_gc_cloning_vectors', 'topo_cloning_vectors',
                       'lucigen_vectors', 'gateway_cloning_vectors'],
    },
    'yeast': {
        'label': 'Дрожжи (S. cerevisiae, Pichia)',
        'label_en': 'Yeast (S. cerevisiae, Pichia)',
        'categories': ['yeast_plasmids'],
    },
    'mammalian': {
        'label': 'Млекопитающие',
        'label_en': 'Mammalian',
        'categories': ['mammalian_expression_vectors', 'viral_expression_and_packaging_vectors',
                       'luciferase_vectors'],
    },
    'crispr': {
        'label': 'CRISPR',
        'label_en': 'CRISPR',
        'categories': ['crispr_plasmids'],
    },
    'fluorescent': {
        'label': 'Флуоресцентные белки',
        'label_en': 'Fluorescent proteins',
        'categories': ['fluorescent_protein_genes_and_plasmids'],
    },
    'plant': {
        'label': 'Растения',
        'label_en': 'Plant',
        'categories': ['plant_vectors'],
    },
    'insect': {
        'label': 'Насекомые (бакуловирус)',
        'label_en': 'Insect (baculovirus)',
        'categories': ['insect_cell_vectors'],
    },
    'structural': {
        'label': 'Структурная геномика',
        'label_en': 'Structural genomics',
        'categories': ['structural_genomics_vectors', 'image_consortium_plasmids'],
    },
}


# ═══ SnapGene .dna parser — catalog wrapper around pvcs ═══
#
# Single source of truth for byte-level parsing: pvcs.snapgene_parser.
# This module is the catalog-flavoured layer on top: the same parsed
# dict, with feature types remapped via CATALOG_TYPE_MAP so the catalog
# JSON exposes the wider type vocabulary the frontend Importer expects.
#
# Differences vs pvcs._TYPE_MAP (intentional, catalog-only):
#   gene          → CDS                  (collapse for marker matching)
#   sig_peptide   → signal_peptide       (SBOL-canonical name)
#   polyA_signal  → terminator           (collapse for biology-grouping)
#   misc_recomb   → recombination_site   (descriptive)
# All other types pass through pvcs as-is.
#
# Sprint Parser-Unification follow-up (DEC-PARSER-UNIFY-01): closes
# TD-PARSER-UNIFY-CATALOG. The phantom-byte fix (V50.1, commit ba43007)
# now lives in exactly one place — pvcs.snapgene_parser.parse_dna_file.

CATALOG_TYPE_MAP = {
    # Mappings here are applied OVER pvcs's already-normalised types.
    # Keys are the type strings that pvcs produces; values are catalog
    # canonical types. Anything not in this map passes through unchanged.
    'gene': 'CDS',
    'sig_peptide': 'signal_peptide',
    'polyA_signal': 'terminator',
    'misc_recomb': 'recombination_site',
}


def parse_snapgene_dna(data):
    """Parse a SnapGene .dna binary for CATALOG consumption.

    Thin wrapper around `pvcs.snapgene_parser.parse_dna_file` — delegates
    all byte-level parsing (sequence + features + topology + name +
    description) to the production parser, then post-processes feature
    types into the catalog's wider vocabulary via CATALOG_TYPE_MAP.

    Returns the same dict shape as pvcs.parse_dna_file, with
    `feature['type']` remapped per CATALOG_TYPE_MAP. Returns None for
    invalid / non-.dna input.
    """
    parsed = _pvcs_parse_dna_file(data)
    if not parsed:
        return None
    for f in parsed.get('features', []):
        original = f.get('type', '')
        f['type'] = CATALOG_TYPE_MAP.get(original, original)
    return parsed


# Back-compat alias for callers that historically imported `TYPE_MAP`
# from this module. Points at the catalog overlay; the FULL effective
# mapping (pvcs._TYPE_MAP composed with this overlay) is the actual
# behaviour applied by parse_snapgene_dna.
TYPE_MAP = CATALOG_TYPE_MAP


# ═══ Download pipeline ═══

def get_session():
    s = requests.Session()
    s.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0',
        'Referer': 'https://www.snapgene.com/plasmids/',
    })
    return s


def get_categories(session):
    """Scrape category slugs from main plasmids page."""
    print("Fetching categories...")
    r = session.get(f"{BASE_URL}/plasmids", timeout=15)
    soup = BeautifulSoup(r.text, 'html.parser')
    cats = []
    seen = set()
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.startswith('/plasmids/') and href.count('/') == 2:
            slug = href.split('/')[2]
            if slug and slug not in seen:
                seen.add(slug)
                cats.append(slug)
    print(f"  {len(cats)} categories")
    return cats


def get_plasmid_index(session, category):
    """Get XML index of all plasmids in a category."""
    r = session.get(FETCH_URL, params={'set': category}, timeout=15)
    if r.status_code != 200 or not r.text.startswith('<?xml'):
        return []
    root = ET.fromstring(r.text)
    plasmids = []
    for p in root.findall('.//Plasmid'):
        plasmids.append({
            'name': p.get('name', ''),
            'url': p.get('url', ''),
            'filename': p.get('filename', ''),
        })
    return plasmids


def download_dna(session, category, plasmid_url, download_dir):
    """Download a single .dna file. Returns path or None."""
    safe_name = plasmid_url.replace('/', '_').replace('\\', '_')
    out_path = download_dir / category / f"{safe_name}.dna"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if out_path.exists() and out_path.stat().st_size > 100:
        return out_path

    try:
        time.sleep(RATE_LIMIT)
        r = session.get(FETCH_URL, params={'set': category, 'plasmid': plasmid_url}, timeout=20)
        if r.status_code == 200 and len(r.content) > 20 and r.content[0] == 0x09:
            out_path.write_bytes(r.content)
            return out_path
    except Exception:
        pass
    return None


def plasmid_to_json(parsed, name, category):
    """Convert parsed .dna to BodgeGene JSON."""
    if not parsed or not parsed.get('sequence'):
        return None

    seq = parsed['sequence'].upper()
    annotations = []
    for f in parsed.get('features', []):
        ann = {
            'name': f.get('name', ''),
            'type': f.get('type', 'misc_feature'),
            'start': f.get('start', 0),
            'end': f.get('end', 0),
            'level': 'region',
            'strand': f.get('strand', 1),
            'auto': False,
            'source': 'snapgene',
        }
        if f.get('color'):
            ann['color'] = f['color']
        if f.get('description'):
            ann['description'] = f['description']
        annotations.append(ann)

    return {
        'id': f"sg_{hashlib.md5(seq[:100].encode()).hexdigest()[:10]}",
        'name': name,
        'type': 'plasmid' if parsed.get('topology') == 'circular' else 'linear',
        'sequence': seq,
        'length': len(seq),
        'topology': parsed.get('topology', 'circular'),
        'annotations': annotations,
        'organism': ORGANISM_TAGS.get(category, 'Unknown'),
        'category': CATEGORY_NAMES.get(category, category),
        'categorySlug': category,
        'description': parsed.get('description', ''),
        'accession': parsed.get('accession', ''),
        'source': 'snapgene',
        'status': 'verified',
    }


# ═══ Main ═══

def main():
    ap = argparse.ArgumentParser(description='Download SnapGene plasmid library for BodgeGene')
    ap.add_argument('--output', default='plasmids-db.json')
    ap.add_argument('--download-dir', default='./snapgene_dna')
    ap.add_argument('--categories', default=None, help='Comma-separated slugs (default: all)')
    ap.add_argument('--skip-download', action='store_true', help='Parse existing .dna files only')
    ap.add_argument('--max-per-category', type=int, default=0, help='0 = all')
    args = ap.parse_args()

    dl_dir = Path(args.download_dir)
    dl_dir.mkdir(parents=True, exist_ok=True)
    session = get_session()
    stats = defaultdict(int)

    if not args.skip_download:
        cats = get_categories(session)
        if args.categories:
            wanted = set(args.categories.split(','))
            cats = [c for c in cats if c in wanted]

        for cat in cats:
            time.sleep(0.5)
            index = get_plasmid_index(session, cat)
            if not index:
                print(f"  {cat}: empty or error")
                continue

            if args.max_per_category > 0:
                index = index[:args.max_per_category]

            print(f"\n{cat}: {len(index)} plasmids")
            ok = fail = skip = 0
            for p in tqdm(index, desc=f"  {cat}", total=len(index)):
                path = download_dna(session, cat, p['url'], dl_dir)
                if path:
                    ok += 1
                else:
                    fail += 1
            stats[f'dl_{cat}'] = ok
            if fail:
                stats[f'fail_{cat}'] = fail
            print(f"  OK: {ok}, fail: {fail}")

    # Parse
    print(f"\nParsing .dna files from {dl_dir}...")
    all_plasmids = []
    for dna_file in sorted(dl_dir.rglob('*.dna')):
        try:
            parsed = parse_snapgene_dna(dna_file)
            if not parsed:
                stats['parse_fail'] += 1
                continue
            cat = dna_file.parent.name
            name = dna_file.stem.replace('_', ' ')
            entry = plasmid_to_json(parsed, name, cat)
            if entry:
                all_plasmids.append(entry)
                stats['parsed'] += 1
        except Exception as e:
            stats['parse_error'] += 1

    # Dedup
    seen = {}
    unique = []
    for p in all_plasmids:
        h = hashlib.md5(p['sequence'].encode()).hexdigest()
        if h not in seen:
            seen[h] = True
            unique.append(p)
        else:
            stats['dupes'] += 1

    # Organism breakdown
    by_org = defaultdict(int)
    by_cat = defaultdict(int)
    for p in unique:
        by_org[p['organism']] += 1
        by_cat[p['categorySlug']] += 1

    output = {
        'version': '1.0',
        'generated': datetime.now(timezone.utc).isoformat(),
        'source': 'snapgene.com/plasmids',
        'license': 'Free for academic/nonprofit. Cite: www.snapgene.com/resources',
        'stats': {
            'total': len(unique),
            'by_organism': dict(by_org),
            'by_category': dict(by_cat),
        },
        'onboarding_groups': ONBOARDING_GROUPS,
        'plasmids': unique,
    }

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False)

    size_mb = out.stat().st_size / 1024 / 1024
    print(f"\nDONE: {len(unique)} unique plasmids → {out} ({size_mb:.1f} MB)")
    for org, n in sorted(by_org.items(), key=lambda x: -x[1]):
        print(f"  {org}: {n}")


if __name__ == '__main__':
    main()
