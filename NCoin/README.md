# NCoin

NCoin is a from-scratch decentralized cryptocurrency implementation inspired by Bitcoin's architecture. It includes explicit implementations of block headers, double-SHA-256 proof of work, Merkle trees, deterministic secp256k1 ECDSA signatures, a strict UTXO ledger, coinbase rewards and fees, difficulty retargeting, TCP peer sync, mempool relay, mining, fork resolution by highest cumulative work, and a CLI.

This code is production-minded infrastructure, but a real-money public deployment still needs independent cryptographic review, long-running adversarial testing, DoS hardening, deterministic release builds, seed infrastructure, monitoring, and operational procedures.

## Consensus Parameters

| Parameter | Value |
| --- | --- |
| Coin name | NCoin |
| Maximum supply | 15,000,000 NCoin |
| Smallest unit | 1 NCoin = 100,000,000 units |
| Initial reward | 50 NCoin |
| Halving interval | 150,000 blocks |
| Block target time | 10 minutes |
| Difficulty window | 2,016 blocks |
| Difficulty algorithm | Moving average of recent block timestamp deltas, clamped to 4x per window |
| Fork choice | Highest cumulative proof-of-work |
| Coinbase maturity | 100 blocks |

## Project Layout

- `ncoin/crypto.py`: SHA-256, double SHA-256, HASH160, Base58Check, secp256k1 ECDSA.
- `ncoin/transaction.py`: transaction inputs, outputs, coinbase, signing preimage, transaction IDs.
- `ncoin/block.py`: block headers, block serialization, Merkle root calculation.
- `ncoin/utxo.py`: UTXO set, transaction validation, input spending.
- `ncoin/chain.py`: block validation, difficulty, timestamp checks, reorgs, persistence.
- `ncoin/mempool.py`: unconfirmed transaction admission and block selection.
- `ncoin/miner.py`: block template creation and proof-of-work mining loop.
- `ncoin/p2p.py`: TCP networking and JSON-line wire protocol.
- `ncoin/cli.py`: wallet, balance, send, mine, and node commands.

## CLI Quick Start

Run commands from the `NCoin` folder. You can use either `python -m ncoin.cli ...` or the NCoin Core launcher, `python ncoin_core.py ...`.

```powershell
python ncoin_core.py wallet --wallet data\wallet.json
python ncoin_core.py run --data-dir data --wallet data\wallet.json --host 127.0.0.1 --port 8338
```

Mine with a local wallet:

```powershell
python ncoin_core.py run --data-dir data --wallet data\wallet.json --mine
```

Mine a single block for testing:

```powershell
python ncoin_core.py mine-once --data-dir data --wallet data\wallet.json
```

Connect a second node:

```powershell
python ncoin_core.py run --data-dir data2 --wallet data2\wallet.json --port 8339 --peer 127.0.0.1:8338
```

Check balance:

```powershell
python ncoin_core.py balance --data-dir data --wallet data\wallet.json
```

Create and broadcast a transaction:

```powershell
python ncoin_core.py send --data-dir data --wallet data\wallet.json --to <NCoinAddress> --amount 1.25 --fee 0.001 --broadcast 127.0.0.1:8338
```

Keep an NCoin Core node running before broadcasting. If no node is listening on the peer address, the transaction is saved under `data\pending\` and can be submitted later:

```powershell
python ncoin_core.py submit-tx --file data\pending\<txid>.json --peer 127.0.0.1:8338
```

## Wire Protocol

Peers exchange newline-delimited JSON objects over TCP.

- `version`: announces protocol version, height, and best block hash.
- `inv`: announces block or transaction hashes.
- `getdata`: requests advertised objects.
- `getblocks`: sends a block locator for initial block download or fork catch-up.
- `block`: carries a full serialized block object.
- `tx`: carries a full serialized transaction object.
- `ping` and `pong`: liveness messages.

## Notes

- Block headers contain version, previous block hash, Merkle root, timestamp, compact target bits, and nonce.
- Transaction IDs and block hashes use double SHA-256.
- Outputs lock to a recipient public key hash. Inputs reveal a public key and ECDSA signature.
- Coinbase transactions have no inputs and may claim at most the block subsidy plus validated transaction fees.
- Nodes accept side chains and reorganize when another branch has more cumulative proof-of-work.
