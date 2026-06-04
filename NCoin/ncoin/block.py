"""Block headers, full blocks, and Merkle tree calculation."""

from __future__ import annotations

from dataclasses import dataclass, field

from .crypto import double_sha256
from .serialization import BytesReader, ser_i32, ser_u32, ser_u64, ser_varint
from .transaction import Transaction

ZERO_HASH = "00" * 32


def merkle_root(transactions: list[Transaction]) -> str:
    if not transactions:
        return ZERO_HASH
    layer = [bytes.fromhex(tx.txid()) for tx in transactions]
    while len(layer) > 1:
        if len(layer) & 1:
            layer.append(layer[-1])
        layer = [double_sha256(layer[i] + layer[i + 1]) for i in range(0, len(layer), 2)]
    return layer[0].hex()


@dataclass
class BlockHeader:
    version: int
    prev_hash: str
    merkle_root: str
    timestamp: int
    bits: int
    nonce: int

    def serialize(self) -> bytes:
        return (
            ser_i32(self.version)
            + bytes.fromhex(self.prev_hash)
            + bytes.fromhex(self.merkle_root)
            + ser_u64(self.timestamp)
            + ser_u32(self.bits)
            + ser_u32(self.nonce)
        )

    def hash(self) -> str:
        return double_sha256(self.serialize()).hex()

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "prev_hash": self.prev_hash,
            "merkle_root": self.merkle_root,
            "timestamp": self.timestamp,
            "bits": self.bits,
            "nonce": self.nonce,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "BlockHeader":
        return cls(
            version=int(data["version"]),
            prev_hash=data["prev_hash"],
            merkle_root=data["merkle_root"],
            timestamp=int(data["timestamp"]),
            bits=int(data["bits"]),
            nonce=int(data["nonce"]),
        )


@dataclass
class Block:
    header: BlockHeader
    transactions: list[Transaction] = field(default_factory=list)

    def hash(self) -> str:
        return self.header.hash()

    def compute_merkle_root(self) -> str:
        return merkle_root(self.transactions)

    def serialize(self) -> bytes:
        raw = self.header.serialize() + ser_varint(len(self.transactions))
        for tx in self.transactions:
            tx_raw = tx.serialize()
            raw += ser_varint(len(tx_raw)) + tx_raw
        return raw

    def to_dict(self) -> dict:
        return {
            "header": self.header.to_dict(),
            "transactions": [tx.to_dict() for tx in self.transactions],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Block":
        return cls(
            header=BlockHeader.from_dict(data["header"]),
            transactions=[Transaction.from_dict(item) for item in data.get("transactions", [])],
        )

    @classmethod
    def deserialize(cls, data: bytes) -> "Block":
        reader = BytesReader(data)
        header = BlockHeader(
            version=reader.read_i32(),
            prev_hash=reader.read(32).hex(),
            merkle_root=reader.read(32).hex(),
            timestamp=reader.read_u64(),
            bits=reader.read_u32(),
            nonce=reader.read_u32(),
        )
        txs = []
        for _ in range(reader.read_varint()):
            txs.append(Transaction.deserialize(reader.read(reader.read_varint())))
        reader.ensure_finished()
        return cls(header, txs)
