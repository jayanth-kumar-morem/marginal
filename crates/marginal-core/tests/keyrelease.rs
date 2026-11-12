//! Key release (SDD §3.12): the room's signed request, canonical key paths and pin modes.

use marginal_core::codec::to_bytes;
use marginal_core::json::to_hex;
use marginal_core::keyrelease::*;
use marginal_core::*;
use sha2::{Digest, Sha256};

mod common;
use common::{assert_every_edit_changes_the_digest, h, key_request, seller, Edit};

#[test]
fn a_listing_path_is_the_hash_of_the_seller_and_the_listing() {
    let path = listing_path(&seller(), 3, 1);
    let mut hasher = Sha256::new();
    hasher.update(b"marginal/listing-key/v1");
    hasher.update(borsh::to_vec(&(seller(), 3u64)).unwrap());
    let id: [u8; 32] = hasher.finalize().into();
    assert_eq!(listing_key_id(&seller(), 3), id);
    assert_eq!(path, format!("listing/{}/v1", to_hex(&id)));
    assert_eq!(path.len(), 8 + 64 + 3);
    assert!(path.len() <= MAX_PATH_LEN);
    assert!(
        format!("listing/{}/v{}", to_hex(&id), u32::MAX).len() <= MAX_PATH_LEN,
        "the longest path still fits"
    );
}

#[test]
fn a_path_binds_the_seller_the_listing_and_the_version() {
    let base = listing_path(&seller(), 3, 1);
    assert_ne!(
        base,
        listing_path(&"other.testnet".into(), 3, 1),
        "another seller has another key"
    );
    assert_ne!(base, listing_path(&seller(), 4, 1));
    assert_ne!(base, listing_path(&seller(), 3, 2));
    // Another account whose id the seller's could be a prefix of, or shift into.
    assert_ne!(
        listing_key_id(&"a.testnet".into(), 12),
        listing_key_id(&"a.testnet1".into(), 2)
    );
}

#[test]
fn a_canonical_path_parses_back() {
    for (listing, version) in [(0u64, 0u32), (3, 1), (u64::MAX, u32::MAX)] {
        let path = listing_path(&seller(), listing, version);
        assert_eq!(
            parse_listing_path(&path),
            Ok((listing_key_id(&seller(), listing), version))
        );
    }
}

/// Two spellings of one path would be two different keys, and a path that is not ours must not be
/// parsed as if it were.
#[test]
fn any_other_spelling_of_a_path_is_refused() {
    let id = to_hex(&listing_key_id(&seller(), 3));
    let upper = id.to_uppercase();
    let bad = [
        String::new(),
        "listing".into(),
        "listing/".into(),
        format!("listing/{id}"),
        format!("listing/{id}/1"),
        format!("listing/{id}/v"),
        format!("listing/{id}/v01"),
        format!("listing/{id}/v+1"),
        format!("listing/{id}/v-1"),
        format!("listing/{id}/v1x"),
        format!("listing/{id}/v 1"),
        format!("listing/{id}/v4294967296"),
        format!("listing/{id}/v1/"),
        format!("listing/{id}/v1/extra"),
        format!("Listing/{id}/v1"),
        format!("listing/{upper}/v1"),
        format!("listing/{}/v1", &id[..62]),
        format!("listing/{id}00/v1"),
        format!("listing/{}zz/v1", &id[..62]),
        format!("context/{id}"),
        format!("/listing/{id}/v1"),
    ];
    for path in &bad {
        assert_eq!(parse_listing_path(path), Err(CoreError::Path), "{path:?}");
    }
}

#[test]
fn a_path_is_named_by_a_domain_separated_hash() {
    let path = listing_path(&seller(), 3, 1);
    let mut hasher = Sha256::new();
    hasher.update(b"marginal/path/v1");
    hasher.update(path.as_bytes());
    assert_eq!(path_hash(&path).to_vec(), hasher.finalize().to_vec());
    assert_ne!(path_hash(&path), path_hash(&listing_path(&seller(), 3, 2)));
}

#[test]
fn the_signed_request_is_the_domain_then_the_borsh_bytes() {
    let r = key_request();
    assert_eq!(
        [KEY_REQUEST_DOMAIN, &to_bytes(&r)].concat(),
        key_request_signing_bytes(&r)
    );
    assert_eq!(KEY_REQUEST_DOMAIN, b"marginal/keyreq/v1");
}

/// The room signs one request for one job on one chain and one KeyPolicy: nothing in it can change.
#[test]
fn every_field_of_the_request_is_signed() {
    let edits: Vec<Edit<KeyRequest>> = vec![
        ("chain_id", |r| r.chain_id = "mainnet".into()),
        ("keypolicy", |r| {
            r.keypolicy = "keypolicy2.marginal-demo.testnet".into()
        }),
        ("room_key", |r| r.room_key[0] ^= 1),
        ("job_id", |r| r.job_id += 1),
        ("path", |r| {
            r.path = listing_path(&"other.testnet".into(), 3, 1)
        }),
        ("app_key.pk1", |r| r.app_key.pk1[0] ^= 1),
        ("app_key.pk2", |r| r.app_key.pk2[95] ^= 1),
        ("job_commitment", |r| r.job_commitment[0] ^= 1),
        ("value_class", |r| r.value_class = ValueClass::H),
    ];
    assert_every_edit_changes_the_digest(&key_request(), &edits, key_request_signing_bytes);
}

#[test]
fn pin_sets_are_bounded_and_distinct() {
    assert_eq!(PinMode::FollowGovernance.validate(), Ok(()));
    assert_eq!(PinMode::Explicit(vec![h(1)]).validate(), Ok(()));
    let full: Vec<_> = (0..MAX_PINS as u8).map(h).collect();
    assert_eq!(PinMode::Explicit(full.clone()).validate(), Ok(()));
    let mut over = full;
    over.push(h(200));
    assert_eq!(
        PinMode::Explicit(over).validate(),
        Err(CoreError::NotPinned),
        "too many"
    );
    assert_eq!(
        PinMode::Explicit(vec![]).validate(),
        Err(CoreError::NotPinned),
        "an empty list pins nothing"
    );
    assert_eq!(
        PinMode::Explicit(vec![h(1), h(2), h(1)]).validate(),
        Err(CoreError::NotPinned),
        "a duplicate"
    );
    assert_eq!(MAX_PINS, 16);
}

#[test]
fn pins_allow_only_what_they_name() {
    let pinned = PinMode::Explicit(vec![h(1), h(2)]);
    assert!(pinned.allows(&h(1)) && pinned.allows(&h(2)));
    assert!(!pinned.allows(&h(3)));
    assert!(
        PinMode::FollowGovernance.allows(&h(3)),
        "governance decides, through the registry"
    );
}

#[test]
fn the_json_shapes() {
    let json = serde_json::to_value(key_request()).unwrap();
    assert_eq!(json["room_key"], "01".repeat(32));
    assert_eq!(json["app_key"]["pk1"], "05".repeat(48));
    assert_eq!(json["app_key"]["pk2"], "06".repeat(96));
    assert_eq!(json["value_class"], "M");
    assert_eq!(
        serde_json::from_value::<KeyRequest>(json).unwrap(),
        key_request()
    );
    let pins = serde_json::to_value(PinMode::Explicit(vec![h(1)])).unwrap();
    assert_eq!(pins, serde_json::json!({"Explicit": ["01".repeat(32)]}));
    assert_eq!(
        serde_json::from_value::<PinMode>(pins).unwrap(),
        PinMode::Explicit(vec![h(1)])
    );
    assert_eq!(
        serde_json::to_value(PinMode::FollowGovernance).unwrap(),
        "FollowGovernance"
    );
}
