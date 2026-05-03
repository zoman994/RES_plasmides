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
import struct
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict
from xml.etree import ElementTree as ET

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


# ═══ SnapGene .dna binary parser ═══

def parse_snapgene_dna(data):
    """Parse a SnapGene .dna binary. Returns dict or None."""
    if isinstance(data, (str, Path)):
        data = Path(data).read_bytes()

    if len(data) < 20 or data[0] != 0x09:
        return None

    result = {'sequence': '', 'features': [], 'topology': 'circular', 'description': ''}

    header_len = struct.unpack('>I', data[1:5])[0]
    header = data[5:5 + header_len]
    if len(header) >= 3:
        result['topology'] = 'circular' if (header[2] & 0x01) else 'linear'

    pos = 5 + header_len
    while pos + 5 <= len(data):
        seg_type = data[pos]
        seg_len = struct.unpack('>I', data[pos+1:pos+5])[0]
        seg_data = data[pos+5:pos+5+seg_len]
        pos += 5 + seg_len

        if seg_type == 0x00:
            # V50.1 fix mirror: byte 0 of the DNA segment is a topology
            # / flags marker (0x02 = circular, 0x01 = linear, 0x1f =
            # multi-flag), NOT part of the actual nucleotide string.
            # Without this strip every plasmid's sequence in
            # public/plasmids-data/*.json (pre-built catalog cache used
            # by Importer) carried a phantom control char at index 0,
            # surfacing in SequenceView as a tiny garbled glyph the
            # biolog read as "N" (visual review 04.05.2026 evening:
            # «я все еще вижу N во всех плазмидах перезагруженных»).
            # The live import path through pvcs/snapgene_parser.py was
            # already fixed in commit ba43007; this script also feeds
            # the public catalog cache directly, so it needs the same
            # fix. TD-PARSER-UNIFY-CATALOG: fold this back into
            # pvcs.snapgene_parser.parse_dna_file for full
            # DEC-PARSER-UNIFY-01 conformance — kept inline here for
            # now to preserve the catalog-specific TYPE_MAP normalisation
            # (which differs from pvcs's _TYPE_MAP).
            if len(seg_data) > 0:
                result['sequence'] = seg_data[1:].decode('ascii', errors='ignore')
            else:
                result['sequence'] = ''
        elif seg_type == 0x06:
            _parse_notes(seg_data.decode('utf-8', errors='ignore'), result)
        elif seg_type == 0x0A:
            result['features'] = _parse_features(seg_data.decode('utf-8', errors='ignore'))

    result['length'] = len(result['sequence'])
    return result if result['sequence'] else None


def _parse_notes(xml_str, result):
    try:
        if not xml_str.strip().startswith('<'):
            return
        root = ET.fromstring(xml_str if xml_str.strip().startswith('<Notes') or xml_str.strip().startswith('<?xml')
                             else f'<Notes>{xml_str}</Notes>')
        for tag in ['Description', './/Description']:
            el = root.find(tag)
            if el is not None and el.text:
                result['description'] = el.text.strip()[:300]
                break
        acc = root.find('.//AccessionNumber')
        if acc is not None and acc.text:
            result['accession'] = acc.text.strip()
    except Exception:
        pass


TYPE_MAP = {
    'CDS': 'CDS', 'gene': 'CDS', 'promoter': 'promoter', 'terminator': 'terminator',
    'rep_origin': 'rep_origin', 'origin of replication': 'rep_origin',
    'primer_bind': 'primer_bind', 'misc_feature': 'misc_feature',
    'sig_peptide': 'signal_peptide', 'regulatory': 'regulatory',
    'protein_bind': 'protein_bind', 'polyA_signal': 'terminator',
    'misc_recomb': 'recombination_site', 'LTR': 'LTR',
}


def _parse_features(xml_str):
    features = []
    try:
        if not xml_str.strip().startswith('<'):
            return features
        root = ET.fromstring(xml_str if xml_str.strip().startswith('<Features') or xml_str.strip().startswith('<?xml')
                             else f'<Features>{xml_str}</Features>')
        for feat in root.iter('Feature'):
            f = {
                'name': feat.get('name', ''),
                'type': TYPE_MAP.get(feat.get('type', ''), feat.get('type', 'misc_feature')),
                'strand': 1 if feat.get('directionality', '1') != '2' else -1,
            }
            for q in feat.iter('Q'):
                v = q.find('V')
                val = (v.get('text', '') or v.text or '') if v is not None else ''
                qn = q.get('name', '')
                if qn == 'label' and val:
                    f['name'] = val
                elif qn == 'note' and val:
                    f['description'] = val[:200]
                elif qn == 'translation' and val:
                    f['protein'] = val

            segments = []
            for seg in feat.iter('Segment'):
                rng = seg.get('range', '')
                if '-' in rng:
                    try:
                        parts = rng.split('-')
                        segments.append((int(parts[0]), int(parts[1])))
                    except (ValueError, IndexError):
                        pass
                color = seg.get('color', '')
                if color and 'color' not in f:
                    f['color'] = color

            if segments:
                f['start'] = min(s[0] for s in segments)
                f['end'] = max(s[1] for s in segments)

            if f.get('name') and f.get('start') is not None:
                features.append(f)
    except Exception:
        pass
    return features


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
