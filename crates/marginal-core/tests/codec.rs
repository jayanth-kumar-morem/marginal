//! Hashing and Borsh helpers every other module builds on.

use marginal_core::codec::{domain_bytes, from_bytes, hash_of, sha256, to_bytes};
use marginal_core::CoreError;

fn hex(bytes: [u8; 32]) -> String {
    marginal_core::json::to_hex(&bytes)
}

/// FIPS 180-2 test vectors.
#[test]
fn sha256_known_answers() {
    assert_eq!(
        hex(sha256(&[])),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    assert_eq!(
        hex(sha256(&[b"abc"])),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    let long = b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    assert_eq!(
        hex(sha256(&[long])),
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
    );
}

#[test]
fn hashing_parts_is_hashing_their_concatenation() {
    assert_eq!(sha256(&[b"a", b"bc"]), sha256(&[b"abc"]));
    assert_eq!(sha256(&[b"", b"abc", b""]), sha256(&[b"abc"]));
    assert_ne!(sha256(&[b"ab", b"c "]), sha256(&[b"abc"]));
}

#[test]
fn borsh_helpers_are_strict() {
    let bytes = to_bytes(&7u32);
    assert_eq!(bytes, [7, 0, 0, 0]);
    assert_eq!(from_bytes::<u32>(&bytes), Ok(7));
    assert_eq!(
        from_bytes::<u32>(&bytes[..3]),
        Err(CoreError::Decode),
        "truncated"
    );
    assert_eq!(
        from_bytes::<u32>(&[7, 0, 0, 0, 0]),
        Err(CoreError::Decode),
        "trailing byte"
    );
}

#[test]
fn domain_bytes_prefix_the_encoding_and_hash_of_hashes_the_encoding() {
    assert_eq!(
        domain_bytes(b"d/v1", &7u32),
        [b'd', b'/', b'v', b'1', 7, 0, 0, 0]
    );
    assert_eq!(hash_of(&7u32), sha256(&[&[7, 0, 0, 0]]));
}
