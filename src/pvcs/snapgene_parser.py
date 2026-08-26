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
        'primers': [],
        # ANN-0I — features the parser refused, so the UI can report a partial
        # import instead of silently losing biology.
        'rejected': [],
        # ANN-0I — default LINEAR. Topology is owned by the DNA packet flags
        # byte and nothing else; a file without a DNA packet has no molecule,
        # so defaulting to circular could only ever invent a plasmid.
        'topology': 'linear',
        'name': '',
        'description': '',
    }

    # The cookie packet carries the literal 'SnapGene' plus version numbers.
    # It does NOT describe topology: byte 2 is 'a' (0x61), so `& 0x01` was
    # true in every real file and every linear construct was imported as a
    # plasmid. Skip it — the DNA packet below is the only topology source.
    header_len = struct.unpack('>I', data[1:5])[0]

    pos = 5 + header_len

    # Read segments
    while pos + 5 <= len(data):
        seg_type = data[pos]
        seg_len = struct.unpack('>I', data[pos+1:pos+5])[0]
        seg_data = data[pos+5:pos+5+seg_len]
        pos += 5 + seg_len

        if seg_type == 0x00:
            # DNA sequence — byte 0 of the segment is a FLAGS byte, not part of
            # the nucleotide string. Bit 0 (`& 0x01`) is topology: set means
            # circular, clear means linear. (Other bits carry methylation and
            # strand-visibility flags we do not consume.) An earlier comment
            # here claimed `0x02 = circular, 0x01 = linear`; that was wrong in
            # both directions and is corrected to the contract actually
            # implemented below and cross-checked against Biopython's reader.
            #
            # The flags byte is stripped before decoding. Without this, every
            # imported .dna file
            # carried a phantom non-ATGCN char at index 0 (visible to
            # the biolog as a tiny garbled glyph at the very start of
            # the sequence in SequenceView), AND every feature DNA
            # extraction was off-by-1 because the V50 0-based-exclusive
            # coordinate convention assumes index 0 = real position 1.
            # Length-1 now matches snapgene_reader.snapgene_file_to_dict()
            # ['seq'] and BioPython's record.seq exactly. Biolog feedback
            # 04.05.2026 evening: «почему N при импорте добавился? я
            # специально просил всё перепарсить и перекачать чтобы
            # убрать это».
            if len(seg_data) > 0:
                # ANN-0I — bit 0 of the flags byte is the ONLY topology source.
                result['topology'] = 'circular' if (seg_data[0] & 0x01) else 'linear'
                result['sequence'] = seg_data[1:].decode('ascii', errors='ignore').upper()
            else:
                result['sequence'] = ''

        elif seg_type == 0x05:
            # Primers (XML) — the oligos SnapGene stores alongside the
            # molecule. Previously never read, so every embedded primer was
            # lost at import.
            result['primers'] = _parse_primers(
                seg_data.decode('utf-8', errors='ignore'),
                len(result.get('sequence', '')),
                result.get('topology') == 'circular',
            )

        elif seg_type == 0x06:
            # Notes (XML with name, description, accession)
            _parse_notes(seg_data.decode('utf-8', errors='ignore'), result)

        elif seg_type == 0x0A:
            # Features (XML)
            result['features'], rejected = _parse_features(
                seg_data.decode('utf-8', errors='ignore'),
                result.get('sequence', ''),
            )
            result['rejected'].extend(rejected)

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


def _value_of(v_el):
    """One `<V>` element → its value.

    `text` and `predef` are distinct SnapGene forms and are checked separately;
    `int` comes back as a STRING because the frontend parses `codon_start` /
    `transl_table` at its own boundary and must not receive a pre-coerced type.
    A `<V>` with none of those is a valueless flag.
    """
    for attr in ('text', 'predef', 'int'):
        val = v_el.get(attr)
        if val is not None and val != '':
            return val
    if v_el.text and v_el.text.strip():
        return v_el.text.strip()
    return True


def _qualifier_values(q):
    """One `<Q>` → the list of ALL its `<V>` values, in source order.

    A qualifier may hold several `<V>` children (SnapGene writes repeated
    `/note` that way). Reading only the first silently discarded the rest.
    A `<Q>` with no `<V>` at all is a valueless INSDC flag.
    """
    values = [_value_of(v) for v in q.findall('V')]
    return values if values else [True]


def _parse_qualifiers(feat):
    """All `<Q>` children → dict.

    Repetition is preserved in source order, whether it comes from several
    `<Q name="note">` elements or several `<V>` inside one of them. A single
    value stays scalar; a flag stays boolean.
    """
    out = {}
    for q in feat.iter('Q'):
        name = q.get('name', '')
        if not name:
            continue
        for val in _qualifier_values(q):
            if name not in out:
                out[name] = val
                continue
            existing = out[name]
            if isinstance(existing, list):
                existing.append(val)
            else:
                out[name] = [existing, val]
    return out


def _parse_primers(xml_str, seq_len=0, circular=False):
    """SnapGene primer packet (`0x05`) → list of oligo dicts.

    Schema follows the real format, cross-checked against the installed
    Biopython reader (`Bio/SeqIO/SnapGeneIO.py::_parse_primers_packet`):

      * the oligo itself is `Primer@sequence`;
      * a primer may have SEVERAL `BindingSite` children;
      * a site's strand is `boundStrand` — 0 is the top strand, 1 the bottom
        (NOT an attribute called `strand`);
      * `annealedBases` is the stretch that actually anneals;
      * `HybridizationParams` sets the minimum match length and Tm below which
        SnapGene itself hides a site. Importing those would hand the biologist
        primers their own software never showed them, so they are dropped;
      * a duplicate `simplified` site for a location already seen is ignored;
      * an origin-crossing site (`end <= start`, circular only) also reports
        its two ordered `segments`.

    `location` in the XML is 1-based inclusive; `start`/`end` come back
    0-based half-open, matching the feature convention.
    """
    primers = []
    try:
        if not xml_str.strip().startswith('<'):
            return primers
        root = ET.fromstring(
            xml_str if xml_str.strip().startswith(('<Primers', '<?xml'))
            else f'<Primers>{xml_str}</Primers>'
        )

        min_match_len = 0
        min_melting_temp = 0
        for param in root.iter('HybridizationParams'):
            min_match_len = _as_int(param.get('minContinuousMatchLen'), 0)
            min_melting_temp = _as_int(param.get('minMeltingTemperature'), 0)

        for record_index, el in enumerate(root.iter('Primer')):
            sites = []
            all_sites = []
            seen = set()
            for site in el.iter('BindingSite'):
                loc = site.get('location', '') or ''
                if '-' not in loc:
                    continue
                try:
                    a, b = loc.split('-')[:2]
                    start, end = int(a) - 1, int(b)
                except (ValueError, IndexError):
                    continue

                annealed = site.get('annealedBases')
                melting = site.get('meltingTemperature')
                strand = -1 if (site.get('boundStrand', '0') or '0') == '1' else 1
                # ANN-0L — SnapGene writes an origin-crossing binding as
                # `location="391-8"`, i.e. the end precedes the start. That
                # pair is a wrap sentinel, not a drawable range, so the site
                # also carries its two ordered segments. Only a circular
                # molecule can wrap; on a linear one the range is simply
                # impossible and nothing is invented to cover it up.
                segments = None
                if end <= start and circular and seq_len and start < seq_len:
                    segments = [
                        {'start': start, 'end': seq_len},
                        {'start': 0, 'end': end},
                    ]
                elif end > start:
                    segments = [{'start': start, 'end': end}]

                record = {
                    'start': start,
                    'end': end,
                    'strand': strand,
                    'segments': segments,
                    'annealedBases': (annealed or '').upper() or None,
                    'meltingTemperature': _as_float(melting),
                    # ANN-0M — WHICH FORM the file used to state this site.
                    # SnapGene often writes one binding twice, in full and
                    # `simplified`. Two statements of one site may be folded;
                    # two that disagree about any biological fact are two
                    # sites. Without the form the reader cannot tell which
                    # case it has, so Python reports it and folds nothing.
                    'sourceForm': (
                        'simplified'
                        if (site.get('simplified', '0') or '0') == '1'
                        else 'standard'
                    ),
                }
                # Every site is kept for oligo recovery; only the ones SnapGene
                # itself would display go into `sites`.
                all_sites.append(record)

                if annealed is not None and len(annealed) < min_match_len:
                    continue
                if melting is not None and _as_int(melting, 0) < min_melting_temp:
                    continue

                key = (start, end, strand)
                simplified = (site.get('simplified', '0') or '0') == '1'
                if simplified and key in seen:
                    continue
                seen.add(key)
                sites.append(record)

            # ANN-0J — the OLIGO is the stored record, and a real packet often
            # omits `Primer@sequence`. Fall back to the longest annealed stretch
            # across all sites (including sites SnapGene hides), because the
            # oligo the user ordered exists whether or not the software chose to
            # draw a binding site for it.
            sequence = (el.get('sequence', '') or '').strip().upper()
            sequence_source = 'packet'
            if not sequence:
                candidates = [s['annealedBases'] for s in all_sites if s['annealedBases']]
                sequence = max(candidates, key=len) if candidates else ''
                # ANN-0K — this is a CONSERVATIVE reconstruction of the binding
                # half, not a proven ordered oligo. The consumer must not treat
                # the difference between two annealed stretches as a 5' tail.
                sequence_source = 'derived'
            if not sequence:
                # ANN-0L C1 — `<Primer name="inventory-only"/>` states no oligo
                # and shows no binding site. Skipping it deleted a primer the
                # user really owns. An unknown oligo is a gap in what the file
                # told us, not permission to forget the record.
                sequence = None
                sequence_source = 'unknown'

            primers.append({
                'name': el.get('name', '') or 'primer',
                'sequence': sequence,
                # Position in THIS packet, so two records from one file stay
                # tellable apart no matter what else they share.
                'sourceRecordIndex': record_index,
                # 'packet' = read from the file; 'derived' = reconstructed here.
                'sequenceSource': sequence_source,
                'description': el.get('description', '') or '',
                # Only the sites SnapGene would show; may legitimately be empty
                # while the oligo itself is still a stored record.
                'sites': sites,
                # ANN-0K — every site, including the ones SnapGene hides. A
                # hidden site still states which strand the oligo binds, and
                # that fact must settle `direction` rather than defaulting to
                # a silent forward.
                'allSites': all_sites,
                'strand': sites[0]['strand'] if sites else 1,
                'start': sites[0]['start'] if sites else None,
                'end': sites[0]['end'] if sites else None,
            })
    except Exception:
        pass
    return primers


def _as_int(value, default=None):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _as_float(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_features(xml_str, sequence=''):
    """Return `(features, rejected)`.

    A feature whose location cannot be read is collected into `rejected` with a
    reason and does NOT abort the rest of the file — one malformed entry must
    never cost the biologist every later feature.
    """
    features = []
    rejected = []
    try:
        if not xml_str.strip().startswith('<'):
            return features
        root = ET.fromstring(xml_str if xml_str.strip().startswith(('<Features', '<?xml'))
                             else f'<Features>{xml_str}</Features>')

        for feat in root.iter('Feature'):
          # ANN-0J root 5 — isolation is PER FEATURE. A single corrupt entry
          # (bad qualifier, unparsable attribute) previously escaped to the
          # packet-level handler and cost the biologist every feature after it.
          try:
            f = {
                'name': feat.get('name', ''),
                'type': feat.get('type', 'misc_feature'),
                'strand': 1 if feat.get('directionality', '1') != '2' else -1,
                'description': '',
                'color': None,
            }

            # ANN-0I — preserve EVERY qualifier, not just the three the UI
            # happened to read. Repeated names become ordered arrays, a single
            # value stays scalar, and a valueless <Q/> is a boolean flag.
            f['qualifiers'] = _parse_qualifiers(feat)
            label = f['qualifiers'].get('label')
            if label:
                f['name'] = label if isinstance(label, str) else label[0]
            note = f['qualifiers'].get('note')
            if note:
                f['description'] = (note if isinstance(note, str) else note[0])[:300]
            translation = f['qualifiers'].get('translation')
            if translation and isinstance(translation, str):
                f['translation'] = translation

            # Segments → coordinates. A `type="gap"` segment is SnapGene's way
            # of drawing a break between parts; it is NOT biological sequence
            # and must never enter the location or the extracted bases.
            segments = []
            for seg in feat.iter('Segment'):
                if (seg.get('type', '') or '').lower() == 'gap':
                    continue
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
                # SnapGene .dna XML stores ranges as 1-based INCLUSIVE
                # (e.g. AmpR "1626-2486" means positions 1626..2486
                # inclusive, length 861). We normalise to the same shape
                # as `snapgene_reader.snapgene_file_to_dict()` and
                # BioPython's `loc.start/.end`, i.e. 0-based half-open
                # `[start, end)`. This was a 02.05.2026 visual review
                # finding: the previous code labelled the value «0-based»
                # but kept the raw 1-based number, then `pvcs.parser`
                # did `start + 1` AGAIN, shifting every CDS by 2 nt and
                # breaking reading frames everywhere (lacZα 322 instead
                # of 324, AmpR 859 instead of 861, etc.).
                # ANN-0A: every segment is carried through as its own
                # `[start, end)` pair, in the traversal order SnapGene wrote
                # them. Collapsing them to min..max turned a spliced CDS into
                # one span with a false intron, and an origin-crossing feature
                # into a near-full-length molecule (BG-028).
                f['segments'] = [
                    {'start': s[0] - 1, 'end': s[1]} for s in segments
                ]

                # Scalar projection kept for consumers that predate the
                # location contract. It is the bounding span, except across the
                # origin, where `end <= start` marks the wrap.
                wraps = any(
                    f['segments'][i]['start'] < f['segments'][i - 1]['start']
                    for i in range(1, len(f['segments']))
                )
                if wraps:
                    f['start'] = f['segments'][0]['start']
                    f['end'] = f['segments'][-1]['end']
                else:
                    f['start'] = min(s['start'] for s in f['segments'])
                    f['end'] = max(s['end'] for s in f['segments'])

                # Extract sequence for this feature — concatenated segment by
                # segment so a spliced or wrapping feature yields its real
                # bases rather than everything between the outer bounds.
                if sequence:
                    parts = [
                        sequence[s['start']:s['end']]
                        for s in f['segments']
                        if 0 <= s['start'] < s['end'] <= len(sequence)
                    ]
                    if len(parts) == len(f['segments']):
                        feat_seq = ''.join(parts)
                        if f['strand'] == -1:
                            feat_seq = _rc(feat_seq)
                        f['sequence'] = feat_seq

            # Normalize type
            f['type'] = _TYPE_MAP.get(f['type'], f['type'])

            if not segments:
                rejected.append({
                    'name': f.get('name') or feat.get('type', 'feature'),
                    'reason': 'no usable location segments',
                })
                continue
            if f.get('name') and f.get('start') is not None:
                features.append(f)
            else:
                rejected.append({
                    'name': f.get('name') or feat.get('type', 'feature'),
                    'reason': 'missing name or coordinates',
                })
          except Exception as exc:
            rejected.append({
                'name': feat.get('name') or feat.get('type', 'feature'),
                'reason': str(exc)[:200],
            })
            continue

    except Exception as exc:
        rejected.append({'name': 'features packet', 'reason': str(exc)[:200]})

    return features, rejected
