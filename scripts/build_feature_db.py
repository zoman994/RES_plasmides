#!/usr/bin/env python3
"""
Build common features database from public sources.

Sources:
  1. Local GenBank/SnapGene files (--input-dir)
  2. NCBI GenBank (hardcoded accessions for fungal/yeast/common elements)
  3. iGEM Registry (optional, --igem flag)

Output: JSON file compatible with BodgeGene feature-detection.js

Usage:
  python build_feature_db.py --output ../gui/designer/public/common-features.json
  python build_feature_db.py --input-dir ~/plasmids/ --output out.json
  python build_feature_db.py --skip-download --input-dir ~/plasmids/ --output out.json
"""

import argparse
import json
import os
import sys
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

try:
    from Bio import SeqIO, Entrez
    from Bio.Seq import Seq
except ImportError:
    print("Error: BioPython required. Install: pip install biopython")
    sys.exit(1)

try:
    from tqdm import tqdm
except ImportError:
    def tqdm(it, **kw):
        return it

# ═══ NCBI accessions for key genetic elements ═══
# ~100 most common elements across bacterial, yeast, fungal, mammalian systems
NCBI_ACCESSIONS = {
    # ═══ MARKERS — Bacterial ═══
    'AmpR': ('V00618', 'marker', 'Beta-lactamase (ampicillin resistance)'),
    'KanR': ('V00359', 'marker', 'Kanamycin resistance (APH)'),
    'CmR': ('V01548', 'marker', 'Chloramphenicol acetyltransferase'),
    'GentR': ('U00004', 'marker', 'Gentamicin resistance (aacC1)'),
    'SpecR': ('M29695', 'marker', 'Spectinomycin resistance (aadA)'),
    'TetR': ('J01830', 'marker', 'Tetracycline resistance'),

    # ═══ MARKERS — Fungal ═══
    'HygR': ('K01193', 'marker', 'Hygromycin B phosphotransferase (hph)'),
    'ZeoR': ('L36850', 'marker', 'Zeocin/Bleomycin resistance (ble)'),
    'NatR': ('AB010386', 'marker', 'Nourseothricin resistance (nat1)'),
    'pyrG_Aniger': ('M19132', 'marker', 'A. niger pyrG (OMP decarboxylase)'),
    'pyrG_Anidulans': ('M17537', 'marker', 'A. nidulans pyrG'),
    'amdS': ('M16371', 'marker', 'A. nidulans amdS (acetamidase)'),
    'niaD': ('M58291', 'marker', 'A. niger niaD (nitrate reductase)'),
    'argB': ('M33829', 'marker', 'A. nidulans argB (ornithine carbamoyltransferase)'),
    'bar': ('X17220', 'marker', 'Bialaphos resistance (phosphinothricin acetyltransferase)'),

    # ═══ MARKERS — Yeast ═══
    'URA3': ('M61503', 'marker', 'S. cerevisiae URA3 (OMP decarboxylase)'),
    'LEU2': ('K02651', 'marker', 'S. cerevisiae LEU2'),
    'TRP1': ('K01654', 'marker', 'S. cerevisiae TRP1'),
    'HIS3': ('K02156', 'marker', 'S. cerevisiae HIS3'),
    'LYS2': ('M10992', 'marker', 'S. cerevisiae LYS2'),
    'ADE2': ('M15547', 'marker', 'S. cerevisiae ADE2'),
    'MET15': ('M18271', 'marker', 'S. cerevisiae MET15'),

    # ═══ MARKERS — Mammalian ═══
    'NeoR': ('V00618', 'marker', 'Neomycin/G418 resistance'),
    'PuroR': ('M25346', 'marker', 'Puromycin N-acetyltransferase'),
    'BsdR': ('M13761', 'marker', 'Blasticidin S deaminase'),

    # ═══ REPORTERS ═══
    'EGFP': ('U55762', 'reporter', 'Enhanced green fluorescent protein'),
    'mCherry': ('AY678264', 'reporter', 'Monomeric red fluorescent protein'),
    'mVenus': ('DQ092360', 'reporter', 'Yellow fluorescent protein mVenus'),
    'mCerulean': ('DQ092361', 'reporter', 'Cyan fluorescent protein mCerulean'),
    'tdTomato': ('AY678269', 'reporter', 'Tandem dimer Tomato red fluorescent'),
    'LacZ': ('V00296', 'reporter', 'Beta-galactosidase (blue/white screening)'),
    'Luciferase_Pp': ('M15077', 'reporter', 'Firefly luciferase (Photinus pyralis)'),
    'Luciferase_Rl': ('M63501', 'reporter', 'Renilla luciferase'),
    'mNeonGreen': ('KC295282', 'reporter', 'Bright green fluorescent protein mNeonGreen'),
    'BFP': ('U70934', 'reporter', 'Blue fluorescent protein (EBFP)'),

    # ═══ PROMOTERS — Bacterial ═══
    'T7': ('V01146', 'promoter', 'T7 bacteriophage promoter'),
    'T5': ('M17356', 'promoter', 'T5 phage PN25 promoter (QE vectors)'),
    'lac': ('J01636', 'promoter', 'E. coli lac operon promoter'),
    'tac': ('K01988', 'promoter', 'tac promoter (trp-lac hybrid)'),
    'trc': ('V01366', 'promoter', 'trc promoter (trp-lac hybrid, strong)'),
    'araBAD': ('K02676', 'promoter', 'E. coli arabinose operon promoter'),
    'rhaBAD': ('X60699', 'promoter', 'E. coli rhamnose operon promoter'),
    'tet': ('J01830', 'promoter', 'Tetracycline-inducible promoter'),

    # ═══ PROMOTERS — Fungal ═══
    'PglaA': ('X00712', 'promoter', 'A. niger glucoamylase promoter (strong, maltose-inducible)'),
    'PgpdA': ('AN0465.4', 'promoter', 'A. nidulans gpdA promoter (constitutive)'),
    'PcbhI': ('M16190', 'promoter', 'T. reesei cbhI promoter (cellulose-inducible)'),
    'Ptef1_An': ('AB205198', 'promoter', 'A. niger tef1 promoter (constitutive, strong)'),
    'PalcA': ('X07856', 'promoter', 'A. nidulans alcA promoter (ethanol-inducible)'),
    'PxlnA': ('Z49892', 'promoter', 'A. niger xlnA promoter (xylose-inducible)'),

    # ═══ PROMOTERS — Yeast ═══
    'PAOX1': ('U96967', 'promoter', 'P. pastoris AOX1 promoter (methanol-inducible, very strong)'),
    'PGAP': ('U62648', 'promoter', 'P. pastoris GAP promoter (constitutive, strong)'),
    'PGAL1': ('X52086', 'promoter', 'S. cerevisiae GAL1 promoter (galactose-inducible)'),
    'PGAL10': ('X52086', 'promoter', 'S. cerevisiae GAL10 promoter'),
    'PADH1': ('V01292', 'promoter', 'S. cerevisiae ADH1 promoter (constitutive)'),
    'PTDH3': ('V01299', 'promoter', 'S. cerevisiae TDH3/GPD promoter (very strong constitutive)'),
    'PCYC1': ('V01298', 'promoter', 'S. cerevisiae CYC1 promoter (weak constitutive)'),
    'PTEF1_Sc': ('M12823', 'promoter', 'S. cerevisiae TEF1 promoter (strong constitutive)'),

    # ═══ PROMOTERS — Mammalian ═══
    'CMV': ('K03104', 'promoter', 'Human CMV immediate-early promoter (very strong)'),
    'SV40': ('J02400', 'promoter', 'Simian virus 40 early promoter/enhancer'),
    'EF1a': ('J04617', 'promoter', 'Human EF-1 alpha promoter (constitutive)'),
    'CAG': ('AB209579', 'promoter', 'CAG promoter (CMV enhancer + chicken beta-actin)'),
    'PGK': ('M11560', 'promoter', 'Mouse PGK promoter (constitutive, moderate)'),
    'UBC': ('D63882', 'promoter', 'Human ubiquitin C promoter'),

    # ═══ TERMINATORS ═══
    'TtrpC': ('X02390', 'terminator', 'A. nidulans trpC terminator'),
    'TcycI': ('V01298', 'terminator', 'S. cerevisiae CYC1 terminator'),
    'TAOX1': ('U96967', 'terminator', 'P. pastoris AOX1 terminator'),
    'T7term': ('V01146', 'terminator', 'T7 transcription terminator'),
    'BGHpA': ('M17298', 'terminator', 'Bovine growth hormone polyadenylation signal'),
    'SV40pA': ('J02400', 'terminator', 'SV40 late polyadenylation signal'),
    'rrnBT1': ('J01871', 'terminator', 'E. coli rrnB T1 transcription terminator'),
    'tADH1': ('V01292', 'terminator', 'S. cerevisiae ADH1 terminator'),
    'TglaA': ('X00712', 'terminator', 'A. niger glucoamylase terminator'),

    # ═══ ORIGINS OF REPLICATION ═══
    'pBR322_ori': ('J01749', 'rep_origin', 'pBR322/ColE1 origin (~15-20 copies)'),
    'pUC_ori': ('L09136', 'rep_origin', 'pUC high-copy origin (~500-700 copies)'),
    'p15A_ori': ('X06403', 'rep_origin', 'p15A origin (~10-12 copies, compatible with ColE1)'),
    'pSC101_ori': ('X01654', 'rep_origin', 'pSC101 origin (~5 copies, temperature-sensitive)'),
    'f1_ori': ('V00604', 'rep_origin', 'f1 phage origin (ssDNA production)'),
    '2micron': ('V01288', 'rep_origin', 'S. cerevisiae 2-micron origin (high-copy)'),
    'CEN_ARS': ('X02882', 'rep_origin', 'S. cerevisiae CEN6/ARS4 (low-copy, stable)'),
    'AMA1': ('AF005623', 'rep_origin', 'A. nidulans AMA1 (autonomous, unstable without selection)'),

    # ═══ SIGNAL PEPTIDES ═══
    'alpha_MF': ('K02638', 'signal_peptide', 'S. cerevisiae alpha-factor prepro signal'),
    'glaA_SP': ('X00712', 'signal_peptide', 'A. niger glucoamylase signal peptide'),
    'cbhI_SP': ('M16190', 'signal_peptide', 'T. reesei cbhI signal peptide'),
    'pelB': ('M14927', 'signal_peptide', 'E. coli pelB signal (periplasmic targeting)'),
    'ompA': ('V00307', 'signal_peptide', 'E. coli ompA signal (periplasmic)'),
    'IgK_leader': ('AH003507', 'signal_peptide', 'Mouse Ig kappa leader (mammalian secretion)'),

    # ═══ TAGS & FUSION DOMAINS ═══
    'GST': ('M14654', 'tag', 'Glutathione S-transferase (26 kDa fusion tag)'),
    'MBP': ('M13577', 'tag', 'Maltose-binding protein (42 kDa solubility tag)'),
    'TrxA': ('X04398', 'tag', 'Thioredoxin A (solubility tag, 12 kDa)'),
    'SUMO': ('AF400258', 'tag', 'SUMO fusion tag (enhanced solubility)'),
    'GFP_tag': ('U55762', 'tag', 'GFP as fusion tag for localization'),

    # ═══ SELF-CLEAVING PEPTIDES ═══
    'T2A': ('AJ311673', 'T2A', 'Thosea asigna virus 2A peptide'),
    'P2A': ('AY424929', 'T2A', 'Porcine teschovirus-1 2A peptide'),
    'E2A': ('AF067198', 'T2A', 'Equine rhinitis A virus 2A peptide'),
    'F2A': ('AJ251562', 'T2A', 'Foot-and-mouth disease virus 2A peptide'),

    # ═══ RECOMBINATION SITES ═══
    'Cre': ('X03453', 'CDS', 'Cre recombinase (bacteriophage P1)'),
    'Flp': ('J01347', 'CDS', 'Flp recombinase (S. cerevisiae 2-micron)'),

    # ═══ CRISPR COMPONENTS ═══
    'SpCas9': ('CP000871', 'CDS', 'S. pyogenes Cas9 nuclease'),
    'dCas9': ('CP000871', 'CDS', 'Catalytically dead Cas9 (D10A, H840A)'),

    # ═══ ENZYMES (common CDS for cloning) ═══
    'GFP_wt': ('L29345', 'CDS', 'Wild-type GFP from Aequorea victoria'),
    'Cas12a': ('CP007089', 'CDS', 'Francisella novicida Cas12a/Cpf1'),
}

Entrez.email = "bodgegene@example.com"


def parse_genbank_file(filepath):
    """Parse a GenBank/SnapGene file, extract features."""
    features = []
    try:
        for fmt in ['genbank', 'snapgene', 'embl']:
            try:
                record = SeqIO.read(filepath, fmt)
                break
            except Exception:
                continue
        else:
            return features

        full_seq = str(record.seq).upper()

        for feat in record.features:
            if feat.type == 'source':
                continue

            name = (feat.qualifiers.get('label', [None])[0]
                    or feat.qualifiers.get('product', [None])[0]
                    or feat.qualifiers.get('gene', [None])[0]
                    or feat.type)

            desc = feat.qualifiers.get('note', [''])[0] if isinstance(
                feat.qualifiers.get('note', ['']), list) else feat.qualifiers.get('note', '')

            start = int(feat.location.start)
            end = int(feat.location.end)
            strand = feat.location.strand or 1

            seq = str(feat.extract(record.seq)).upper()
            if not seq or len(seq) < 10:
                continue

            protein = ''
            if feat.type in ('CDS', 'gene') and len(seq) >= 30:
                try:
                    protein = str(Seq(seq).translate(to_stop=True))
                except Exception:
                    pass

            features.append({
                'name': name,
                'type': normalize_type(feat.type),
                'sequence': seq,
                'protein': protein,
                'length': len(seq),
                'description': desc[:200] if desc else '',
                'source_file': os.path.basename(filepath),
            })

    except Exception as e:
        print(f"  Warning: failed to parse {filepath}: {e}", file=sys.stderr)

    return features


def normalize_type(t):
    """Normalize BioPython feature type to our model."""
    mapping = {
        'CDS': 'CDS', 'gene': 'CDS', 'mRNA': 'CDS',
        'promoter': 'promoter', 'terminator': 'terminator',
        'rep_origin': 'rep_origin', 'oriT': 'rep_origin',
        'sig_peptide': 'signal_peptide', 'signal_peptide': 'signal_peptide',
        'primer_bind': 'primer_bind',
        'misc_feature': 'misc_feature',
        'regulatory': 'regulatory',
    }
    return mapping.get(t, t)


def fetch_ncbi_features():
    """Fetch features from NCBI GenBank."""
    features = []
    print(f"Fetching {len(NCBI_ACCESSIONS)} NCBI accessions...")

    for name, (accession, ftype, desc) in tqdm(NCBI_ACCESSIONS.items()):
        try:
            handle = Entrez.efetch(db="nucleotide", id=accession,
                                   rettype="gb", retmode="text")
            record = SeqIO.read(handle, "genbank")
            handle.close()

            full_seq = str(record.seq).upper()

            # Try to find the specific feature
            best_feat = None
            for feat in record.features:
                if feat.type in ('CDS', 'gene', 'promoter', 'terminator',
                                 'rep_origin', 'sig_peptide', 'misc_feature'):
                    feat_seq = str(feat.extract(record.seq)).upper()
                    if len(feat_seq) > 10:
                        if not best_feat or len(feat_seq) > len(best_feat['sequence']):
                            protein = ''
                            if feat.type in ('CDS', 'gene') and len(feat_seq) >= 30:
                                try:
                                    protein = str(Seq(feat_seq).translate(to_stop=True))
                                except Exception:
                                    pass
                            best_feat = {
                                'name': name,
                                'type': ftype,
                                'sequence': feat_seq,
                                'protein': protein,
                                'length': len(feat_seq),
                                'description': desc,
                                'source_file': f'NCBI:{accession}',
                            }

            if best_feat:
                features.append(best_feat)
            elif len(full_seq) > 10:
                # Use full record as fallback
                protein = ''
                if ftype in ('CDS', 'marker', 'reporter') and len(full_seq) >= 30:
                    try:
                        protein = str(Seq(full_seq).translate(to_stop=True))
                    except Exception:
                        pass
                features.append({
                    'name': name,
                    'type': ftype,
                    'sequence': full_seq[:10000],  # cap at 10kb
                    'protein': protein,
                    'length': len(full_seq),
                    'description': desc,
                    'source_file': f'NCBI:{accession}',
                })

        except Exception as e:
            print(f"  Warning: NCBI fetch failed for {name} ({accession}): {e}",
                  file=sys.stderr)

    return features


def identity(seq1, seq2):
    """Simple pairwise identity (no gaps)."""
    if abs(len(seq1) - len(seq2)) > len(seq1) * 0.1:
        return 0
    shorter, longer = sorted([seq1, seq2], key=len)
    matches = sum(a == b for a, b in zip(shorter, longer))
    return matches / len(longer) if longer else 0


def deduplicate(features, threshold=0.96):
    """Group similar features, keep canonical."""
    # Separate CDS (group by protein) and non-CDS (group by DNA)
    cds_groups = defaultdict(list)
    noncds_groups = []

    for f in features:
        if f.get('protein'):
            cds_groups[f['protein']].append(f)
        else:
            noncds_groups.append(f)

    result = []

    # CDS: one per unique protein
    for protein, group in cds_groups.items():
        canonical = max(group, key=lambda f: len(f.get('description', '')))
        aliases = list(set(f['name'] for f in group if f['name'] != canonical['name']))
        sources = list(set(f['source_file'] for f in group))
        result.append({
            **canonical,
            'aliases': aliases[:10],
            'sourceFiles': sources[:20],
            'variants': len(group),
        })

    # Non-CDS: cluster by DNA identity
    used = set()
    for i, f in enumerate(noncds_groups):
        if i in used:
            continue
        cluster = [f]
        for j in range(i + 1, len(noncds_groups)):
            if j in used:
                continue
            if f['type'] == noncds_groups[j]['type']:
                ident = identity(f['sequence'], noncds_groups[j]['sequence'])
                if ident >= threshold:
                    cluster.append(noncds_groups[j])
                    used.add(j)

        canonical = max(cluster, key=lambda x: len(x.get('description', '')))
        aliases = list(set(x['name'] for x in cluster if x['name'] != canonical['name']))
        sources = list(set(x['source_file'] for x in cluster))
        result.append({
            **canonical,
            'aliases': aliases[:10],
            'sourceFiles': sources[:20],
            'variants': len(cluster),
        })

    return result


def build_database(input_dirs=None, skip_download=False, output_path=None):
    """Main pipeline."""
    all_features = []

    # 1. Local files
    if input_dirs:
        for input_dir in input_dirs:
            p = Path(input_dir)
            if not p.exists():
                print(f"Warning: {input_dir} does not exist, skipping")
                continue

            files = list(p.glob('**/*.gb')) + list(p.glob('**/*.gbk')) + \
                    list(p.glob('**/*.dna')) + list(p.glob('**/*.genbank'))
            print(f"Parsing {len(files)} files from {input_dir}...")

            for f in tqdm(files):
                feats = parse_genbank_file(str(f))
                for feat in feats:
                    feat['source'] = 'local'
                all_features.extend(feats)

    # 2. NCBI
    if not skip_download:
        ncbi_feats = fetch_ncbi_features()
        for f in ncbi_feats:
            f['source'] = 'ncbi'
        all_features.extend(ncbi_feats)

    print(f"\nTotal raw features: {len(all_features)}")

    # 3. Deduplicate
    unique = deduplicate(all_features)
    print(f"After deduplication: {len(unique)}")

    # 4. Assign IDs and clean up
    type_counts = defaultdict(int)
    for i, f in enumerate(unique):
        f['id'] = f'cf_{i + 1:04d}'
        type_counts[f['type']] += 1
        # Remove internal fields
        f.pop('source_file', None)
        # Ensure required fields
        f.setdefault('aliases', [])
        f.setdefault('sourceFiles', [])
        f.setdefault('variants', 1)
        f.setdefault('description', '')
        f.setdefault('protein', '')
        f['proteinLength'] = len(f['protein']) if f['protein'] else 0

    # 5. Build output
    output = {
        'version': '1.0',
        'generated': datetime.now(timezone.utc).isoformat(),
        'stats': {
            'total_unique': len(unique),
            'by_type': dict(type_counts),
        },
        'features': sorted(unique, key=lambda f: (f['type'], f['name'])),
    }

    # 6. Write
    out_path = Path(output_path or 'common-features.json')
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as fp:
        json.dump(output, fp, ensure_ascii=False, indent=2)

    print(f"\nWritten {len(unique)} features to {out_path}")
    print(f"File size: {out_path.stat().st_size / 1024:.1f} KB")
    print(f"Types: {dict(type_counts)}")

    return output


def main():
    parser = argparse.ArgumentParser(
        description='Build common features database for BodgeGene')
    parser.add_argument('--input-dir', nargs='*',
                        help='Directories with .gb/.dna files')
    parser.add_argument('--output', default='common-features.json',
                        help='Output JSON path')
    parser.add_argument('--skip-download', action='store_true',
                        help='Skip NCBI downloads, use only local files')
    args = parser.parse_args()

    build_database(
        input_dirs=args.input_dir,
        skip_download=args.skip_download,
        output_path=args.output,
    )


if __name__ == '__main__':
    main()
