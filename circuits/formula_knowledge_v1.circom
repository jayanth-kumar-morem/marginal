pragma circom 2.1.9;

// The pricing step for `knowledge@1` under rule R1, as a Groth16 circuit (SDD §3.17; E10.1).
//
// It proves that a committed set of scores prices a job the way `marginal-core` would, without
// revealing the scores. The public inputs are the things a contract already knows or is told — the
// job, the budget, the ask, the floor, the outcome, the price and the commitment — and the private
// ones are the components, the judge factors and the salt.
//
// `formula_id` and `rule_kind` are **not** public inputs: each verifying key is specific to one
// (formula, rule) pair, so the key itself says which. That is why this file is named for both.
//
// Everything here is integer arithmetic in basis points, floored, exactly as `pricing.rs` does it:
// a proof that agreed with a real-number model but not with the contract would be worthless.

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

// Basis points in a whole.
function BPS() { return 10000; }

/// `floor(a / 10000)` with its remainder, both range-checked. `bits` bounds the quotient.
template DivBps(bits) {
    signal input a;
    signal output q;
    signal output r;

    q <-- a \ BPS();
    r <-- a % BPS();
    a === q * BPS() + r;

    // The remainder is a real remainder, and the quotient fits where the caller says it does.
    component rBits = Num2Bits(14);
    rBits.in <== r;
    component rOk = LessThan(14);
    rOk.in[0] <== r;
    rOk.in[1] <== BPS();
    rOk.out === 1;

    component qBits = Num2Bits(bits);
    qBits.in <== q;
}

/// A value that must be a basis-point fraction: `0 <= x <= 10000`.
template IsBps() {
    signal input x;
    component bits = Num2Bits(14);
    bits.in <== x;
    component ok = LessEqThan(14);
    ok.in[0] <== x;
    ok.in[1] <== BPS();
    ok.out === 1;
}

/// `min(a, b)` for two 14-bit values.
template Min14() {
    signal input a;
    signal input b;
    signal output out;
    component less = LessThan(14);
    less.in[0] <== a;
    less.in[1] <== b;
    // One multiplication, so the constraint stays quadratic: `b` unless `a` is smaller.
    out <== b + less.out * (a - b);
}

/// `max(a, b)` for two 14-bit values.
template Max14() {
    signal input a;
    signal input b;
    signal output out;
    component less = LessThan(14);
    less.in[0] <== a;
    less.in[1] <== b;
    // `a` unless `b` is larger.
    out <== a + less.out * (b - a);
}

template FormulaKnowledgeV1R1() {
    // Public: what the contract knows, or is being told.
    signal input jc_hi;          // the job commitment, high 128 bits
    signal input jc_lo;          // the job commitment, low 128 bits
    signal input budget;         // B, the buyer's budget
    signal input ask;            // R1's posted ask
    signal input l_floor;        // the listing's judgement floor
    signal input outcome;        // 1 for a deal, 0 for no deal
    signal input price;          // what the buyer pays
    signal input commitment;     // C

    // Private: the measurement itself.
    signal input c1;             // N_b
    signal input c2;             // N_pub
    signal input l1;             // judge 1's factor
    signal input l2;             // judge 2's factor
    signal input salt;

    // 1. Ranges. Every score is a basis-point fraction (§3.17's first constraint).
    component c1Ok = IsBps();
    c1Ok.x <== c1;
    component c2Ok = IsBps();
    c2Ok.x <== c2;
    component l1Ok = IsBps();
    l1Ok.x <== l1;
    component l2Ok = IsBps();
    l2Ok.x <== l2;
    component floorOk = IsBps();
    floorOk.x <== l_floor;

    // 2. L = max(l_floor, min(l1, l2)) — a judge can only take value off (AC-41).
    component lowest = Min14();
    lowest.a <== l1;
    lowest.b <== l2;
    component factor = Max14();
    factor.a <== l_floor;
    factor.b <== lowest.out;

    // 3. D = floor(c1 * c2 / 10^4): KnowledgeV1's ceiling. The product is at most 10^8, so the
    //    quotient is at most 10^4 and fits in 14 bits.
    component ceiling = DivBps(14);
    ceiling.a <== c1 * c2;

    // 4. m = floor(D * L / 10^4): the measured-value index, never above D.
    component measured = DivBps(14);
    measured.a <== ceiling.q * factor.out;

    // 5. V = floor(B * m / 10^4): the buyer's valuation. B is under 2^128, so V is too.
    component valuation = DivBps(128);
    valuation.a <== budget * measured.q;

    // 6. R1 (Posted): a deal when the valuation reaches the ask, and then the price is the ask.
    component reaches = LessThan(129);
    reaches.in[0] <== valuation.q;
    reaches.in[1] <== ask;
    outcome === 1 - reaches.out;
    price === outcome * ask;

    // 7. The commitment covers the job and every private value, so the opening cannot be swapped
    //    for another job's or another score's (§3.17).
    component poseidon = Poseidon(7);
    poseidon.inputs[0] <== jc_hi;
    poseidon.inputs[1] <== jc_lo;
    poseidon.inputs[2] <== c1;
    poseidon.inputs[3] <== c2;
    poseidon.inputs[4] <== l1;
    poseidon.inputs[5] <== l2;
    poseidon.inputs[6] <== salt;
    commitment === poseidon.out;
}

component main { public [jc_hi, jc_lo, budget, ask, l_floor, outcome, price, commitment] } =
    FormulaKnowledgeV1R1();
