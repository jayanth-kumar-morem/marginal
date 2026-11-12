//! E2.1: one error enum, stable string codes, and it covers every code the SDD documents.

use marginal_core::CoreError;
use std::collections::HashSet;

#[test]
fn codes_are_unique_well_formed_and_round_trip() {
    let mut seen = HashSet::new();
    for e in CoreError::ALL {
        let code = e.code();
        assert!(code.starts_with("E_") && code.len() > 2, "{code}");
        assert!(
            code.bytes()
                .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_'),
            "{code}"
        );
        assert!(seen.insert(code), "duplicate code {code}");
        assert_eq!(CoreError::from_code(code), Some(*e));
        assert_eq!(e.to_string(), code);
    }
    assert_eq!(CoreError::from_code("E_NOT_A_CODE"), None);
    assert_eq!(CoreError::from_code(""), None);
}

/// Codes are API: this list is the stability contract for the ones the contracts and room already
/// depend on. Removing or renaming any of them must fail the build.
#[test]
fn stable_codes_do_not_change() {
    for (e, code) in [
        (CoreError::Schema, "E_SCHEMA"),
        (CoreError::SchemaInvalid, "E_SCHEMA_INVALID"),
        (CoreError::BudgetExhausted, "E_BUDGET_EXHAUSTED"),
        (CoreError::ProofInvalid, "E_PROOF_INVALID"),
        (CoreError::Arithmetic, "E_ARITHMETIC"),
        (CoreError::FormulaDisabled, "E_FORMULA_DISABLED"),
        (CoreError::RuleDisabled, "E_RULE_DISABLED"),
        (CoreError::Decode, "E_DECODE"),
        (CoreError::Version, "E_VERSION"),
    ] {
        assert_eq!(e.code(), code);
    }
}

/// Every code in SDD §4.1's table is a `CoreError`. Reads the SDD itself, so the two cannot drift.
#[test]
fn covers_every_code_in_sdd_section_4_1() {
    let sdd = include_str!("../../../SDD.md");
    let start = sdd
        .find("### 4.1 Events and error codes")
        .expect("SDD §4.1 heading");
    let end = start + sdd[start..].find("### 4.2 ").expect("SDD §4.2 heading");
    let section = &sdd[start..end];

    let mut documented = HashSet::new();
    for word in section.split(|c: char| !(c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_'))
    {
        if word.starts_with("E_") && word.len() > 2 {
            documented.insert(word.to_string());
        }
    }
    assert!(
        documented.len() >= 40,
        "found only {} codes: the SDD table moved?",
        documented.len()
    );
    for code in &documented {
        assert!(
            CoreError::from_code(code).is_some(),
            "SDD §4.1 documents {code}, which CoreError lacks"
        );
    }
}
