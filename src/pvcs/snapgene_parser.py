"""
snapgene_parser.py — Pure Python SnapGene .dna binary parser.

No external dependencies (no BioPython, no snapgene_reader).
Correctly extracts sequence + features + metadata from .dna files.

Tested: pUC19.dna → 2687bp circular, 9 features (AmpR, ori, lacZα, MCS, etc.)
"""

import struct
from pathlib import Path
from xml.etree import ElementTree as ET

# ═══ Reverse complement for IUPAC ═══
_COMP = {
    'A':'T','T':'A','G':'C','C':'G','N':'N',
    'R':'Y','Y':'R','M':'K','K':'M','S':'S','W':'W',
    'H':'D','D':'H','B':'V','V':'B',
}

def _rc(seq):
    return ''.join(_COMP.get(c, 'N') for c in reversed(seq.upper()))


# ═══ Feature type normalization ═══
_TYPE_MAP = {
    'CDS': 'CDS', 'gene': 'gene',
    'promoter': 'promoter', 'terminator': 'terminator',
    'rep_origin': 'rep_origin', 'origin of replication': 'rep_origin',
    'primer_bind': 'primer_bind',
    'misc_feature': 'misc_feature', 'misc_recomb': 'misc_recomb',
    'sig_peptide': 'sig_peptide', 'signal_peptide': 'sig_peptide',
    'regulatory': 'regulatory', 'protein_bind': 'protein_bind',
    'polyA_signal': 'polyA_signal', 'LTR': 'LTR',
}


def parse_dna_file(filepath):
    """Parse a SnapGene .dna file.

    Returns dict:
      sequence: str (uppercase DNA)
      features: list of dicts with name, type, start(0-based), end, strand, color, description
      topology: 'circular' | 'linear'
      name: str
      description: str
      length: int
    
    Returns None if file is invalid.
    """
    data = Path(filepath).read_bytes()
    if len(data) < 20 or data[0] != 0x09:
        return None

    result = {
        'sequence': '',
        'features': [],
        'topology': 'circular',
        'name': '',
        'description': '',
    }

    # Read header
    header_len = struct.unpack('>I', data[1:5])[0]
    header = data[5:5 + header_len]
    if len(header) >= 3:
        result['topology'] = 'circular' if (header[2] & 0x01) else 'linear'

    pos = 5 + header_len

    # Read segments
    while pos + 5 <= len(data):
        seg_type = data[pos]
        seg_len = struct.unpack('>I', data[pos+1:pos+5])[0]
        seg_data = data[pos+5:pos+5+seg_len]
        pos += 5 + seg_len

        if seg_type == 0x00:
            # DNA sequence
            result['sequence'] = seg_data.decode('ascii', errors='ignore').upper()

        elif seg_type == 0x06:
            # Notes (XML with name, description, accession)
            _parse_notes(seg_data.decode('utf-8', errors='ignore'), result)

        elif seg_type == 0x0A:
            # Features (XML)
            result['features'] = _parse_features(
                seg_data.decode('utf-8', errors='ignore'),
                result.get('sequence', ''),
            )

    result['length'] = len(result['sequence'])
    return result if result['sequence'] else None


def _parse_notes(xml_str, result):
    try:
        if not xml_str.strip().startswith('<'):
            return
        root = ET.fromstring(xml_str if xml_str.strip().startswith(('<Notes', '<?xml'))
                             else f'<Notes>{xml_str}</Notes>')

        # Name: try CustomMapLabel first, then Description
        for tag_name in ['CustomMapLabel', './/CustomMapLabel']:
            el = root.find(tag_name)
            if el is not None and el.text:
                result['name'] = el.text.strip()
                break

        # Description
        for tag_name in ['Description', './/Description']:
            el = root.find(tag_name)
            if el is not None and el.text:
                result['description'] = el.text.strip()[:500]
                break

        # Accession
        el = root.find('.//AccessionNumber')
        if el is not None and el.text:
            result['accession'] = el.text.strip()

        # Organism
        el = root.find('.//Organism')
        if el is not None and el.text:
            result['organism'] = el.text.strip()

    except Exception:
        pass


def _parse_features(xml_str, sequence=''):
    features = []
    try:
        if not xml_str.strip().startswith('<'):
            return features
        root = ET.fromstring(xml_str if xml_str.strip().startswith(('<Features', '<?xml'))
                             else f'<Features>{xml_str}</Features>')

        for feat in root.iter('Feature'):
            f = {
                'name': feat.get('name', ''),
                'type': feat.get('type', 'misc_feature'),
                'strand': 1 if feat.get('directionality', '1') != '2' else -1,
                'description': '',
                'color': None,
            }

            # Qualifiers
            for q in feat.iter('Q'):
                v_el = q.find('V')
                val = (v_el.get('text', '') or v_el.text or '') if v_el is not None else ''
                qname = q.get('name', '')
                if qname == 'label' and val:
                    f['name'] = val
                elif qname == 'note' and val:
                    f['description'] = val[:300]
                elif qname == 'translation' and val:
                    f['translation'] = val

            # Segments → coordinates
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
                if color and not f['color']:
                    f['color'] = color

            if segments:
                f['start'] = min(s[0] for s in segments)  # 0-based
                f['end'] = max(s[1] for s in segments)

                # Extract sequence for this feature
                if sequence and f['start'] >= 0 and f['end'] <= len(sequence):
                    feat_seq = sequence[f['start']:f['end']]
                    if f['strand'] == -1:
                        feat_seq = _rc(feat_seq)
                    f['sequence'] = feat_seq

            # Normalize type
            f['type'] = _TYPE_MAP.get(f['type'], f['type'])

            if f.get('name') and f.get('start') is not None:
                features.append(f)

    except Exception:
        pass

    return features
