"""Wallet keys, Base58Check addresses, and transaction construction."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .chain import Chain
from .constants import ADDRESS_VERSION, COINBASE_MATURITY
from .crypto import (
    KeyPair,
    base58check_decode,
    base58check_encode,
    random_private_key,
)
from .transaction import OutPoint, Transaction, TxInput, TxOutput


def address_from_pubkey_hash(pubkey_hash: bytes) -> str:
    if len(pubkey_hash) != 20:
        raise ValueError("public key hash must be 20 bytes")
    return base58check_encode(ADDRESS_VERSION, pubkey_hash)


def pubkey_hash_from_address(address: str) -> bytes:
    version, payload = base58check_decode(address)
    if version != ADDRESS_VERSION:
        raise ValueError("address is not an NCoin address")
    if len(payload) != 20:
        raise ValueError("address payload is not a public key hash")
    return payload


@dataclass
class Wallet:
    keypair: KeyPair

    @classmethod
    def create(cls) -> "Wallet":
        return cls(KeyPair(random_private_key()))

    @classmethod
    def from_private_hex(cls, private_hex: str) -> "Wallet":
        private_key = int(private_hex, 16)
        return cls(KeyPair(private_key))

    @property
    def private_hex(self) -> str:
        return f"{self.keypair.private_key:064x}"

    @property
    def public_key(self) -> bytes:
        return self.keypair.public_key

    @property
    def public_key_hash(self) -> bytes:
        return self.keypair.public_key_hash

    @property
    def address(self) -> str:
        return address_from_pubkey_hash(self.public_key_hash)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "coin": "NCoin",
            "private_key": self.private_hex,
            "public_key": self.public_key.hex(),
            "address": self.address,
        }
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "Wallet":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls.from_private_hex(data["private_key"])

    def balance(self, chain: Chain, include_immature: bool = False) -> int:
        total = 0
        for entry in chain.utxo.entries.values():
            if entry.output.pubkey_hash != self.public_key_hash:
                continue
            if entry.coinbase and not include_immature and chain.height - entry.height < COINBASE_MATURITY:
                continue
            total += entry.output.amount
        return total

    def create_transaction(self, chain: Chain, to_address: str, amount: int, fee: int) -> Transaction:
        if amount <= 0:
            raise ValueError("amount must be positive")
        if fee < 0:
            raise ValueError("fee cannot be negative")

        destination = pubkey_hash_from_address(to_address)
        target = amount + fee
        selected: list[tuple[OutPoint, TxOutput]] = []
        total = 0

        for key, entry in sorted(chain.utxo.entries.items()):
            if entry.output.pubkey_hash != self.public_key_hash:
                continue
            if entry.coinbase and chain.height - entry.height < COINBASE_MATURITY:
                continue
            outpoint = OutPoint.from_key(key)
            selected.append((outpoint, entry.output))
            total += entry.output.amount
            if total >= target:
                break

        if total < target:
            raise ValueError("insufficient mature funds")

        tx = Transaction(
            inputs=[TxInput(item.txid, item.index) for item, _ in selected],
            outputs=[TxOutput(amount, destination)],
        )
        change = total - target
        if change:
            tx.outputs.append(TxOutput(change, self.public_key_hash))

        for index, (_, spent_output) in enumerate(selected):
            tx.sign_input(index, self.keypair.private_key, spent_output)
        return tx
