"""Async TCP peer-to-peer networking for NCoin nodes."""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from .block import Block
from .chain import Chain
from .constants import PROTOCOL_VERSION
from .mempool import Mempool
from .transaction import Transaction
from .utxo import ValidationError

MAX_MESSAGE_BYTES = 16 * 1024 * 1024


@dataclass(frozen=True)
class InventoryItem:
    kind: str
    hash: str

    def to_dict(self) -> dict:
        return {"kind": self.kind, "hash": self.hash}


class PeerConnection:
    def __init__(self, server: "P2PServer", reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        self.server = server
        self.reader = reader
        self.writer = writer
        self.address = writer.get_extra_info("peername")
        self.closed = False

    async def send(self, message: dict[str, Any]) -> None:
        if self.closed:
            return
        raw = (json.dumps(message, separators=(",", ":")) + "\n").encode("utf-8")
        if len(raw) > MAX_MESSAGE_BYTES:
            raise ValueError("message too large")
        try:
            self.writer.write(raw)
            await self.writer.drain()
        except (ConnectionError, OSError):
            self.closed = True
            raise

    async def run(self) -> None:
        self.server.peers.add(self)
        try:
            await self.send(self.server.version_message())
            await self.send({"type": "getblocks", "locator": self.server.chain.get_locator()})
            while not self.reader.at_eof():
                line = await self.reader.readline()
                if not line:
                    break
                if len(line) > MAX_MESSAGE_BYTES:
                    break
                try:
                    message = json.loads(line.decode("utf-8"))
                except json.JSONDecodeError:
                    continue
                await self.server.handle_message(self, message)
        except (ConnectionError, OSError, asyncio.IncompleteReadError):
            pass
        finally:
            self.closed = True
            self.server.peers.discard(self)
            with contextlib.suppress(ConnectionError, OSError):
                self.writer.close()
            with contextlib.suppress(ConnectionError, OSError):
                await self.writer.wait_closed()


class P2PServer:
    def __init__(self, chain: Chain, mempool: Mempool) -> None:
        self.chain = chain
        self.mempool = mempool
        self.peers: set[PeerConnection] = set()
        self._server: asyncio.AbstractServer | None = None
        self.on_new_best_block = None

    def version_message(self) -> dict[str, Any]:
        return {
            "type": "version",
            "version": PROTOCOL_VERSION,
            "height": self.chain.height,
            "best_hash": self.chain.best_hash,
        }

    async def start(self, host: str, port: int) -> None:
        self._server = await asyncio.start_server(self.accept_peer, host, port, limit=MAX_MESSAGE_BYTES)

    async def accept_peer(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = PeerConnection(self, reader, writer)
        try:
            await peer.run()
        except (ConnectionError, OSError, asyncio.IncompleteReadError):
            pass

    async def connect(self, host: str, port: int) -> None:
        reader, writer = await asyncio.open_connection(host, port, limit=MAX_MESSAGE_BYTES)
        peer = PeerConnection(self, reader, writer)
        task = asyncio.create_task(peer.run())
        task.add_done_callback(self._discard_peer_error)

    @staticmethod
    def _discard_peer_error(task: asyncio.Task) -> None:
        with contextlib.suppress(ConnectionError, OSError, asyncio.IncompleteReadError):
            task.result()

    async def wait_closed(self) -> None:
        if self._server is not None:
            async with self._server:
                await self._server.serve_forever()

    async def broadcast(self, message: dict[str, Any], exclude: PeerConnection | None = None) -> None:
        for peer in list(self.peers):
            if peer is exclude:
                continue
            try:
                await peer.send(message)
            except (ConnectionError, OSError, ValueError):
                peer.closed = True
                self.peers.discard(peer)

    async def broadcast_inventory(self, items: Iterable[InventoryItem], exclude: PeerConnection | None = None) -> None:
        await self.broadcast({"type": "inv", "items": [item.to_dict() for item in items]}, exclude)

    async def broadcast_transaction(self, tx: Transaction, exclude: PeerConnection | None = None) -> None:
        await self.broadcast({"type": "tx", "tx": tx.to_dict()}, exclude)

    async def broadcast_block(self, block: Block, exclude: PeerConnection | None = None) -> None:
        await self.broadcast({"type": "block", "block": block.to_dict()}, exclude)

    async def handle_message(self, peer: PeerConnection, message: dict[str, Any]) -> None:
        msg_type = message.get("type")
        if msg_type == "version":
            if int(message.get("height", 0)) > self.chain.height:
                await peer.send({"type": "getblocks", "locator": self.chain.get_locator()})
        elif msg_type == "ping":
            await peer.send({"type": "pong", "nonce": message.get("nonce")})
        elif msg_type == "inv":
            await self.handle_inventory(peer, message.get("items", []))
        elif msg_type == "getdata":
            await self.handle_getdata(peer, message.get("items", []))
        elif msg_type == "getblocks":
            await self.handle_getblocks(peer, message.get("locator", []))
        elif msg_type == "tx":
            await self.handle_transaction(peer, message.get("tx"))
        elif msg_type == "block":
            await self.handle_block(peer, message.get("block"))

    async def handle_inventory(self, peer: PeerConnection, items: list[dict[str, Any]]) -> None:
        needed = []
        for item in items:
            kind = item.get("kind")
            item_hash = item.get("hash")
            if kind == "block" and isinstance(item_hash, str) and not self.chain.has_block(item_hash):
                needed.append(item)
            if kind == "tx" and isinstance(item_hash, str) and self.mempool.get(item_hash) is None:
                needed.append(item)
        if needed:
            await peer.send({"type": "getdata", "items": needed})

    async def handle_getdata(self, peer: PeerConnection, items: list[dict[str, Any]]) -> None:
        for item in items:
            kind = item.get("kind")
            item_hash = item.get("hash")
            if kind == "block" and item_hash in self.chain.blocks:
                await peer.send({"type": "block", "block": self.chain.blocks[item_hash].to_dict()})
            elif kind == "tx" and isinstance(item_hash, str):
                tx = self.mempool.get(item_hash)
                if tx is not None:
                    await peer.send({"type": "tx", "tx": tx.to_dict()})

    async def handle_getblocks(self, peer: PeerConnection, locator: list[str]) -> None:
        for block in self.chain.blocks_after_locator(locator):
            await peer.send({"type": "block", "block": block.to_dict()})

    async def handle_transaction(self, peer: PeerConnection, payload: dict[str, Any] | None) -> None:
        if not payload:
            return
        tx = Transaction.from_dict(payload)
        txid = tx.txid()
        if self.mempool.get(txid) is not None:
            return
        try:
            self.mempool.add(tx, self.chain)
        except ValidationError:
            return
        await self.broadcast_inventory([InventoryItem("tx", txid)], exclude=peer)

    async def handle_block(self, peer: PeerConnection, payload: dict[str, Any] | None) -> None:
        if not payload:
            return
        block = Block.from_dict(payload)
        block_hash = block.hash()
        if self.chain.has_block(block_hash):
            return
        try:
            became_best = self.chain.add_block(block)
        except ValidationError:
            return
        self.mempool.remove_confirmed({tx.txid() for tx in block.transactions})
        if became_best and self.on_new_best_block is not None:
            self.on_new_best_block(block)
        await self.broadcast_inventory([InventoryItem("block", block_hash)], exclude=peer)
