#!/usr/bin/env python3
"""
build_features_from_snapgene.py — Build common-features.json from 2822 SnapGene .dna files.

SnapGene files have perfectly curated annotations with correct coordinates.
This is 100x more reliable than scraping NCBI.

Output: common-features.json with verified protein/DNA sequences for:
  - CDS (markers, reporters, resistance genes)
  - Promoters
  - Terminators
  - Origins of replication
  - Signal peptides, tags

Usage:
  python build_features_from_snapgene.py --dna-dir ./snapgene_dna/ --output ../gui/designer/public/common-features.json

Sprint Parser-Unification (03.05.2026):
  Inline parse_dna() / parse_features_xml() were removed. Parsing is now
  delegated to `pvcs.snapgene_parser.parse_dna_file` — the same single
  source of truth used by the live import pipeline (DEC-PARSER-UNIFY-01).
  This script keeps responsibility for post-processing only:
  classification, dedup, aggregation (DEC-PARSER-UNIFY-02).
"""

import argparse
import json
import hashlib
import sys
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

# ── Make `pvcs` importable when this script is run straight from
# repo root (`python scripts/build_features_from_snapgene.py …`) without
# having `pip install -e .` first. Idempotent — pip-editable installs
# already have the path on sys.path and the insert is a no-op then.
_REPO_SRC = Path(__file__).resolve().parent.parent / 'src'
if _REPO_SRC.is_dir() and str(_REPO_SRC) not in sys.path:
    sys.path.insert(0, str(_REPO_SRC))

from pvcs.snapgene_parser import parse_dna_file  # noqa: E402

# ═══ Codon table ═══
CODON_TABLE = {
    'TTT':'F','TTC':'F','TTA':'L','TTG':'L','CTT':'L','CTC':'L','CTA':'L','CTG':'L',
    'ATT':'I','ATC':'I','ATA':'I','ATG':'M','GTT':'V','GTC':'V','GTA':'V','GTG':'V',
    'TCT':'S','TCC':'S','TCA':'S','TCG':'S','CCT':'P','CCC':'P','CCA':'P','CCG':'P',
    'ACT':'T','ACC':'T','ACA':'T','ACG':'T','GCT':'A','GCC':'A','GCA':'A','GCG':'A',
    'TAT':'Y','TAC':'Y','TAA':'*','TAG':'*','CAT':'H','CAC':'H','CAA':'Q','CAG':'Q',
    'AAT':'N','AAC':'N','AAA':'K','AAG':'K','GAT':'D','GAC':'D','GAA':'E','GAG':'E',
    'TGT':'C','TGC':'C','TGA':'*','TGG':'W','CGT':'R','CGC':'R','CGA':'R','CGG':'R',
    'AGT':'S','AGC':'S','AGA':'R','AGG':'R','GGT':'G','GGC':'G','GGA':'G','GGG':'G',
}

def translate(dna):
    prot = []
    for i in range(0, len(dna) - 2, 3):
        codon = dna[i:i+3].upper()
        prot.append(CODON_TABLE.get(codon, '?'))
    return ''.join(prot)

# ═══ Feature type mapping ═══

# SnapGene types → BodgeGene types
TYPE_MAP = {
    'CDS': 'CDS',
    'gene': 'CDS',
    'promoter': 'promoter',
    'terminator': 'terminator',
    'rep_origin': 'rep_origin',
    'primer_bind': None,  # skip
    'misc_feature': None,  # too generic
    'misc_recomb': None,
    'protein_bind': None,
    'regulatory': 'regulatory',
    'sig_peptide': 'signal_peptide',
    'polyA_signal': 'terminator',
}

# Well-known resistance markers (by name pattern)
MARKER_PATTERNS = [
    'AmpR', 'KanR', 'CmR', 'TetR', 'HygR', 'ZeoR', 'BleoR', 'NeoR', 'GenR',
    'SmR', 'SpcR', 'EryR', 'PuroR', 'BsdR', 'NatR',
    'ampicillin', 'kanamycin', 'chloramphenicol', 'tetracycline', 'hygromycin',
    'zeocin', 'bleomycin', 'neomycin', 'gentamicin', 'puromycin', 'blasticidin',
    'nourseothricin', 'bla', 'aph', 'cat', 'tet',
    'URA3', 'LEU2', 'TRP1', 'HIS3', 'LYS2', 'ADE2', 'MET15',
    'pyrG', 'amdS', 'hph', 'nat', 'ble',
]

REPORTER_PATTERNS = [
    'GFP', 'EGFP', 'eGFP', 'mCherry', 'mRFP', 'RFP', 'YFP', 'CFP', 'BFP',
    'mNeonGreen', 'mScarlet', 'tdTomato', 'Venus', 'Citrine', 'Cerulean',
    'luciferase', 'Luc', 'NanoLuc', 'LacZ', 'lacZ', 'GUS', 'SEAP',
]

ORIGIN_PATTERNS = [
    'ori', 'pBR322', 'pUC', 'ColE1', 'p15A', 'pSC101', 'R6K',
    'f1 ori', 'pMB1', '2 micron', '2μ', 'ARS', 'CEN',
]


def classify_feature(feat):
    """Classify a feature into BodgeGene type."""
    sg_type = feat.get('type', '')
    name = feat.get('name', '')
    name_lower = name.lower()

    # Map SnapGene type
    bg_type = TYPE_MAP.get(sg_type)
    if bg_type is None and sg_type not in TYPE_MAP:
        bg_type = 'misc_feature'

    # Reclassify by name patterns
    if bg_type == 'CDS' or sg_type in ('CDS', 'gene'):
        for pat in MARKER_PATTERNS:
            if pat.lower() in name_lower:
                return 'marker'
        for pat in REPORTER_PATTERNS:
            if pat.lower() in name_lower:
                return 'reporter'
        return 'CDS'

    if any(pat.lower() in name_lower for pat in ORIGIN_PATTERNS):
        return 'rep_origin'

    return bg_type


# ═══ Main pipeline ═══

def main():
    ap = argparse.ArgumentParser(description='Build common-features.json from SnapGene .dna files')
    ap.add_argument('--dna-dir', default='./snapgene_dna', help='Directory with .dna files')
    ap.add_argument('--output', default='../gui/designer/public/common-features.json')
    ap.add_argument('--min-occurrences', type=int, default=3,
                    help='Minimum plasmids containing feature to include (default: 3)')
    ap.add_argument('--min-length', type=int, default=30,
                    help='Minimum feature DNA length in bp (default: 30)')
    ap.add_argument('--verbose', '-v', action='store_true')
    args = ap.parse_args()

    dna_dir = Path(args.dna_dir)
    if not dna_dir.exists():
        print(f"Error: {dna_dir} not found", file=sys.stderr)
        sys.exit(1)

    dna_files = list(dna_dir.rglob('*.dna'))
    print(f"Found {len(dna_files)} .dna files")

    # ═══ Pass 1: Extract all features ═══
    raw_features = []  # (name, type, dna_seq, protein, source_plasmid, strand)
    parse_ok = 0
    parse_fail = 0

    for dna_file in dna_files:
        try:
            parsed = parse_dna_file(dna_file)
        except Exception as e:
            parse_fail += 1
            if args.verbose:
                print(f"  parse error: {dna_file.name}: {e}", file=sys.stderr)
            continue
        if not parsed or not parsed.get('sequence'):
            parse_fail += 1
            continue
        parse_ok += 1
        seq = parsed['sequence']
        plasmid_name = parsed.get('name') or dna_file.stem

        for feat in parsed.get('features', []):
            start = feat.get('start', 0)
            end = feat.get('end', 0)
            if end <= start or (end - start) < args.min_length:
                continue

            bg_type = classify_feature(feat)
            if bg_type is None:
                continue

            # parse_dna_file already extracts the per-feature DNA sequence,
            # honouring strand (reverse-complemented for strand=-1). Trust
            # it rather than re-slicing: this means a single source of
            # truth for slice boundaries (DEC-PARSER-COORD-01) and any
            # future segment-aware features (joined exons, …) flow
            # through the parser, not through us.
            feat_dna = feat.get('sequence') or seq[start:end]

            # Get protein (from SnapGene annotation or translate ourselves)
            # pvcs.snapgene_parser stores the SnapGene 'translation'
            # qualifier under that exact key (mirrors GenBank / BioPython
            # naming). The legacy inline parser called it 'protein' —
            # that key is now gone, so always read 'translation' here.
            protein = feat.get('translation', '') or feat.get('protein', '')
            if not protein and bg_type in ('CDS', 'marker', 'reporter'):
                protein = translate(feat_dna)
                # Trim after first stop
                if '*' in protein:
                    protein = protein[:protein.index('*')]

            raw_features.append({
                'name': feat.get('name', 'unknown'),
                'type': bg_type,
                'dna': feat_dna,
                'protein': protein,
                'length': len(feat_dna),
                'source': plasmid_name,
                'description': feat.get('description', ''),
            })

    print(f"Parsed: {parse_ok} OK, {parse_fail} failed")
    print(f"Raw features extracted: {len(raw_features)}")

    # ═══ Pass 2: Deduplicate by protein (CDS) or DNA (non-CDS) ═══
    # Group by (normalized_name, type)
    groups = defaultdict(list)
    for f in raw_features:
        # Normalize name for grouping
        norm_name = f['name'].strip()
        # Remove common suffixes/prefixes
        for suffix in [' (rev)', ' (fwd)', ' resistance', ' gene', ' ORF']:
            norm_name = norm_name.replace(suffix, '')
        key = (norm_name, f['type'])
        groups[key].append(f)

    # Select best representative from each group
    features_out = []
    stats = defaultdict(int)

    for (name, ftype), members in groups.items():
        if len(members) < args.min_occurrences:
            continue

        # Pick the most common sequence (by hash)
        seq_counts = defaultdict(list)
        for m in members:
            key = m['protein'] if m['protein'] else m['dna']
            h = hashlib.md5(key.encode()).hexdigest()
            seq_counts[h].append(m)

        # Most frequent variant
        best_hash = max(seq_counts, key=lambda h: len(seq_counts[h]))
        best = seq_counts[best_hash][0]
        occurrence_count = len(members)
        variant_count = len(seq_counts)

        # Build feature entry
        feature = {
            'name': name,
            'type': ftype,
            'sequence': best['dna'],
            'protein': best['protein'] if best['protein'] else '',
            'length': best['length'],
            'description': best.get('description', ''),
            'source': 'snapgene_library',
            'aliases': [],
            'sourceFiles': list(set(m['source'] for m in members))[:10],
            'variants': variant_count,
            'occurrences': occurrence_count,
            'id': f"cf_{hashlib.md5(f'{name}_{ftype}'.encode()).hexdigest()[:6]}",
        }

        # Collect aliases (different names for same sequence)
        all_names = set(m['name'] for m in members)
        if len(all_names) > 1:
            feature['aliases'] = sorted(all_names - {name})[:5]

        features_out.append(feature)
        stats[ftype] += 1

        if args.verbose:
            print(f"  {name:30s} type={ftype:15s} {best['length']:>5}bp prot={len(best['protein']):>4}aa  in {occurrence_count} plasmids ({variant_count} variants)")

    # Sort: markers first, then by occurrences
    type_order = {'marker': 0, 'reporter': 1, 'CDS': 2, 'promoter': 3, 'terminator': 4, 'rep_origin': 5, 'signal_peptide': 6, 'regulatory': 7}
    features_out.sort(key=lambda f: (type_order.get(f['type'], 99), -f['occurrences']))

    # ═══ Output ═══
    output = {
        'version': '2.0',
        'generated': datetime.now(timezone.utc).isoformat(),
        'source': 'SnapGene plasmid library (2822 files)',
        'stats': {
            'total_unique': len(features_out),
            'by_type': dict(stats),
            'source_plasmids': parse_ok,
        },
        'features': features_out,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    size_kb = out_path.stat().st_size / 1024
    print(f"\nOutput: {out_path} ({size_kb:.0f} KB)")
    print(f"Features: {len(features_out)}")
    for t, n in sorted(stats.items(), key=lambda x: -x[1]):
        print(f"  {t}: {n}")


if __name__ == '__main__':
    main()
