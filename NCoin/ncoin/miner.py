"""Proof-of-work block template creation and mining."""

from __future__ import annotations

import threading
import time

from .block import Block, BlockHeader, merkle_root
from .chain import Chain
from .consensus import block_subsidy, check_proof_of_work
from .mempool import Mempool
from .transaction import coinbase_transaction


def create_block_template(
    chain: Chain,
    mempool: Mempool,
    miner_pubkey_hash: bytes,
    extra_nonce: int = 0,
) -> Block:
    height = chain.height + 1
    selected, fees = mempool.select_for_block(chain)
    coinbase = coinbase_transaction(
        height,
        block_subsidy(height) + fees,
        miner_pubkey_hash,
        extra=extra_nonce.to_bytes(8, "little"),
    )
    txs = [coinbase] + selected
    timestamp = max(int(time.time()), chain.median_time_past(chain.best_hash) + 1)
    header = BlockHeader(
        version=1,
        prev_hash=chain.best_hash,
        merkle_root=merkle_root(txs),
        timestamp=timestamp,
        bits=chain.expected_bits(chain.best_hash),
        nonce=0,
    )
    return Block(header=header, transactions=txs)


def mine_block(
    chain: Chain,
    mempool: Mempool,
    miner_pubkey_hash: bytes,
    stop_event: threading.Event | None = None,
) -> Block | None:
    stop_event = stop_event or threading.Event()
    extra_nonce = 0
    while not stop_event.is_set():
        block = create_block_template(chain, mempool, miner_pubkey_hash, extra_nonce)
        for nonce in range(0x100000000):
            if stop_event.is_set():
                return None
            block.header.nonce = nonce
            if nonce % 100_000 == 0:
                block.header.timestamp = max(int(time.time()), chain.median_time_past(chain.best_hash) + 1)
            if check_proof_of_work(block.hash(), block.header.bits):
                return block
        extra_nonce += 1
    return None
