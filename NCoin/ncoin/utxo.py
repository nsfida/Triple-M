"""UTXO set and transaction validation."""

from __future__ import annotations

from dataclasses import dataclass

from .constants import COINBASE_MATURITY, MAX_MONEY
from .crypto import hash160, verify
from .transaction import OutPoint, Transaction, TxOutput


class ValidationError(Exception):
    """Raised when a consensus object fails validation."""


@dataclass(frozen=True)
class UTXOEntry:
    output: TxOutput
    height: int
    coinbase: bool

    def to_dict(self) -> dict:
        return {
            "output": self.output.to_dict(),
            "height": self.height,
            "coinbase": self.coinbase,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "UTXOEntry":
        return cls(TxOutput.from_dict(data["output"]), int(data["height"]), bool(data["coinbase"]))


class UTXOSet:
    def __init__(self, entries: dict[str, UTXOEntry] | None = None) -> None:
        self.entries: dict[str, UTXOEntry] = dict(entries or {})

    def clone(self) -> "UTXOSet":
        return UTXOSet(self.entries.copy())

    def get(self, outpoint: OutPoint) -> UTXOEntry | None:
        return self.entries.get(outpoint.key())

    def add(self, txid: str, index: int, output: TxOutput, height: int, coinbase: bool) -> None:
        if not (0 <= output.amount <= MAX_MONEY):
            raise ValidationError("UTXO output amount outside money range")
        self.entries[f"{txid}:{index}"] = UTXOEntry(output, height, coinbase)

    def spend(self, outpoint: OutPoint) -> UTXOEntry:
        key = outpoint.key()
        entry = self.entries.get(key)
        if entry is None:
            raise ValidationError(f"missing UTXO {key}")
        del self.entries[key]
        return entry

    def add_transaction_outputs(self, tx: Transaction, height: int, coinbase: bool) -> None:
        txid = tx.txid()
        for index, output in enumerate(tx.outputs):
            self.add(txid, index, output, height, coinbase)

    def to_dict(self) -> dict:
        return {key: entry.to_dict() for key, entry in self.entries.items()}

    @classmethod
    def from_dict(cls, data: dict) -> "UTXOSet":
        return cls({key: UTXOEntry.from_dict(value) for key, value in data.items()})


def validate_output_values(tx: Transaction) -> int:
    if not tx.outputs:
        raise ValidationError("transaction has no outputs")
    total = 0
    for output in tx.outputs:
        if output.amount < 0:
            raise ValidationError("negative output amount")
        if output.amount > MAX_MONEY:
            raise ValidationError("output amount exceeds max money")
        total += output.amount
        if total > MAX_MONEY:
            raise ValidationError("transaction output total exceeds max money")
    return total


def validate_transaction(
    tx: Transaction,
    utxo: UTXOSet,
    spent_in_block: set[str] | None = None,
    spend_height: int | None = None,
) -> int:
    if tx.is_coinbase():
        raise ValidationError("coinbase must be validated by block rules")
    if not tx.inputs:
        raise ValidationError("transaction has no inputs")

    spent_in_block = spent_in_block if spent_in_block is not None else set()
    output_total = validate_output_values(tx)
    input_total = 0
    seen_inputs: set[str] = set()

    for index, txin in enumerate(tx.inputs):
        key = txin.outpoint.key()
        if key in seen_inputs or key in spent_in_block:
            raise ValidationError("duplicate or already spent input")
        seen_inputs.add(key)

        entry = utxo.get(txin.outpoint)
        if entry is None:
            raise ValidationError(f"referenced UTXO {key} is not available")
        if entry.coinbase and spend_height is not None and spend_height - entry.height < COINBASE_MATURITY:
            raise ValidationError("coinbase output is not mature")
        if not txin.signature or not txin.pubkey:
            raise ValidationError("input missing signature or public key")
        if hash160(txin.pubkey) != entry.output.pubkey_hash:
            raise ValidationError("public key does not match referenced output")
        if not verify(txin.pubkey, tx.signature_hash(index, entry.output), txin.signature):
            raise ValidationError("invalid transaction signature")

        input_total += entry.output.amount
        if input_total > MAX_MONEY:
            raise ValidationError("transaction input total exceeds max money")

    if input_total < output_total:
        raise ValidationError("transaction spends more than its inputs")
    return input_total - output_total


def connect_transaction(tx: Transaction, utxo: UTXOSet, height: int, coinbase: bool) -> None:
    if not coinbase:
        for txin in tx.inputs:
            utxo.spend(txin.outpoint)
    utxo.add_transaction_outputs(tx, height, coinbase)
