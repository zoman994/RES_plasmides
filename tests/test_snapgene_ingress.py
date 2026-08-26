"""ANN-0I — SnapGene `.dna` ingress contract.

Every assertion here runs against a REAL `.dna` byte stream built packet by
packet, not against a hand-made dict, because the defects live in how the
binary is read:

  * topology was taken from byte 2 of the `SnapGene` cookie string — `'a'`,
    i.e. `0x61 & 0x01 == 1` — so EVERY file parsed as circular and a linear
    construct silently became a plasmid;
  * `<Segment type="gap">` was treated as a biological location segment;
  * every qualifier except label/note/translation was dropped, and repeated
    values overwrote each other;
  * the primer packet (`0x05`) was never read at all.

SnapGene layout used below: a file is a sequence of packets
`[type:1][big-endian length:4][payload]`. The first packet is the `0x09`
cookie; `0x00` is DNA (payload byte 0 = flags, bit 0 = circular); `0x05` is
primers; `0x0A` is features; `0x06` is notes.
"""

import struct

import pytest

from pvcs.snapgene_parser import parse_dna_file


# ── synthetic .dna builder ───────────────────────────────────────────────────

def _packet(ptype: int, payload: bytes) -> bytes:
    return bytes([ptype]) + struct.pack('>I', len(payload)) + payload


def build_dna(sequence: str, *, circular: bool,
              features_xml: str | None = None,
              primers_xml: str | None = None) -> bytes:
    """Assemble a minimal but structurally real SnapGene file."""
    # Cookie payload starts with the literal 'SnapGene'; byte 2 is therefore
    # 'a' (0x61) in every real file — which is exactly why reading topology
    # from it always yielded circular.
    cookie = b'SnapGene' + b'\x00\x01' + b'\x00\x0f' + b'\x00\x0f'
    out = _packet(0x09, cookie)
    flags = 0x01 if circular else 0x00
    out += _packet(0x00, bytes([flags]) + sequence.encode('ascii'))
    if features_xml is not None:
        out += _packet(0x0A, features_xml.encode('utf-8'))
    if primers_xml is not None:
        out += _packet(0x05, primers_xml.encode('utf-8'))
    return out


def _write(tmp_path, data: bytes, name='probe.dna'):
    p = tmp_path / name
    p.write_bytes(data)
    return p


SEQ = ('ACGT' * 100)  # 400 bp


# ── 1. topology comes from the DNA packet, never the cookie ──────────────────

def test_linear_dna_stays_linear(tmp_path):
    """The headline defect: a linear .dna must not become a plasmid."""
    path = _write(tmp_path, build_dna(SEQ, circular=False))
    parsed = parse_dna_file(path)
    assert parsed is not None
    assert parsed['topology'] == 'linear'


def test_circular_dna_is_circular(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True))
    parsed = parse_dna_file(path)
    assert parsed['topology'] == 'circular'


def test_topology_ignores_cookie_bytes(tmp_path):
    """Flipping cookie bytes must not change topology — only the DNA flag may."""
    linear = bytearray(build_dna(SEQ, circular=False))
    # corrupt cookie byte 2 ('a') to something with bit 0 clear and set
    for probe in (0x60, 0x61, 0xFF):
        linear[5 + 2] = probe
        parsed = parse_dna_file(_write(tmp_path, bytes(linear), f'c{probe}.dna'))
        assert parsed['topology'] == 'linear', f'cookie byte {probe:#x} changed topology'


def test_sequence_excludes_the_flags_byte(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True))
    parsed = parse_dna_file(path)
    assert parsed['sequence'] == SEQ
    assert parsed['length'] == len(SEQ)


# ── 2. `type="gap"` is not a biological segment ──────────────────────────────

REAL_GAP_REAL = """<Features>
  <Feature name="splitCDS" type="CDS" directionality="1">
    <Segment range="11-40" type="standard"/>
    <Segment range="41-60" type="gap"/>
    <Segment range="61-90" type="standard"/>
    <Q name="label"><V text="splitCDS"/></Q>
  </Feature>
</Features>"""


def test_gap_segment_is_excluded_from_the_location(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True, features_xml=REAL_GAP_REAL))
    feat = parse_dna_file(path)['features'][0]

    # two real segments, 0-based half-open; the gap contributes nothing
    assert feat['segments'] == [{'start': 10, 'end': 40}, {'start': 60, 'end': 90}]
    assert sum(s['end'] - s['start'] for s in feat['segments']) == 60


def test_gap_segment_does_not_reach_the_feature_sequence(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True, features_xml=REAL_GAP_REAL))
    feat = parse_dna_file(path)['features'][0]
    assert len(feat['sequence']) == 60


# ── 3. qualifiers survive with order and repetition ──────────────────────────

RICH_QUALIFIERS = """<Features>
  <Feature name="gene1" type="CDS" directionality="1">
    <Segment range="11-40" type="standard"/>
    <Q name="label"><V text="glaA"/></Q>
    <Q name="note"><V text="first note"/></Q>
    <Q name="note"><V text="second note"/></Q>
    <Q name="db_xref"><V text="GO:0004339"/></Q>
    <Q name="db_xref"><V text="EC:3.2.1.3"/></Q>
    <Q name="gene"><V text="glaA"/></Q>
    <Q name="codon_start"><V int="1"/></Q>
    <Q name="pseudo"/>
  </Feature>
</Features>"""


def test_repeated_qualifiers_become_ordered_arrays(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True, features_xml=RICH_QUALIFIERS))
    q = parse_dna_file(path)['features'][0]['qualifiers']

    assert q['note'] == ['first note', 'second note'], 'source order must be kept'
    assert q['db_xref'] == ['GO:0004339', 'EC:3.2.1.3']


def test_single_valued_qualifier_stays_scalar(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True, features_xml=RICH_QUALIFIERS))
    q = parse_dna_file(path)['features'][0]['qualifiers']
    assert q['gene'] == 'glaA'
    assert q['codon_start'] == '1'


def test_valueless_qualifier_is_a_boolean_flag(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True, features_xml=RICH_QUALIFIERS))
    q = parse_dna_file(path)['features'][0]['qualifiers']
    assert q['pseudo'] is True


# ── 4. primer packet 0x05 ────────────────────────────────────────────────────

# Real SnapGene schema (oracle: Bio/SeqIO/SnapGeneIO.py::_parse_primers_packet):
# the oligo is `Primer@sequence`; each `BindingSite` carries `location`,
# `boundStrand` (0 = top, 1 = bottom), `annealedBases` and `meltingTemperature`;
# a primer may have SEVERAL sites, and sites below `HybridizationParams` are the
# ones SnapGene itself hides.
PRIMERS_XML = """<Primers>
  <HybridizationParams minContinuousMatchLen="10" minMeltingTemperature="40"/>
  <Primer name="fwd_check" sequence="ACGTACGTACGTACGTAC">
    <BindingSite location="11-28" boundStrand="0" annealedBases="ACGTACGTACGTACGTAC" meltingTemperature="55"/>
  </Primer>
  <Primer name="rev_check" sequence="GTACGTACGTACGTACGT">
    <BindingSite location="61-78" boundStrand="1" annealedBases="GTACGTACGTACGTACGT" meltingTemperature="54"/>
  </Primer>
  <Primer name="multi_site" sequence="ACGTACGTACGTACGTAC">
    <BindingSite location="101-118" boundStrand="0" annealedBases="ACGTACGTACGTACGTAC" meltingTemperature="55"/>
    <BindingSite location="201-218" boundStrand="1" annealedBases="ACGTACGTACGTACGTAC" meltingTemperature="52"/>
  </Primer>
  <Primer name="too_short" sequence="ACGTAC">
    <BindingSite location="301-306" boundStrand="0" annealedBases="ACGTAC" meltingTemperature="55"/>
  </Primer>
  <Primer name="too_cold" sequence="ACGTACGTACGTACGTAC">
    <BindingSite location="321-338" boundStrand="0" annealedBases="ACGTACGTACGTACGTAC" meltingTemperature="20"/>
  </Primer>
</Primers>"""


def test_primer_packet_is_parsed(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=PRIMERS_XML))
    primers = parse_dna_file(path)['primers']

    # ANN-0J supersedes the ANN-0I assumption that a primer whose sites are all
    # hidden should disappear. The OLIGO is the inventory item: SnapGene may
    # decline to draw a binding site, but the user still ordered the primer.
    assert [p['name'] for p in primers] == [
        'fwd_check', 'rev_check', 'multi_site', 'too_short', 'too_cold',
    ]
    assert primers[0]['sequence'] == 'ACGTACGTACGTACGTAC'


def test_bound_strand_zero_is_top_and_one_is_bottom(tmp_path):
    """`boundStrand`, not `strand` — 0 is the top strand, 1 the bottom."""
    path = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=PRIMERS_XML))
    primers = parse_dna_file(path)['primers']
    assert primers[0]['sites'][0]['strand'] == 1
    assert primers[1]['sites'][0]['strand'] == -1


def test_primer_keeps_every_binding_site(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=PRIMERS_XML))
    multi = next(p for p in parse_dna_file(path)['primers'] if p['name'] == 'multi_site')
    assert len(multi['sites']) == 2
    assert multi['sites'][0]['start'] == 100
    assert multi['sites'][1]['strand'] == -1


def test_annealed_bases_are_preserved(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=PRIMERS_XML))
    primers = parse_dna_file(path)['primers']
    assert primers[0]['sites'][0]['annealedBases'] == 'ACGTACGTACGTACGTAC'


def test_sites_below_hybridization_params_are_hidden_but_the_oligo_remains(tmp_path):
    """SnapGene hides such SITES; ANN-0J keeps the oligo in inventory.

    OLD assumption (ANN-0I): the whole primer was dropped. That lost oligos the
    biologist had actually stored, so the contract now separates "which binding
    sites are displayable" from "which oligos exist".
    """
    path = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=PRIMERS_XML))
    primers = {p['name']: p for p in parse_dna_file(path)['primers']}

    # annealedBases shorter than minContinuousMatchLen → site hidden, oligo kept
    assert primers['too_short']['sites'] == []
    assert primers['too_short']['sequence'] == 'ACGTAC'
    # meltingTemperature below the minimum → same
    assert primers['too_cold']['sites'] == []
    assert primers['too_cold']['sequence'] == 'ACGTACGTACGTACGTAC'
    # a displayable primer still reports its site
    assert len(primers['fwd_check']['sites']) == 1


def test_primer_binding_site_is_zero_based_half_open(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=PRIMERS_XML))
    primers = parse_dna_file(path)['primers']
    assert primers[0]['sites'][0]['start'] == 10
    assert primers[0]['sites'][0]['end'] == 28


def test_absent_primer_packet_yields_an_empty_list(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True))
    assert parse_dna_file(path)['primers'] == []


# ── 5. a malformed file is still refused ─────────────────────────────────────

def test_non_snapgene_file_is_rejected(tmp_path):
    p = tmp_path / 'bad.dna'
    p.write_bytes(b'not a snapgene file at all')
    assert parse_dna_file(p) is None


def test_real_fixture_still_parses(tmp_path):
    """pUC19.dna is circular and must stay so."""
    from pathlib import Path

    fixture = Path(__file__).parent / 'fixtures' / 'snapgene' / 'pUC19.dna'
    if not fixture.exists():
        pytest.skip('pUC19.dna fixture not present')
    parsed = parse_dna_file(fixture)
    assert parsed['topology'] == 'circular'
    assert parsed['length'] == 2686
    assert parsed['features']


# ═══════════════════════════════════════════════════════════════════════════
# ANN-0J Block 1 — ONE production-shaped packet.
#
# A real SnapGene file does not hand us a synthetic `Primer@sequence` for every
# oligo, does not stop at the first `<V>` in a qualifier, and does not stop
# being readable because one feature is corrupt. This packet carries all of it
# at once, and every assertion pins the exact payload.
# ═══════════════════════════════════════════════════════════════════════════

PROD_FEATURES = """<Features>
  <Feature name="broken" type="CDS" directionality="1">
    <Segment range="not-a-range" type="standard"/>
    <Q name="label"><V text="broken"/></Q>
  </Feature>
  <Feature name="afterBroken" type="CDS" directionality="1">
    <Segment range="11-40" type="standard"/>
    <Q name="label"><V text="afterBroken"/></Q>
    <Q name="note"><V text="one"/><V text="two"/><V text="three"/></Q>
    <Q name="mol_type"><V predef="genomic DNA"/></Q>
    <Q name="pseudo"/>
  </Feature>
  <Feature name="lastOne" type="promoter" directionality="2">
    <Segment range="61-90" type="standard"/>
    <Q name="label"><V text="lastOne"/></Q>
  </Feature>
</Features>"""

# No `sequence` attribute anywhere — the oligo must come from annealedBases.
PROD_PRIMERS = """<Primers>
  <HybridizationParams minContinuousMatchLen="10" minMeltingTemperature="40"/>
  <Primer name="noSeqAttr">
    <BindingSite location="11-28" boundStrand="0" annealedBases="ACGTACGTACGTACGTAC" meltingTemperature="55"/>
  </Primer>
  <Primer name="twoSites">
    <BindingSite location="41-58" boundStrand="0" annealedBases="TTTTACGTACGTACGTAC" meltingTemperature="55"/>
    <BindingSite location="101-118" boundStrand="1" annealedBases="TTTTACGTACGTACGTAC" meltingTemperature="51"/>
  </Primer>
  <Primer name="hiddenSiteOnly">
    <BindingSite location="201-206" boundStrand="0" annealedBases="ACGTAC" meltingTemperature="55"/>
  </Primer>
</Primers>"""


def test_one_malformed_feature_does_not_stop_the_rest(tmp_path):
    """Root 5 — isolation is per feature, not per packet."""
    path = _write(tmp_path, build_dna(SEQ, circular=True, features_xml=PROD_FEATURES))
    parsed = parse_dna_file(path)

    names = [f['name'] for f in parsed['features']]
    assert names == ['afterBroken', 'lastOne'], 'features after the broken one were lost'

    assert [r['name'] for r in parsed['rejected']] == ['broken']
    assert parsed['rejected'][0]['reason']


def test_all_values_inside_one_qualifier_are_kept_in_order(tmp_path):
    """Root 5 — a `<Q>` may hold several `<V>`; only the first was read."""
    path = _write(tmp_path, build_dna(SEQ, circular=True, features_xml=PROD_FEATURES))
    feat = next(f for f in parse_dna_file(path)['features'] if f['name'] == 'afterBroken')
    assert feat['qualifiers']['note'] == ['one', 'two', 'three']


def test_predef_and_flag_qualifier_forms(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True, features_xml=PROD_FEATURES))
    q = next(f for f in parse_dna_file(path)['features'] if f['name'] == 'afterBroken')['qualifiers']
    assert q['mol_type'] == 'genomic DNA'
    assert q['pseudo'] is True


def test_strand_from_directionality_is_exact(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True, features_xml=PROD_FEATURES))
    feats = {f['name']: f for f in parse_dna_file(path)['features']}
    assert feats['afterBroken']['strand'] == 1
    assert feats['lastOne']['strand'] == -1


def test_primer_without_sequence_attribute_is_still_an_oligo(tmp_path):
    """Root 2 — the packet is the source of truth, not a synthetic attribute."""
    path = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=PROD_PRIMERS))
    primers = {p['name']: p for p in parse_dna_file(path)['primers']}

    assert 'noSeqAttr' in primers
    assert primers['noSeqAttr']['sequence'] == 'ACGTACGTACGTACGTAC'


def test_multiple_sites_stay_on_one_primer(tmp_path):
    path = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=PROD_PRIMERS))
    p = next(p for p in parse_dna_file(path)['primers'] if p['name'] == 'twoSites')
    assert len(p['sites']) == 2
    assert [s['strand'] for s in p['sites']] == [1, -1]
    assert p['sites'][0]['start'] == 40
    assert p['sites'][1]['start'] == 100


def test_an_oligo_survives_even_when_every_site_is_hidden(tmp_path):
    """Root 3 — inventory is not the same thing as visible binding sites."""
    path = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=PROD_PRIMERS))
    primers = {p['name']: p for p in parse_dna_file(path)['primers']}

    assert 'hiddenSiteOnly' in primers, 'a stored oligo must not vanish with its site'
    assert primers['hiddenSiteOnly']['sequence'] == 'ACGTAC'
    assert primers['hiddenSiteOnly']['sites'] == []


def test_featureless_dna_keeps_its_primer_inventory(tmp_path):
    """Root 7 — no features must not mean no primers."""
    path = _write(tmp_path, build_dna(SEQ, circular=False, primers_xml=PROD_PRIMERS))
    parsed = parse_dna_file(path)

    assert parsed['features'] == []
    assert [p['name'] for p in parsed['primers']] == ['noSeqAttr', 'twoSites', 'hiddenSiteOnly']
    assert parsed['topology'] == 'linear'


# ═══════════════════════════════════════════════════════════════════════════
# ANN-0K Block 3 — the feature-local exception guard, actually reached.
#
# The earlier isolation test used `range="not-a-range"`, which never raises: it
# takes the routine "no usable location segments" branch. That proved the
# ordinary skip path, NOT the `except` inside the loop. Here one Feature is made
# to THROW during parsing, and the next Feature must still be read.
# ═══════════════════════════════════════════════════════════════════════════

class _ExplodingList(list):
    """Raises the first time a specific Feature's children are iterated."""


def test_a_feature_that_actually_raises_is_isolated(tmp_path, monkeypatch):
    """Root: an exception inside one Feature must not end the packet."""
    import pvcs.snapgene_parser as sp

    real_parse_qualifiers = sp._parse_qualifiers
    calls = {'n': 0}

    def exploding_qualifiers(feat):
        # Blow up on the FIRST feature only — a genuine mid-loop exception,
        # not a tidy validation branch.
        calls['n'] += 1
        if calls['n'] == 1:
            raise ValueError('corrupt qualifier block')
        return real_parse_qualifiers(feat)

    monkeypatch.setattr(sp, '_parse_qualifiers', exploding_qualifiers)

    xml = """<Features>
      <Feature name="explodes" type="CDS" directionality="1">
        <Segment range="11-40" type="standard"/>
        <Q name="label"><V text="explodes"/></Q>
      </Feature>
      <Feature name="survivor" type="CDS" directionality="1">
        <Segment range="61-90" type="standard"/>
        <Q name="label"><V text="survivor"/></Q>
      </Feature>
    </Features>"""

    path = _write(tmp_path, build_dna(SEQ, circular=True, features_xml=xml))
    parsed = sp.parse_dna_file(path)

    # the throwing feature is reported, the next one survives
    assert [f['name'] for f in parsed['features']] == ['survivor']
    reasons = {r['name']: r['reason'] for r in parsed['rejected']}
    assert 'explodes' in reasons
    assert 'corrupt qualifier block' in reasons['explodes']


def test_the_guard_reached_is_the_exception_one_not_the_no_segments_branch(tmp_path):
    """A malformed range takes the ORDINARY branch — a different reason string."""
    xml = """<Features>
      <Feature name="badRange" type="CDS" directionality="1">
        <Segment range="not-a-range" type="standard"/>
        <Q name="label"><V text="badRange"/></Q>
      </Feature>
    </Features>"""
    path = _write(tmp_path, build_dna(SEQ, circular=True, features_xml=xml))
    parsed = parse_dna_file(path)

    reasons = {r['name']: r['reason'] for r in parsed['rejected']}
    assert reasons['badRange'] == 'no usable location segments'


# ---------------------------------------------------------------------------
# ANN-0L - an origin-crossing binding site on a circular molecule.
#
# SnapGene writes such a site as `location="391-8"`: the end is BEFORE the
# start. Read as one span that is the wrap sentinel, not a range - so a
# consumer either draws a 1px sliver or nothing. It has to arrive as two
# ordered segments of ONE site.
# ---------------------------------------------------------------------------

WRAP_PRIMERS_XML = """<?xml version="1.0"?>
<Primers>
  <Primer name="wrap-fwd" sequence="ACGTACGTACGT">
    <BindingSite location="391-8" boundStrand="0" annealedBases="ACGTACGTACGT" meltingTemperature="55"/>
  </Primer>
</Primers>"""


def test_wrapping_binding_site_arrives_as_two_segments(tmp_path):
    p = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=WRAP_PRIMERS_XML))
    out = parse_dna_file(str(p))
    site = out['primers'][0]['sites'][0]
    assert site['segments'] == [{'start': 390, 'end': 400}, {'start': 0, 'end': 8}]
    # one logical site, not two
    assert len(out['primers'][0]['sites']) == 1


def test_wrapping_site_keeps_its_scalar_projection(tmp_path):
    p = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=WRAP_PRIMERS_XML))
    site = parse_dna_file(str(p))['primers'][0]['sites'][0]
    # the scalar pair stays the wrap sentinel, so a legacy reader cannot
    # mistake it for an ordinary forward span
    assert site['start'] == 390
    assert site['end'] == 8


def test_a_LINEAR_molecule_does_not_invent_a_wrap(tmp_path):
    p = _write(tmp_path, build_dna(SEQ, circular=False, primers_xml=WRAP_PRIMERS_XML))
    out = parse_dna_file(str(p))
    site = out['primers'][0]['sites'][0]
    # nothing to wrap around: the site is reported as-is, with no segments
    # conjured out of an impossible range
    assert site.get('segments') is None


def test_an_ordinary_site_reports_one_segment(tmp_path):
    xml = WRAP_PRIMERS_XML.replace('location="391-8"', 'location="11-28"')
    p = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=xml))
    site = parse_dna_file(str(p))['primers'][0]['sites'][0]
    assert site['segments'] == [{'start': 10, 'end': 28}]


# ---------------------------------------------------------------------------
# ANN-0L C1 - a primer record survives without a stated oligo.
#
# `<Primer name="inventory-only"/>` carries no sequence and no annealedBases,
# so the parser reconstructed nothing and `continue`d - deleting a record the
# user really owns. An unknown oligo is a gap in what we know, not grounds to
# forget the primer exists.
# ---------------------------------------------------------------------------

SEQLESS_PRIMERS_XML = """<?xml version="1.0"?>
<Primers>
  <Primer name="inventory-only"/>
  <Primer name="has-oligo" sequence="ACGTACGTACGT">
    <BindingSite location="11-22" boundStrand="0" annealedBases="ACGTACGTACGT" meltingTemperature="55"/>
  </Primer>
</Primers>"""


def test_a_primer_with_no_oligo_and_no_sites_is_still_a_record(tmp_path):
    p = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=SEQLESS_PRIMERS_XML))
    out = parse_dna_file(str(p))
    names = [x['name'] for x in out['primers']]
    assert 'inventory-only' in names


def test_the_unknown_oligo_is_reported_as_unknown_not_as_empty(tmp_path):
    p = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=SEQLESS_PRIMERS_XML))
    rec = next(x for x in parse_dna_file(str(p))['primers'] if x['name'] == 'inventory-only')
    # None = never stated. '' would claim the file said the oligo is empty.
    assert rec['sequence'] is None
    assert rec['sequenceSource'] == 'unknown'
    assert rec['sites'] == []


def test_source_record_index_follows_the_packet_order(tmp_path):
    p = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=SEQLESS_PRIMERS_XML))
    recs = parse_dna_file(str(p))['primers']
    assert [x['sourceRecordIndex'] for x in recs] == [0, 1]
    assert [x['name'] for x in recs] == ['inventory-only', 'has-oligo']


# ---------------------------------------------------------------------------
# ANN-0M root B - the packet's own provenance, carried out of Python.
#
# Two things the JS side cannot reconstruct once they are gone:
#   * WHICH record in the packet this is (`sourceRecordIndex`), which is the
#     only thing telling two identically named oligos apart;
#   * WHICH FORM the file used to state a site (`sourceForm`). SnapGene often
#     writes the same binding twice, once in full and once `simplified`. Two
#     statements of one site may be folded; two statements that disagree about
#     any biological fact are two sites, and without the form the reader cannot
#     tell which case it is looking at.
# ---------------------------------------------------------------------------

PROVENANCE_PRIMERS_XML = """<?xml version="1.0"?>
<Primers>
  <Primer name="dup-name" sequence="ACGTACGTACGT">
    <BindingSite location="11-22" boundStrand="0" annealedBases="ACGTACGTACGT" meltingTemperature="55"/>
    <BindingSite location="11-22" boundStrand="0" annealedBases="ACGTACGTACGT" meltingTemperature="55" simplified="1"/>
  </Primer>
  <Primer name="dup-name" sequence="ACGTACGTACGT">
    <BindingSite location="101-112" boundStrand="0" annealedBases="ACGTACGTACGT" meltingTemperature="61"/>
    <BindingSite location="101-112" boundStrand="0" annealedBases="ACGTACGTACGT" meltingTemperature="49" simplified="1"/>
  </Primer>
</Primers>"""


def _provenance_records(tmp_path):
    p = _write(tmp_path, build_dna(SEQ, circular=True, primers_xml=PROVENANCE_PRIMERS_XML))
    return parse_dna_file(str(p))['primers']


def test_two_identically_named_primers_keep_their_packet_positions(tmp_path):
    recs = _provenance_records(tmp_path)
    assert [r['name'] for r in recs] == ['dup-name', 'dup-name']
    # identical name AND identical oligo - the position is all that separates them
    assert [r['sourceRecordIndex'] for r in recs] == [0, 1]


def test_each_site_reports_the_form_the_file_used(tmp_path):
    recs = _provenance_records(tmp_path)
    forms = [s['sourceForm'] for s in recs[0]['allSites']]
    assert forms == ['standard', 'simplified']


def test_a_simplified_repeat_of_the_same_site_is_still_reported(tmp_path):
    # Python does not decide the fold; it reports both statements and lets the
    # canonical layer decide whether they are the same biological fact.
    recs = _provenance_records(tmp_path)
    assert len(recs[0]['allSites']) == 2


def test_sites_that_disagree_about_melting_temperature_both_survive(tmp_path):
    recs = _provenance_records(tmp_path)
    # same location and strand, different Tm - two different claims by the file
    second = recs[1]['allSites']
    assert [s['meltingTemperature'] for s in second] == [61.0, 49.0]
