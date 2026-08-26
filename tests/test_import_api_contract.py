"""ANN-0I — the Python → API boundary must not drop what the parser recovered.

`snapgene_parser` now recovers qualifiers and the primer packet, but that is
worthless if `pvcs.parser` flattens them into an empty dict and `gui/api`
never serialises them. These tests walk the real chain:

    parse_dna_file  →  parse_snapgene (Feature)  →  the /api/import payload

The payload shape is asserted against the same builder the endpoint uses, so a
field silently disappearing from the response is a test failure rather than a
frontend mystery.
"""

import struct

import pytest

from pvcs.parser import parse_snapgene
from pvcs.snapgene_parser import parse_dna_file


def _packet(ptype: int, payload: bytes) -> bytes:
    return bytes([ptype]) + struct.pack('>I', len(payload)) + payload


def build_dna(sequence: str, *, circular: bool,
              features_xml: str | None = None,
              primers_xml: str | None = None) -> bytes:
    cookie = b'SnapGene' + b'\x00\x01' + b'\x00\x0f' + b'\x00\x0f'
    out = _packet(0x09, cookie)
    out += _packet(0x00, bytes([0x01 if circular else 0x00]) + sequence.encode('ascii'))
    if features_xml is not None:
        out += _packet(0x0A, features_xml.encode('utf-8'))
    if primers_xml is not None:
        out += _packet(0x05, primers_xml.encode('utf-8'))
    return out


SEQ = 'ACGT' * 100

FEATURES = """<Features>
  <Feature name="glaA" type="CDS" directionality="1">
    <Segment range="11-40" type="standard"/>
    <Segment range="41-60" type="gap"/>
    <Segment range="61-90" type="standard"/>
    <Q name="label"><V text="glaA"/></Q>
    <Q name="note"><V text="first"/></Q>
    <Q name="note"><V text="second"/></Q>
    <Q name="gene"><V text="glaA"/></Q>
    <Q name="pseudo"/>
  </Feature>
</Features>"""

PRIMERS = """<Primers>
  <Primer name="fwd_check" sequence="ACGTACGTACGTACGTAC">
    <BindingSite location="11-28" strand="0"/>
  </Primer>
</Primers>"""


@pytest.fixture
def dna_path(tmp_path):
    p = tmp_path / 'rich.dna'
    p.write_bytes(build_dna(SEQ, circular=False,
                            features_xml=FEATURES, primers_xml=PRIMERS))
    return p


def _api_payload(sequence, features, meta):
    """Mirror of the /api/import response builder in gui/api/server.py."""
    from gui.api.server import build_import_payload

    return build_import_payload(sequence, features, meta)


# ── Feature-level survival through pvcs.parser ───────────────────────────────

def test_qualifiers_reach_the_feature_dataclass(dna_path):
    _seq, features, _meta = parse_snapgene(dna_path)
    feat = next(f for f in features if f.name == 'glaA')

    assert feat.qualifiers.get('gene') == 'glaA'
    assert feat.qualifiers.get('note') == ['first', 'second']
    assert feat.qualifiers.get('pseudo') is True


def test_gap_is_absent_from_the_feature_segments(dna_path):
    _seq, features, _meta = parse_snapgene(dna_path)
    feat = next(f for f in features if f.name == 'glaA')
    # 1-based inclusive on this side of the boundary
    assert feat.segments == [(11, 40), (61, 90)]


def test_topology_survives_as_linear(dna_path):
    _seq, _features, meta = parse_snapgene(dna_path)
    assert meta.get('topology') == 'linear'


def test_primers_reach_the_parser_metadata(dna_path):
    _seq, _features, meta = parse_snapgene(dna_path)
    primers = meta.get('primers') or []
    assert [p['name'] for p in primers] == ['fwd_check']
    assert primers[0]['sequence'] == 'ACGTACGTACGTACGTAC'


# ── API payload ──────────────────────────────────────────────────────────────

def test_api_payload_carries_qualifiers(dna_path):
    seq, features, meta = parse_snapgene(dna_path)
    payload = _api_payload(seq, features, meta)
    feat = next(f for f in payload['features'] if f['name'] == 'glaA')

    assert feat['qualifiers']['gene'] == 'glaA'
    assert feat['qualifiers']['note'] == ['first', 'second']
    assert feat['qualifiers']['pseudo'] is True


def test_api_payload_carries_primers(dna_path):
    seq, features, meta = parse_snapgene(dna_path)
    payload = _api_payload(seq, features, meta)
    assert [p['name'] for p in payload['primers']] == ['fwd_check']


def test_api_payload_topology_is_linear(dna_path):
    seq, features, meta = parse_snapgene(dna_path)
    payload = _api_payload(seq, features, meta)
    assert payload['topology'] == 'linear'


def test_api_payload_segments_are_zero_based_half_open(dna_path):
    seq, features, meta = parse_snapgene(dna_path)
    payload = _api_payload(seq, features, meta)
    feat = next(f for f in payload['features'] if f['name'] == 'glaA')

    assert feat['segments'] == [
        {'start': 10, 'end': 40},
        {'start': 60, 'end': 90},
    ]
    assert feat['start'] == 10
    assert feat['end'] == 90


def test_api_payload_is_json_serialisable(dna_path):
    import json

    seq, features, meta = parse_snapgene(dna_path)
    payload = _api_payload(seq, features, meta)
    json.dumps(payload)  # must not raise


def test_raw_parser_and_payload_agree_on_primer_count(dna_path):
    raw = parse_dna_file(dna_path)
    seq, features, meta = parse_snapgene(dna_path)
    payload = _api_payload(seq, features, meta)
    assert len(raw['primers']) == len(payload['primers']) == 1


# ═══════════════════════════════════════════════════════════════════════════
# ANN-0K Block 4 — the shared vertical oracle.
#
# A featureless `.dna` carrying only a primer packet is the case every earlier
# layer got wrong: it fell through to the BioPython fallback, lost its topology
# flag and dropped the packet entirely. This posts a production-shaped BINARY to
# the REAL FastAPI route and compares the response against
# `tests/fixtures/ann0k_featureless_primer_payload.json` — the same file the
# Vitest side reads, so the two ends cannot drift apart.
#
# The binary is generated here rather than committed, so the proof manifest
# stays exactly as planned.
# ═══════════════════════════════════════════════════════════════════════════

import json
from pathlib import Path

ORACLE = Path(__file__).parent / 'fixtures' / 'ann0k_featureless_primer_payload.json'

_K_SEQ = 'ACGT' * 150          # 600 bp
_K_TAIL = 'GGATCC'
_K_BIND = _K_SEQ[100:118]

_K_PRIMERS = f"""<Primers>
  <HybridizationParams minContinuousMatchLen="10" minMeltingTemperature="40"/>
  <Primer name="ann0k_fwd" sequence="{_K_TAIL}{_K_BIND}">
    <BindingSite location="101-118" boundStrand="0" annealedBases="{_K_BIND}" meltingTemperature="55"/>
  </Primer>
</Primers>"""


def _featureless_primer_dna() -> bytes:
    """A valid LINEAR .dna with a primer packet and NO features packet."""
    return build_dna(_K_SEQ, circular=False, primers_xml=_K_PRIMERS)


def _multipart(blob: bytes, filename: str, boundary: str = 'ann0kBOUNDARY'):
    """A real RFC-7578 multipart/form-data body, byte for byte."""
    crlf = bytes([13, 10])
    body = (
        b'--' + boundary.encode() + crlf
        + b'Content-Disposition: form-data; name="file"; filename="'
        + filename.encode() + b'"' + crlf
        + b'Content-Type: application/octet-stream' + crlf + crlf
        + blob + crlf
        + b'--' + boundary.encode() + b'--' + crlf
    )
    return body, f'multipart/form-data; boundary={boundary}'


def _post_import(blob: bytes):
    """POST to the REAL `/api/import` through the ASGI application.

    Starlette's `TestClient` needs `httpx`, which this project does not declare
    and `pyproject.toml` is out of scope, so the ASGI app is driven directly
    with a genuine multipart body. This still exercises the whole server seam:
    URL routing, the `UploadFile = File(...)` binding, the handler, and JSON
    response encoding. Only the socket layer is absent.
    """
    import asyncio
    import json as _json

    from gui.api.server import app

    body, content_type = _multipart(blob, 'ann0k_featureless_primer.dna')

    scope = {
        'type': 'http',
        'asgi': {'version': '3.0', 'spec_version': '2.3'},
        'http_version': '1.1',
        'method': 'POST',
        'scheme': 'http',
        'path': '/api/import',
        'raw_path': b'/api/import',
        'query_string': b'',
        'root_path': '',
        'headers': [
            (b'host', b'testserver'),
            (b'content-type', content_type.encode()),
            (b'content-length', str(len(body)).encode()),
        ],
        'client': ('127.0.0.1', 12345),
        'server': ('testserver', 80),
    }

    messages = []

    async def receive():
        return {'type': 'http.request', 'body': body, 'more_body': False}

    async def send(message):
        messages.append(message)

    asyncio.run(app(scope, receive, send))

    start = next(m for m in messages if m['type'] == 'http.response.start')
    payload = b''.join(
        m.get('body', b'') for m in messages if m['type'] == 'http.response.body'
    )
    assert start['status'] == 200, (start['status'], payload[:400])
    return _json.loads(payload.decode('utf-8'))


def test_the_route_is_reached_through_real_routing_and_multipart():
    """Guards the seam itself: a wrong path must 404, not silently pass."""
    import asyncio
    import json as _json

    from gui.api.server import app

    body, content_type = _multipart(b'x', 'x.dna')
    scope = {
        'type': 'http', 'asgi': {'version': '3.0', 'spec_version': '2.3'},
        'http_version': '1.1', 'method': 'POST', 'scheme': 'http',
        'path': '/api/does-not-exist', 'raw_path': b'/api/does-not-exist',
        'query_string': b'', 'root_path': '',
        'headers': [
            (b'host', b'testserver'),
            (b'content-type', content_type.encode()),
            (b'content-length', str(len(body)).encode()),
        ],
        'client': ('127.0.0.1', 12345), 'server': ('testserver', 80),
    }
    messages = []

    async def receive():
        return {'type': 'http.request', 'body': body, 'more_body': False}

    async def send(message):
        messages.append(message)

    asyncio.run(app(scope, receive, send))
    start = next(m for m in messages if m['type'] == 'http.response.start')
    # Real routing decides this: the import handler is NOT reached. The app
    # mounts StaticFiles at '/', so an unknown path answers 405 rather than 404
    # — either way it is a routing refusal, not a silent success.
    assert start['status'] in (404, 405), start['status']
    assert start['status'] != 200
    assert _json is not None


def test_the_oracle_describes_the_case_under_test():
    assert ORACLE.exists(), 'shared oracle missing — the frontend proof reads this file'
    data = json.loads(ORACLE.read_text(encoding='utf-8'))
    assert data['features'] == []
    assert data['topology'] == 'linear'
    assert len(data['primers']) == 1


def test_real_api_import_matches_the_shared_oracle():
    """The live route, not a hand-built dict."""
    expected = json.loads(ORACLE.read_text(encoding='utf-8'))
    actual = _post_import(_featureless_primer_dna())

    # WHOLE payload, not a hand-picked subset: a field appearing, vanishing or
    # changing type is exactly the class of regression this oracle exists to
    # catch, and comparing four keys would let the rest drift unnoticed.
    assert actual == expected

    # …and the oracle really is the case under test, not an empty shell.
    assert expected['topology'] == 'linear'
    assert expected['length'] == 600
    assert expected['features'] == []
    assert len(expected['primers']) == 1


def test_the_featureless_dna_keeps_its_primer_over_the_wire():
    actual = _post_import(_featureless_primer_dna())
    [primer] = actual['primers']

    assert primer['name'] == 'ann0k_fwd'
    assert primer['sequence'] == _K_TAIL + _K_BIND       # full ordered oligo
    assert primer['sites'][0]['annealedBases'] == _K_BIND  # annealing half only
    assert primer['sites'][0]['strand'] == 1


def test_hidden_sites_travel_so_direction_can_be_settled():
    actual = _post_import(_featureless_primer_dna())
    [primer] = actual['primers']
    assert 'allSites' in primer
    assert primer['allSites'][0]['strand'] == 1
