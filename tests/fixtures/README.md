# Test fixtures

Place GenBank (.gb) files here for testing.

Needed:
- `simple_v1.gb` — synthetic construct with a CDS, promoter, terminator
- `simple_v2.gb` — same construct with a single point mutation in the CDS
- `simple_v3.gb` — same construct with an inserted cassette
- `pUC19.gb` — classic reference plasmid (download from Addgene)
- `snapgene/pUC19.dna` — pinned SnapGene binary parser fixture, SHA-256
  `BC24DF0D1E3ED6AC8ABAC1595B69E83C5477F52F408B436F93B6647AE7A54B74`

Claude Code: generate synthetic fixtures with BioPython if real files aren't available.
