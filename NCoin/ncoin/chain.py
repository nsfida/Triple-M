"""Blockchain state, validation, persistence, and fork choice."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

from .block import Block, BlockHeader, ZERO_HASH, merkle_root
from .consensus import (
    POW_LIMIT,
    bits_to_target,
    block_subsidy,
    block_work,
    check_proof_of_work,
    target_to_bits,
)
from .constants import (
    DIFFICULTY_ADJUSTMENT_INTERVAL,
    GENESIS_MESSAGE,
    GENESIS_TIMESTAMP,
    INITIAL_BITS,
    MAX_FUTURE_BLOCK_TIME,
    MEDIAN_TIME_SPAN,
    TARGET_BLOCK_SPACING,
)
from .transaction import Transaction, coinbase_transaction
from .utxo import UTXOSet, ValidationError, connect_transaction, validate_output_values, validate_transaction


@dataclass(frozen=True)
class BlockIndex:
    block_hash: str
    prev_hash: str
    height: int
    bits: int
    timestamp: int
    chain_work: int

    def to_dict(self) -> dict:
        return {
            "block_hash": self.block_hash,
            "prev_hash": self.prev_hash,
            "height": self.height,
            "bits": self.bits,
            "timestamp": self.timestamp,
            "chain_work": str(self.chain_work),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "BlockIndex":
        return cls(
            block_hash=data["block_hash"],
            prev_hash=data["prev_hash"],
            height=int(data["height"]),
            bits=int(data["bits"]),
            timestamp=int(data["timestamp"]),
            chain_work=int(data["chain_work"]),
        )


_GENESIS_BLOCK: Block | None = None


def create_genesis_block() -> Block:
    global _GENESIS_BLOCK
    if _GENESIS_BLOCK is not None:
        return _GENESIS_BLOCK

    coinbase = coinbase_transaction(0, block_subsidy(0), b"\x00" * 20, GENESIS_MESSAGE)
    header = BlockHeader(
        version=1,
        prev_hash=ZERO_HASH,
        merkle_root=merkle_root([coinbase]),
        timestamp=GENESIS_TIMESTAMP,
        bits=INITIAL_BITS,
        nonce=0,
    )
    block = Block(header=header, transactions=[coinbase])
    while not check_proof_of_work(block.hash(), INITIAL_BITS):
        header.nonce += 1
        if header.nonce > 0xFFFFFFFF:
            raise RuntimeError("failed to mine deterministic genesis block")
    _GENESIS_BLOCK = block
    return block


class Chain:
    def __init__(self) -> None:
        genesis = create_genesis_block()
        genesis_hash = genesis.hash()
        self.blocks: dict[str, Block] = {genesis_hash: genesis}
        self.index: dict[str, BlockIndex] = {
            genesis_hash: BlockIndex(
                block_hash=genesis_hash,
                prev_hash=ZERO_HASH,
                height=0,
                bits=genesis.header.bits,
                timestamp=genesis.header.timestamp,
                chain_work=block_work(genesis.header.bits),
            )
        }
        self.best_hash = genesis_hash
        self.utxo = UTXOSet()
        connect_transaction(genesis.transactions[0], self.utxo, 0, coinbase=True)
        self.orphans: dict[str, list[Block]] = {}

    @property
    def height(self) -> int:
        return self.index[self.best_hash].height

    @property
    def best_block(self) -> Block:
        return self.blocks[self.best_hash]

    def has_block(self, block_hash: str) -> bool:
        return block_hash in self.blocks

    def ancestors(self, tip_hash: str) -> list[str]:
        if tip_hash not in self.index:
            raise ValidationError("unknown chain tip")
        hashes = []
        cursor = tip_hash
        while cursor != ZERO_HASH:
            hashes.append(cursor)
            cursor = self.index[cursor].prev_hash
        hashes.reverse()
        return hashes

    def median_time_past(self, parent_hash: str) -> int:
        samples = []
        cursor = parent_hash
        while cursor != ZERO_HASH and len(samples) < MEDIAN_TIME_SPAN:
            item = self.index[cursor]
            samples.append(item.timestamp)
            cursor = item.prev_hash
        samples.sort()
        return samples[len(samples) // 2] if samples else 0

    def expected_bits(self, parent_hash: str) -> int:
        parent = self.index[parent_hash]
        next_height = parent.height + 1
        if next_height < DIFFICULTY_ADJUSTMENT_INTERVAL:
            return parent.bits
        if next_height % DIFFICULTY_ADJUSTMENT_INTERVAL != 0:
            return parent.bits

        cursor = parent_hash
        deltas = []
        for _ in range(DIFFICULTY_ADJUSTMENT_INTERVAL):
            current = self.index[cursor]
            previous_hash = current.prev_hash
            if previous_hash == ZERO_HASH:
                break
            previous = self.index[previous_hash]
            deltas.append(max(1, current.timestamp - previous.timestamp))
            cursor = previous_hash
        if not deltas:
            return parent.bits

        average_spacing = sum(deltas) // len(deltas)
        average_spacing = max(TARGET_BLOCK_SPACING // 4, min(TARGET_BLOCK_SPACING * 4, average_spacing))
        new_target = bits_to_target(parent.bits) * average_spacing // TARGET_BLOCK_SPACING
        return target_to_bits(min(new_target, POW_LIMIT))

    def build_utxo_to(self, tip_hash: str) -> UTXOSet:
        utxo = UTXOSet()
        for block_hash in self.ancestors(tip_hash):
            block = self.blocks[block_hash]
            height = self.index[block_hash].height
            for position, tx in enumerate(block.transactions):
                connect_transaction(tx, utxo, height, coinbase=(position == 0))
        return utxo

    def validate_block(self, block: Block, parent_utxo: UTXOSet | None = None) -> UTXOSet:
        block_hash = block.hash()
        if block_hash in self.blocks:
            raise ValidationError("block already known")
        if block.header.prev_hash not in self.index:
            raise ValidationError("missing parent block")
        if block.header.merkle_root != block.compute_merkle_root():
            raise ValidationError("block Merkle root mismatch")
        if not check_proof_of_work(block_hash, block.header.bits):
            raise ValidationError("block hash does not satisfy target")
        if block.header.bits != self.expected_bits(block.header.prev_hash):
            raise ValidationError("block difficulty bits are not expected")
        if block.header.timestamp > int(time.time()) + MAX_FUTURE_BLOCK_TIME:
            raise ValidationError("block timestamp too far in the future")
        if block.header.timestamp <= self.median_time_past(block.header.prev_hash):
            raise ValidationError("block timestamp is not greater than median-time-past")
        if not block.transactions:
            raise ValidationError("block has no transactions")
        if not block.transactions[0].is_coinbase():
            raise ValidationError("first transaction must be coinbase")
        if any(tx.is_coinbase() for tx in block.transactions[1:]):
            raise ValidationError("only the first transaction may be coinbase")

        parent_index = self.index[block.header.prev_hash]
        height = parent_index.height + 1
        working_utxo = parent_utxo.clone() if parent_utxo is not None else self.build_utxo_to(block.header.prev_hash)
        fees = 0
        spent_in_block: set[str] = set()

        for tx in block.transactions[1:]:
            fee = validate_transaction(tx, working_utxo, spent_in_block, spend_height=height)
            fees += fee
            for txin in tx.inputs:
                spent_in_block.add(txin.outpoint.key())
            connect_transaction(tx, working_utxo, height, coinbase=False)

        coinbase_total = validate_output_values(block.transactions[0])
        allowed = block_subsidy(height) + fees
        if coinbase_total > allowed:
            raise ValidationError("coinbase pays more than subsidy plus fees")
        connect_transaction(block.transactions[0], working_utxo, height, coinbase=True)
        return working_utxo

    def add_block(self, block: Block) -> bool:
        if block.header.prev_hash not in self.index:
            self.orphans.setdefault(block.header.prev_hash, []).append(block)
            return False

        parent_utxo = self.utxo if block.header.prev_hash == self.best_hash else self.build_utxo_to(block.header.prev_hash)
        new_utxo = self.validate_block(block, parent_utxo)
        block_hash = block.hash()
        parent_index = self.index[block.header.prev_hash]
        self.blocks[block_hash] = block
        self.index[block_hash] = BlockIndex(
            block_hash=block_hash,
            prev_hash=block.header.prev_hash,
            height=parent_index.height + 1,
            bits=block.header.bits,
            timestamp=block.header.timestamp,
            chain_work=parent_index.chain_work + block_work(block.header.bits),
        )

        became_best = False
        if self.index[block_hash].chain_work > self.index[self.best_hash].chain_work:
            self.best_hash = block_hash
            self.utxo = new_utxo if block.header.prev_hash == parent_index.block_hash else self.build_utxo_to(block_hash)
            became_best = True

        for orphan in list(self.orphans.pop(block_hash, [])):
            try:
                self.add_block(orphan)
            except ValidationError:
                pass
        return became_best

    def get_locator(self) -> list[str]:
        chain_hashes = self.ancestors(self.best_hash)
        locator = []
        step = 1
        index = len(chain_hashes) - 1
        while index >= 0:
            locator.append(chain_hashes[index])
            if len(locator) > 10:
                step *= 2
            index -= step
        return locator

    def blocks_after_locator(self, locator: list[str], limit: int = 500) -> list[Block]:
        chain_hashes = self.ancestors(self.best_hash)
        known = next((item for item in locator if item in self.index), chain_hashes[0])
        try:
            start = chain_hashes.index(known) + 1
        except ValueError:
            start = 1
        return [self.blocks[item] for item in chain_hashes[start : start + limit]]

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "best_hash": self.best_hash,
            "blocks": [block.to_dict() for block in self.blocks.values()],
            "index": {key: value.to_dict() for key, value in self.index.items()},
        }
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "Chain":
        chain = cls()
        if not path.exists():
            return chain
        data = json.loads(path.read_text(encoding="utf-8"))
        indexed = data.get("index", {})
        blocks = [Block.from_dict(item) for item in data.get("blocks", [])]
        blocks.sort(key=lambda block: int(indexed.get(block.hash(), {}).get("height", 0)))
        for block in blocks:
            if block.hash() == chain.best_hash:
                continue
            try:
                chain.add_block(block)
            except ValidationError:
                continue
        if data.get("best_hash") in chain.index:
            chain.best_hash = data["best_hash"]
            chain.utxo = chain.build_utxo_to(chain.best_hash)
        return chain


def validate_standalone_transaction(tx: Transaction, chain: Chain) -> int:
    return validate_transaction(tx, chain.utxo.clone(), spend_height=chain.height + 1)
