const BASE = '/api';

export async function fetchParts(type) {
  const url = type ? `${BASE}/parts?part_type=${type}` : `${BASE}/parts`;
  const r = await fetch(url);
  return r.json();
}

export async function fetchConstructs() {
  const r = await fetch(`${BASE}/constructs`);
  return r.json();
}

export async function fetchFeatures(constructId) {
  const r = await fetch(`${BASE}/constructs/${constructId}/features`);
  return r.json();
}

export async function designPrimers(fragments, junctions, method, circular, bindingTm) {
  const r = await fetch(`${BASE}/design/primers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fragments, junctions, method, circular,
      bindingTmTarget: bindingTm || 60,
    }),
  });
  return r.json();
}

export async function validateGoldenGate(overhangs, enzyme, fragments) {
  const r = await fetch(`${BASE}/validate/golden-gate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overhangs, enzyme, fragments }),
  });
  return r.json();
}

export async function calcTm(sequence) {
  const r = await fetch(`${BASE}/calc/tm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sequence }),
  });
  return r.json();
}
