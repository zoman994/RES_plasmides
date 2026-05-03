# Refactoring: Region-Based Annotation Model

## Core Problem

Part — a piece of DNA. It doesn't care what it encodes. Annotations are interpretation layers on top of DNA. The same sequence can have multiple interpretations simultaneously.

**Instead of:** "Part is a CDS" or "Part is a promoter"
**Think:** "Part contains REGIONS, each region has its own type"

`Part.type` remains for simplicity (when the entire Part = one type). But the real truth is in annotations.

---

## Architecture: Region as Root Annotation

```javascript
part.annotations = [
  // ═══ REGIONS (level: "region") — define WHAT this DNA is ═══
  // Each region says: "from position X to Y — this is CDS/promoter/etc."
  // There can be MULTIPLE regions in one Part

  { id: "r1", name: "PglaA", type: "promoter",
    start: 0, end: 850, level: "region" },

  { id: "r2", name: "AsCpf1", type: "CDS",
    start: 851, end: 4771, level: "region" },

  { id: "r3", name: "TtrpC", type: "terminator",
    start: 4772, end: 5512, level: "region" },

  // ═══ DETAILS (level: "detail") — bound to parent region ═══

  // Promoter details (DNA level):
  { name: "TATA box", type: "core_promoter",
    start: 815, end: 822, level: "detail",
    regionId: "r1" },
  { name: "CAAT box", type: "core_promoter",
    start: 760, end: 765, level: "detail",
    regionId: "r1" },

  // CDS details (protein level):
  { name: "Signal peptide", type: "signal_peptide",
    start: 851, end: 923, level: "detail",
    regionId: "r2" },
  { name: "RuvC-I", type: "catalytic",
    start: 924, end: 1301, level: "detail",
    regionId: "r2" },
  { name: "His6-tag", type: "tag",
    start: 4717, end: 4771, level: "detail",
    regionId: "r2" },

  // Terminator details:
  { name: "Poly-A signal", type: "poly_a",
    start: 5200, end: 5206, level: "detail",
    regionId: "r3" },

  // ═══ POINTS (level: "point") — global, no region ═══
  { name: "BsaI", type: "restriction_site",
    start: 2105, end: 2111, level: "point" },
  { name: "Stop codon", type: "stop_codon",
    start: 4768, end: 4771, level: "point" },
]
```

---

## How This Solves the Fusion Problem

Promoter + CDS fusion:

```javascript
// Part: PglaA-AsCpf1 (fusion)
// parentIds: ["pgla_id", "ascpf1_id"]

part.annotations = [
  // Two regions in one Part — totally normal
  { id: "r1", name: "PglaA", type: "promoter",
    start: 0, end: 850, level: "region" },
  { id: "r2", name: "AsCpf1", type: "CDS",
    start: 851, end: 4771, level: "region" },

  // Promoter details — bound to r1
  { name: "TATA box", type: "core_promoter",
    start: 815, end: 822, level: "detail",
    regionId: "r1" },   // system knows: this is a PROMOTER detail

  // CDS details — bound to r2
  { name: "Signal peptide", type: "signal_peptide",
    start: 851, end: 923, level: "detail",
    regionId: "r2" },   // system knows: this is a PROTEIN detail
  { name: "RuvC-I", type: "catalytic",
    start: 924, end: 1301, level: "detail",
    regionId: "r2" },
]
```

The system never gets confused — each detail knows which region it belongs to.

---

## Region Render Rules

```javascript
const REGION_RENDER_RULES = {
  CDS: {
    showTranslation: true,
    showDomains: true,
    showCodonUsage: true,
    detailTypes: [
      'signal_peptide', 'propeptide', 'catalytic', 'binding',
      'linker', 'tag', 'cleavage_site', 'active_site',
    ],
    colorScheme: 'protein',
  },

  promoter: {
    showTranslation: false,
    showDomains: false,
    showRegulatory: true,
    detailTypes: [
      'core_promoter', 'enhancer', 'regulatory', 'operator',
      'UAS', 'silencer',
    ],
    colorScheme: 'regulatory',
  },

  terminator: {
    showTranslation: false,
    showDomains: false,
    showHairpin: true,
    detailTypes: [
      'poly_a', 'stem_loop', 'rho_dependent',
    ],
    colorScheme: 'terminator',
  },

  marker: {
    showTranslation: true,
    showDomains: true,
    detailTypes: ['signal_peptide', 'catalytic', 'tag'],
    colorScheme: 'marker',
  },
};
```

---

## Rendering in Components

### PartBlock

```
Simple Part (one region = entire block one color):

  +------------------------------+
  |  AsCpf1                      |
  |  ## Signal ## RuvC ## NUC ## |  <- detail annotations of CDS
  |  3921 bp                     |
  +------------------------------+

Fusion Part (two regions = block with two colored sections):

  +-----------+------------------+
  |  PglaA    |  AsCpf1          |
  |  green    |  ## Sig ## RuvC  |  <- details only on CDS
  |  850 bp   |  3921 bp         |
  +-----------+------------------+
```

### Plasmid Map

```
One Part with two regions = two arcs of different color,
inside CDS arc — sub-arcs for domains:

         PglaA (green arc)
        /                    \
  -----                      -----
  |                                |
  |    AsCpf1 (blue arc)           |
  |    +-- Signal (pink)           |
  |    +-- RuvC-I (dark blue)      |
  |    +-- NUC (light blue)        |
  |    +-- His-tag (green)         |
  |                                |
  -----                      -----
        \                    /
         TtrpC (orange)
```

### Sequence View

```
Position: 850  851  852  853  ...
Region:   #### promoter #### | ######## CDS ########
Detail:   ## TATA box ##     | ## Signal peptide ##
DNA:      ...TATAAATA CCATG  ATG ACA CAG TTC GAG...
antisense:...ATATTTAT GGTAC  TAC TGT GTC AAG CTC...
AA:                          | M   T   Q   F   E
                              ^
                    region boundary — translation
                    starts only inside CDS
```

Amino acids render only under CDS regions. Promoter region — no translation.

---

## Auto-Annotation with Regions

```javascript
export function autoAnnotate(part) {
  const seq = part.sequence.toUpperCase();
  const annotations = [];

  // 1. Determine regions
  const regions = part.annotations?.filter(a => a.level === 'region') || [];

  // If no regions — create one for the entire Part by type
  if (regions.length === 0) {
    const primaryRegion = {
      id: generateRegionId(),
      name: part.name,
      type: part.type,
      start: 0,
      end: seq.length,
      level: 'region',
      auto: true,
    };
    annotations.push(primaryRegion);
    regions.push(primaryRegion);
  }

  // 2. For each region — run corresponding detectors
  for (const region of regions) {
    const regionSeq = seq.slice(region.start, region.end);

    if (region.type === 'CDS' || region.type === 'marker' || region.type === 'gene') {
      // Protein detectors with OFFSET from region start
      const protein = translateDNA(regionSeq);
      // ... signal peptide, tags, linkers, stop codon
      // All coordinates: region.start + localPosition
    }

    if (region.type === 'promoter') {
      // DNA regulatory detectors — search within THIS region
      // Coordinates offset by region.start
    }

    if (region.type === 'terminator') {
      // Terminator detectors with offset
    }
  }

  // 3. Global detectors (RE sites — across entire sequence)
  annotations.push(...detectRestrictionSites(seq));

  return annotations;
}
```

---

## Fusion: How Regions Are Inherited

```javascript
function fuseParts(part1, part2) {
  const junctionPos = part1.sequence.length;

  // part1 annotations — unchanged (coordinates stay same)
  const ann1 = part1.annotations.map(a => ({ ...a }));

  // part2 annotations — SHIFT coordinates
  const ann2 = part2.annotations.map(a => ({
    ...a,
    start: a.start + junctionPos,
    end: a.end + junctionPos,
  }));

  return {
    name: `${part1.name}-${part2.name}`,
    sequence: part1.sequence + part2.sequence,
    type: 'fusion',
    annotations: [...ann1, ...ann2],
    // Both parents' regions are preserved!
    // System sees: "region 0-850 = promoter, 851-4771 = CDS"
  };
}
```

---

## Split: Regions Are Also Split

```javascript
function splitPart(part, position) {
  // Annotations fully in left part
  const leftAnns = part.annotations
    .filter(a => a.end <= position)
    .map(a => ({ ...a }));

  // Annotations fully in right part — SHIFT
  const rightAnns = part.annotations
    .filter(a => a.start >= position)
    .map(a => ({
      ...a,
      start: a.start - position,
      end: a.end - position,
    }));

  // Annotations CROSSING the cut — TRIM into both
  part.annotations
    .filter(a => a.start < position && a.end > position)
    .forEach(a => {
      // Left piece
      leftAnns.push({
        ...a,
        end: position,
        name: `${a.name} (5' part)`,
        trimmed: true,
      });
      // Right piece
      rightAnns.push({
        ...a,
        start: 0,
        end: a.end - position,
        name: `${a.name} (3' part)`,
        trimmed: true,
      });
    });

  return { leftAnns, rightAnns };
}
```

---

## Complete Model Summary

```
Part.annotations[] — SINGLE array, three levels:

level: "region"   — WHAT this DNA is (CDS, promoter, terminator)
                    Determines which detectors to run
                    Determines how to render (translation? regulation?)
                    One Part can have MULTIPLE regions

level: "detail"   — Sub-elements within a region
                    Bound to region via regionId
                    CDS: domains, tags, linkers, signal peptide
                    Promoter: TATA, CAAT, -10/-35, UAS
                    Terminator: poly-A, stem-loop

level: "point"    — Point markers
                    RE sites, stop codons, mutations
                    Can be bound to a region or global
```
