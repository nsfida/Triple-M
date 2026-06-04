"""Bitcoin-style UTXO transactions for NCoin."""

from __future__ import annotations

from dataclasses import dataclass, field

from .constants import MAX_MONEY
from .crypto import double_sha256, hash160, public_key_from_private, encode_public_key, sign
from .serialization import BytesReader, ser_bytes, ser_u32, ser_u64, ser_varint

SIGHASH_ALL = 1


@dataclass(frozen=True)
class OutPoint:
    txid: str
    index: int

    def key(self) -> str:
        return f"{self.txid}:{self.index}"

    def serialize(self) -> bytes:
        return bytes.fromhex(self.txid) + ser_u32(self.index)

    @classmethod
    def from_key(cls, key: str) -> "OutPoint":
        txid, index = key.rsplit(":", 1)
        return cls(txid=txid, index=int(index))


@dataclass
class TxInput:
    prev_txid: str
    output_index: int
    signature: bytes = b""
    pubkey: bytes = b""

    @property
    def outpoint(self) -> OutPoint:
        return OutPoint(self.prev_txid, self.output_index)

    def serialize(self) -> bytes:
        return (
            bytes.fromhex(self.prev_txid)
            + ser_u32(self.output_index)
            + ser_bytes(self.signature)
            + ser_bytes(self.pubkey)
        )

    def to_dict(self) -> dict:
        return {
            "prev_txid": self.prev_txid,
            "output_index": self.output_index,
            "signature": self.signature.hex(),
            "pubkey": self.pubkey.hex(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TxInput":
        return cls(
            prev_txid=data["prev_txid"],
            output_index=int(data["output_index"]),
            signature=bytes.fromhex(data.get("signature", "")),
            pubkey=bytes.fromhex(data.get("pubkey", "")),
        )


@dataclass(frozen=True)
class TxOutput:
    amount: int
    pubkey_hash: bytes

    def serialize(self) -> bytes:
        return ser_u64(self.amount) + ser_bytes(self.pubkey_hash)

    def to_dict(self) -> dict:
        return {"amount": self.amount, "pubkey_hash": self.pubkey_hash.hex()}

    @classmethod
    def from_dict(cls, data: dict) -> "TxOutput":
        return cls(amount=int(data["amount"]), pubkey_hash=bytes.fromhex(data["pubkey_hash"]))


@dataclass
class Transaction:
    version: int = 1
    inputs: list[TxInput] = field(default_factory=list)
    outputs: list[TxOutput] = field(default_factory=list)
    lock_time: int = 0
    coinbase_data: bytes = b""

    def is_coinbase(self) -> bool:
        return len(self.inputs) == 0

    def serialize(self) -> bytes:
        raw = ser_u32(self.version) + ser_varint(len(self.inputs))
        if self.is_coinbase():
            raw += ser_bytes(self.coinbase_data)
        else:
            raw += b"".join(txin.serialize() for txin in self.inputs)
        raw += ser_varint(len(self.outputs))
        raw += b"".join(txout.serialize() for txout in self.outputs)
        return raw + ser_u32(self.lock_time)

    def txid(self) -> str:
        return double_sha256(self.serialize()).hex()

    def total_output(self) -> int:
        total = sum(output.amount for output in self.outputs)
        if total < 0 or total > MAX_MONEY:
            raise ValueError("transaction output total outside money range")
        return total

    def signature_preimage(self, input_index: int, spent_output: TxOutput) -> bytes:
        if not 0 <= input_index < len(self.inputs):
            raise IndexError("input index out of range")
        raw = ser_u32(self.version) + ser_varint(len(self.inputs))
        for index, txin in enumerate(self.inputs):
            script = spent_output.pubkey_hash if index == input_index else b""
            raw += bytes.fromhex(txin.prev_txid) + ser_u32(txin.output_index) + ser_bytes(script)
        raw += ser_varint(len(self.outputs))
        raw += b"".join(txout.serialize() for txout in self.outputs)
        return raw + ser_u32(self.lock_time) + ser_u32(SIGHASH_ALL)

    def signature_hash(self, input_index: int, spent_output: TxOutput) -> bytes:
        return double_sha256(self.signature_preimage(input_index, spent_output))

    def sign_input(self, input_index: int, private_key: int, spent_output: TxOutput) -> None:
        public_key = encode_public_key(public_key_from_private(private_key), compressed=True)
        self.inputs[input_index].pubkey = public_key
        self.inputs[input_index].signature = sign(private_key, self.signature_hash(input_index, spent_output))

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "inputs": [txin.to_dict() for txin in self.inputs],
            "outputs": [txout.to_dict() for txout in self.outputs],
            "lock_time": self.lock_time,
            "coinbase_data": self.coinbase_data.hex(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Transaction":
        return cls(
            version=int(data.get("version", 1)),
            inputs=[TxInput.from_dict(item) for item in data.get("inputs", [])],
            outputs=[TxOutput.from_dict(item) for item in data.get("outputs", [])],
            lock_time=int(data.get("lock_time", 0)),
            coinbase_data=bytes.fromhex(data.get("coinbase_data", "")),
        )

    @classmethod
    def deserialize(cls, data: bytes) -> "Transaction":
        reader = BytesReader(data)
        version = reader.read_u32()
        input_count = reader.read_varint()
        inputs: list[TxInput] = []
        coinbase_data = b""
        if input_count == 0:
            coinbase_data = reader.read_bytes()
        else:
            for _ in range(input_count):
                inputs.append(
                    TxInput(
                        prev_txid=reader.read(32).hex(),
                        output_index=reader.read_u32(),
                        signature=reader.read_bytes(),
                        pubkey=reader.read_bytes(),
                    )
                )
        outputs = [TxOutput(reader.read_u64(), reader.read_bytes()) for _ in range(reader.read_varint())]
        lock_time = reader.read_u32()
        reader.ensure_finished()
        return cls(version, inputs, outputs, lock_time, coinbase_data)


def coinbase_transaction(height: int, amount: int, miner_pubkey_hash: bytes, extra: bytes = b"") -> Transaction:
    if amount < 0 or amount > MAX_MONEY:
        raise ValueError("coinbase amount outside money range")
    payload = ser_u64(height) + extra
    return Transaction(inputs=[], outputs=[TxOutput(amount, miner_pubkey_hash)], coinbase_data=payload)


def tx_output_for_pubkey(amount: int, public_key: bytes) -> TxOutput:
    return TxOutput(amount=amount, pubkey_hash=hash160(public_key))
