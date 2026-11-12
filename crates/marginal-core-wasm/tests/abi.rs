//! The pointer ABI the JavaScript wrapper uses, driven natively with real pointers, and the
//! `{"ok"} / {"err"}` envelope.

use marginal_core_wasm::{alloc, call, call_raw, dealloc};

/// What the JS wrapper does: copy the text in, call, read the length-prefixed reply, free everything.
fn raw(op: &[u8], input: &[u8]) -> String {
    unsafe {
        let (op_ptr, input_ptr) = (alloc(op.len()), alloc(input.len()));
        std::ptr::copy_nonoverlapping(op.as_ptr(), op_ptr, op.len());
        std::ptr::copy_nonoverlapping(input.as_ptr(), input_ptr, input.len());
        let reply = call_raw(op_ptr, op.len(), input_ptr, input.len());
        dealloc(op_ptr, op.len());
        dealloc(input_ptr, input.len());
        let len =
            u32::from_le_bytes(std::slice::from_raw_parts(reply, 4).try_into().unwrap()) as usize;
        let text =
            String::from_utf8(std::slice::from_raw_parts(reply.add(4), len).to_vec()).unwrap();
        dealloc(reply, 4 + len);
        text
    }
}

#[test]
fn the_reply_is_ok_or_err() {
    assert_eq!(call("mbits", r#"{"n":21}"#), r#"{"ok":4393}"#);
    assert_eq!(call("mbits", r#"{"n":0}"#), r#"{"err":"E_SCHEMA_INVALID"}"#);
}

#[test]
fn a_request_that_is_not_understood_is_e_decode_never_a_panic() {
    for (op, input) in [
        ("no_such_op", "{}"),
        ("", ""),
        ("mbits", "not json"),
        ("mbits", r#"{"n":"21"}"#),
        ("mbits", "{}"),
        ("valuation", r#"{"budget":5,"m":1}"#),
    ] {
        assert_eq!(call(op, input), r#"{"err":"E_DECODE"}"#, "{op} {input}");
    }
}

#[test]
fn the_pointer_abi_returns_the_same_reply() {
    assert_eq!(raw(b"mbits", br#"{"n":21}"#), call("mbits", r#"{"n":21}"#));
    assert_eq!(raw(b"mbits", br#"{"n":0}"#), call("mbits", r#"{"n":0}"#));
}

#[test]
fn text_that_is_not_utf8_is_an_unknown_operation() {
    assert_eq!(raw(&[0xff, 0xfe], b"{}"), r#"{"err":"E_DECODE"}"#);
    assert_eq!(raw(b"mbits", &[0xc3, 0x28]), r#"{"err":"E_DECODE"}"#);
}

#[test]
fn zero_length_buffers_are_fine() {
    assert_eq!(raw(b"", b""), r#"{"err":"E_DECODE"}"#);
    unsafe { dealloc(alloc(0), 0) };
}
