# The services host

Three services, one image, on the operator's machine (SDD §2.7; tasks.md E11.1).

| Service | Port | Holds | Trusted with |
| --- | --- | --- | --- |
| gateway | 8081 | Objects that are public or already sealed, and an HMAC key for upload grants | Nothing. Every object it serves is checked against a hash the chain committed to |
| operator-agent | 8082 | A funded **function-call** key, and the NEAR AI key | Nothing. Every message it relays is signed by the room and bound to a chain, a contract and a job |
| compliance | 8083 | The issuer key and the compliance key | Granting a nullifier credential and a payout approval — both of which clearing verifies itself |

## Running it

```sh
cd deploy/services
MARGINAL_RPC_URL=https://test.rpc.fastnear.com \
MARGINAL_AGENT_ACCOUNT=agent.marginal-demo.testnet \
MARGINAL_AGENT_KEY=ed25519:... \
MARGINAL_CLEARING=clearing.marginal-demo.testnet \
MARGINAL_KEYPOLICY=keypolicy.marginal-demo.testnet \
MARGINAL_CHAIN_ID=testnet \
MARGINAL_UPLOAD_SECRET=$(openssl rand -hex 32) \
MARGINAL_ISSUER_SEED=$(openssl rand -hex 32) \
MARGINAL_COMPLIANCE_SEED=$(openssl rand -hex 32) \
MARGINAL_ALLOWED_IDENTITIES=buyer.marginal-demo.testnet \
  docker compose up --build
```

The two seeds are the deployment's identity to clearing: `set_issuer_key` and `set_compliance_key`
take the public keys `GET /v1/health` reports, and changing a seed invalidates every credential
already issued under it. Keep them out of the shell history on anything but a demo.

## What is not here

- **No MinIO.** E11.1 named it; the gateway stores objects itself, content-addressed, with
  HMAC-signed upload grants. An S3 server would be a second thing to run and secure for no demo
  surface, and the one property that matters — that an object cannot be swapped for another — comes
  from the grant naming the content's SHA-256, not from S3.
- **No indexer and no Postgres.** The web app and the verifier read contract views (E18).
- **No CVM restart.** E11.3 lists one; it needs the Phala API and a running CVM ([P-1]). The agent
  has no credentials for Phala and does not pretend to.
