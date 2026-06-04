"""Mempool admission and block selection."""

from __future__ import annotations

from .chain import Chain
from .transaction import Transaction
from .utxo import ValidationError, connect_transaction, validate_transaction


class Mempool:
    def __init__(self) -> None:
        self.transactions: dict[str, Transaction] = {}

    def __len__(self) -> int:
        return len(self.transactions)

    def get(self, txid: str) -> Transaction | None:
        return self.transactions.get(txid)

    def effective_utxo(self, chain: Chain):
        utxo = chain.utxo.clone()
        height = chain.height + 1
        for tx in self.transactions.values():
            validate_transaction(tx, utxo, spend_height=height)
            connect_transaction(tx, utxo, height, coinbase=False)
        return utxo

    def add(self, tx: Transaction, chain: Chain) -> str:
        txid = tx.txid()
        if txid in self.transactions:
            return txid
        if tx.is_coinbase():
            raise ValidationError("coinbase transactions are not accepted into the mempool")
        utxo = self.effective_utxo(chain)
        validate_transaction(tx, utxo, spend_height=chain.height + 1)
        self.transactions[txid] = tx
        return txid

    def remove(self, txid: str) -> None:
        self.transactions.pop(txid, None)

    def remove_confirmed(self, block_txids: set[str]) -> None:
        for txid in block_txids:
            self.remove(txid)

    def select_for_block(self, chain: Chain, max_transactions: int = 2_000) -> tuple[list[Transaction], int]:
        selected: list[Transaction] = []
        total_fees = 0
        utxo = chain.utxo.clone()
        spent_in_block: set[str] = set()
        height = chain.height + 1

        for tx in list(self.transactions.values()):
            if len(selected) >= max_transactions:
                break
            try:
                fee = validate_transaction(tx, utxo, spent_in_block, spend_height=height)
            except ValidationError:
                continue
            selected.append(tx)
            total_fees += fee
            for txin in tx.inputs:
                spent_in_block.add(txin.outpoint.key())
            connect_transaction(tx, utxo, height, coinbase=False)
        return selected, total_fees
