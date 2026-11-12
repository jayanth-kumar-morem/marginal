#![no_std]
//! `marginal-core`: one implementation of types, pricing, leakage arithmetic and
//! hashing, shared by the contracts, the room (as wasm) and `replay-ts`.
//! Contents arrive with epic E2.

/// Crate format version, bumped when any Borsh layout changes.
pub const CORE_VERSION: u8 = 1;

#[cfg(test)]
mod tests {
    #[test]
    fn version_is_one() {
        assert_eq!(super::CORE_VERSION, 1);
    }
}
