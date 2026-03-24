"""Tests for KLD site-directed mutagenesis primer design."""

from pvcs.kld import (
    design_kld_point_mutation,
    design_kld_insertion,
    design_kld_deletion,
)


def _make_template(length=3000):
    """Create a template with a CDS starting at pos 1."""
    return ("ATGGCTAAAGCTGCTCCT" + "GCTAAA" * ((length - 18) // 6))[:length]


def test_point_mutation_basic():
    template = _make_template()
    # Mutate codon at position 100 (aa ~34)
    result = design_kld_point_mutation(template, position=100, new_codon="CGG",
                                       feature_name="testGene")

    assert result.mutation_type == "point_mutation"
    assert result.position == 100
    assert len(result.primers) == 2
    assert result.primers[0].direction == "forward"
    assert result.primers[1].direction == "reverse"
    assert "CGG" in result.primers[0].sequence  # mutant codon in fwd
    assert len(result.mutant_sequence) == len(template)  # same length
    assert "phosphorylation" in result.warnings[0].lower()


def test_point_mutation_changes_sequence():
    template = _make_template()
    old_codon = template[99:102]
    result = design_kld_point_mutation(template, position=100, new_codon="TTT")

    assert result.mutant_sequence[99:102] == "TTT"
    assert result.mutant_sequence[:99] == template[:99]
    assert result.mutant_sequence[102:] == template[102:]


def test_insertion():
    template = _make_template(1000)
    insert = "CACCATCACCATCACCAT"  # 6xHis
    result = design_kld_insertion(template, position=500, insert_sequence=insert)

    assert result.mutation_type == "insertion"
    assert len(result.mutant_sequence) == len(template) + len(insert)
    assert insert in result.mutant_sequence
    assert len(result.primers) == 2


def test_deletion_basic():
    template = _make_template(1000)
    result = design_kld_deletion(template, start=100, end=130)

    assert result.mutation_type == "deletion"
    assert len(result.mutant_sequence) == len(template) - 31  # inclusive: 100..130 = 31 bp
    assert len(result.primers) == 2


def test_deletion_preserves_flanks():
    template = _make_template(500)
    result = design_kld_deletion(template, start=200, end=250)

    # Before deletion region should be intact
    assert result.mutant_sequence[:199] == template[:199]
    # After deletion region should be intact
    assert result.mutant_sequence[199:] == template[250:]


def test_primers_have_phosphorylation_warning():
    template = _make_template()
    result = design_kld_point_mutation(template, 100, "CGG")
    assert any("phosphorylation" in w.lower() for w in result.warnings)
