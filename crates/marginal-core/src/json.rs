//! The JSON model for consumers that are not Rust (the wasm package, and through it the room and
//! `replay-ts`). Rust names are used as they are; enums are strings (`"Open"`) or one-key objects
//! (`{"Posted": {"ask": "400000000"}}`). Two rules make it lossless in JavaScript:
//!
//! - **Amounts are decimal strings** (`u128`, [`dec`]): they exceed 2^53.
//! - **Bytes are lowercase hex** ([`hex`] and friends): keys, hashes, signatures, ciphertexts.
//!
//! Everything else is a JSON number. `u64` values (ids, block heights) must stay below 2^53, which
//! they do.
//!
//! These modules are for `#[serde(with = "...")]`. They work for any array or `Vec` of bytes (the
//! length of an array is checked) and for any integer type.

use alloc::string::{String, ToString};
use alloc::vec::Vec;
use core::fmt::Display;
use core::str::FromStr;
use serde::de::Error;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Lowercase hex.
pub fn to_hex(bytes: &[u8]) -> String {
    ::hex::encode(bytes)
}

/// Parses hex into a byte array or `Vec<u8>`; `None` if it is not hex or the length is wrong.
pub fn parse_hex<T: TryFrom<Vec<u8>>>(text: &str) -> Option<T> {
    T::try_from(::hex::decode(text).ok()?).ok()
}

fn from_hex<T: TryFrom<Vec<u8>>, E: Error>(text: &str) -> Result<T, E> {
    let bytes = ::hex::decode(text).map_err(E::custom)?;
    T::try_from(bytes).map_err(|_| E::custom("wrong number of bytes"))
}

/// A byte array or `Vec<u8>` as a hex string.
pub mod hex {
    use super::*;

    pub fn serialize<S: Serializer, T: AsRef<[u8]>>(value: &T, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&to_hex(value.as_ref()))
    }

    pub fn deserialize<'de, D: Deserializer<'de>, T: TryFrom<Vec<u8>>>(
        d: D,
    ) -> Result<T, D::Error> {
        from_hex(&String::deserialize(d)?)
    }
}

/// An `Option` of a byte array: hex string or `null`.
pub mod hex_opt {
    use super::*;

    pub fn serialize<S: Serializer, T: AsRef<[u8]>>(
        value: &Option<T>,
        s: S,
    ) -> Result<S::Ok, S::Error> {
        value.as_ref().map(|v| to_hex(v.as_ref())).serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>, T: TryFrom<Vec<u8>>>(
        d: D,
    ) -> Result<Option<T>, D::Error> {
        Option::<String>::deserialize(d)?
            .map(|text| from_hex(&text))
            .transpose()
    }
}

/// A `Vec` of byte arrays: a list of hex strings.
pub mod hex_vec {
    use super::*;

    pub fn serialize<S: Serializer, T: AsRef<[u8]>>(value: &[T], s: S) -> Result<S::Ok, S::Error> {
        value
            .iter()
            .map(|v| to_hex(v.as_ref()))
            .collect::<Vec<_>>()
            .serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>, T: TryFrom<Vec<u8>>>(
        d: D,
    ) -> Result<Vec<T>, D::Error> {
        Vec::<String>::deserialize(d)?
            .iter()
            .map(|text| from_hex(text))
            .collect()
    }
}

/// An integer as a decimal string.
pub mod dec {
    use super::*;

    pub fn serialize<S: Serializer, T: Display>(value: &T, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&value.to_string())
    }

    pub fn deserialize<'de, D: Deserializer<'de>, T: FromStr>(d: D) -> Result<T, D::Error>
    where
        T::Err: Display,
    {
        String::deserialize(d)?.parse().map_err(D::Error::custom)
    }
}
