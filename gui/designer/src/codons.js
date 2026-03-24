/** Codon table + usage frequencies for 5 organisms. */

export const CODON_TABLE = {
  TTT:'F',TTC:'F',TTA:'L',TTG:'L',CTT:'L',CTC:'L',CTA:'L',CTG:'L',
  ATT:'I',ATC:'I',ATA:'I',ATG:'M',GTT:'V',GTC:'V',GTA:'V',GTG:'V',
  TCT:'S',TCC:'S',TCA:'S',TCG:'S',CCT:'P',CCC:'P',CCA:'P',CCG:'P',
  ACT:'T',ACC:'T',ACA:'T',ACG:'T',GCT:'A',GCC:'A',GCA:'A',GCG:'A',
  TAT:'Y',TAC:'Y',TAA:'*',TAG:'*',CAT:'H',CAC:'H',CAA:'Q',CAG:'Q',
  AAT:'N',AAC:'N',AAA:'K',AAG:'K',GAT:'D',GAC:'D',GAA:'E',GAG:'E',
  TGT:'C',TGC:'C',TGA:'*',TGG:'W',CGT:'R',CGC:'R',CGA:'R',CGG:'R',
  AGT:'S',AGC:'S',AGA:'R',AGG:'R',GGT:'G',GGC:'G',GGA:'G',GGG:'G',
};

export const AA_NAMES = {
  A:'Ala',R:'Arg',N:'Asn',D:'Asp',C:'Cys',E:'Glu',Q:'Gln',G:'Gly',
  H:'His',I:'Ile',L:'Leu',K:'Lys',M:'Met',F:'Phe',P:'Pro',S:'Ser',
  T:'Thr',W:'Trp',Y:'Tyr',V:'Val','*':'Stop',
};

// Codon usage frequencies (per 1000 codons) for key organisms
// Sources: Kazusa codon usage database
const USAGE = {
  'A. niger': {
    TTT:17,TTC:26,TTA:5,TTG:12,CTT:18,CTC:30,CTA:5,CTG:15,ATT:18,ATC:30,ATA:5,ATG:22,
    GTT:16,GTC:27,GTA:5,GTG:15,TCT:14,TCC:22,TCA:10,TCG:14,CCT:13,CCC:16,CCA:12,CCG:10,
    ACT:14,ACC:25,ACA:10,ACG:12,GCT:18,GCC:30,GCA:10,GCG:12,TAT:10,TAC:20,TAA:1,TAG:0.5,
    CAT:10,CAC:18,CAA:12,CAG:20,AAT:14,AAC:25,AAA:18,AAG:30,GAT:20,GAC:30,GAA:22,GAG:30,
    TGT:6,TGC:12,TGA:0.5,TGG:13,CGT:8,CGC:14,CGA:5,CGG:8,AGT:8,AGC:16,AGA:6,AGG:8,
    GGT:14,GGC:22,GGA:10,GGG:8,
  },
  'E. coli': {
    TTT:22,TTC:16,TTA:14,TTG:13,CTT:11,CTC:11,CTA:4,CTG:52,ATT:30,ATC:25,ATA:5,ATG:28,
    GTT:18,GTC:15,GTA:11,GTG:26,TCT:9,TCC:9,TCA:7,TCG:9,CCT:7,CCC:6,CCA:8,CCG:23,
    ACT:9,ACC:23,ACA:7,ACG:14,GCT:15,GCC:25,GCA:20,GCG:33,TAT:16,TAC:12,TAA:2,TAG:0.3,
    CAT:13,CAC:10,CAA:15,CAG:29,AAT:18,AAC:22,AAA:34,AAG:11,GAT:32,GAC:19,GAA:39,GAG:18,
    TGT:5,TGC:6,TGA:1,TGG:15,CGT:21,CGC:22,CGA:4,CGG:6,AGT:9,AGC:16,AGA:2,AGG:1,
    GGT:25,GGC:29,GGA:8,GGG:11,
  },
  'S. cerevisiae': {
    TTT:26,TTC:18,TTA:27,TTG:27,CTT:12,CTC:5,CTA:14,CTG:10,ATT:30,ATC:17,ATA:18,ATG:21,
    GTT:22,GTC:12,GTA:12,GTG:11,TCT:24,TCC:14,TCA:19,TCG:9,CCT:14,CCC:7,CCA:18,CCG:5,
    ACT:20,ACC:13,ACA:18,ACG:8,GCT:21,GCC:13,GCA:16,GCG:6,TAT:19,TAC:15,TAA:1,TAG:0.5,
    CAT:14,CAC:8,CAA:28,CAG:12,AAT:37,AAC:25,AAA:42,AAG:31,GAT:38,GAC:20,GAA:46,GAG:19,
    TGT:8,TGC:5,TGA:0.7,TGG:10,CGT:6,CGC:3,CGA:3,CGG:2,AGT:14,AGC:10,AGA:21,AGG:9,
    GGT:24,GGC:10,GGA:11,GGG:6,
  },
  'T. reesei': {
    TTT:14,TTC:28,TTA:5,TTG:14,CTT:16,CTC:30,CTA:5,CTG:16,ATT:16,ATC:30,ATA:4,ATG:22,
    GTT:14,GTC:28,GTA:4,GTG:16,TCT:16,TCC:24,TCA:8,TCG:12,CCT:14,CCC:18,CCA:10,CCG:10,
    ACT:14,ACC:26,ACA:8,ACG:10,GCT:18,GCC:32,GCA:8,GCG:10,TAT:8,TAC:22,TAA:1,TAG:0.5,
    CAT:8,CAC:20,CAA:10,CAG:22,AAT:12,AAC:28,AAA:14,AAG:32,GAT:18,GAC:32,GAA:18,GAG:32,
    TGT:4,TGC:14,TGA:0.5,TGG:14,CGT:10,CGC:16,CGA:4,CGG:8,AGT:6,AGC:18,AGA:4,AGG:6,
    GGT:16,GGC:24,GGA:8,GGG:6,
  },
  'P. pastoris': {
    TTT:24,TTC:20,TTA:18,TTG:28,CTT:14,CTC:8,CTA:10,CTG:12,ATT:30,ATC:18,ATA:12,ATG:20,
    GTT:24,GTC:14,GTA:10,GTG:14,TCT:22,TCC:16,TCA:16,TCG:8,CCT:14,CCC:8,CCA:20,CCG:6,
    ACT:20,ACC:16,ACA:16,ACG:8,GCT:24,GCC:16,GCA:14,GCG:6,TAT:16,TAC:16,TAA:1,TAG:0.5,
    CAT:14,CAC:10,CAA:26,CAG:14,AAT:30,AAC:22,AAA:36,AAG:28,GAT:34,GAC:20,GAA:40,GAG:22,
    TGT:8,TGC:6,TGA:0.5,TGG:12,CGT:8,CGC:4,CGA:4,CGG:4,AGT:14,AGC:10,AGA:18,AGG:8,
    GGT:22,GGC:12,GGA:12,GGG:6,
  },
};

export const ORGANISMS = Object.keys(USAGE);

export function translateDNA(dna) {
  let p = '';
  for (let i = 0; i + 2 < dna.length; i += 3) p += CODON_TABLE[dna.slice(i, i + 3).toUpperCase()] || 'X';
  return p;
}

export function translateCodon(codon) {
  return CODON_TABLE[codon.toUpperCase()] || '?';
}

/** Get all codons for an amino acid, sorted by usage frequency for organism. */
export function getCodonsForAA(aa, organism = 'E. coli') {
  const usage = USAGE[organism] || USAGE['E. coli'];
  const codons = Object.entries(CODON_TABLE)
    .filter(([, a]) => a === aa)
    .map(([codon]) => ({ codon, frequency: usage[codon] || 0 }))
    .sort((a, b) => b.frequency - a.frequency);
  return codons;
}

/** Get the most-used codon for an amino acid in given organism. */
export function getBestCodon(aa, organism = 'E. coli') {
  const codons = getCodonsForAA(aa, organism);
  return codons.length > 0 ? codons[0].codon : 'NNN';
}
