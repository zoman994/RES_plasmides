// Thin REST helpers for the legacy backend (FastAPI).
// v0.6+ does primer design / Tm / Golden-Gate validation entirely on the
// client (`local-primer-design.js`, `tm-calculator.js`, `golden-gate.js`),
// so the server-side variants that used to live here have been dropped.
// Only the read-side metadata calls remain.

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
