"""Command-line interface for NCoin."""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import sys
import threading
from pathlib import Path

from .chain import Chain
from .consensus import format_amount, parse_amount
from .constants import DEFAULT_PORT
from .mempool import Mempool
from .miner import mine_block
from .p2p import P2PServer
from .transaction import Transaction
from .utxo import ValidationError
from .wallet import Wallet


def chain_path(data_dir: Path) -> Path:
    return data_dir / "chain.json"


def default_wallet_path(data_dir: Path) -> Path:
    return data_dir / "wallet.json"


def load_or_create_wallet(path: Path) -> Wallet:
    if path.exists():
        return Wallet.load(path)
    wallet = Wallet.create()
    wallet.save(path)
    return wallet


def parse_peer(value: str) -> tuple[str, int]:
    host, sep, port = value.rpartition(":")
    if not sep or not host or not port.isdigit():
        raise argparse.ArgumentTypeError("peer must be host:port")
    return host, int(port)


def cmd_wallet(args: argparse.Namespace) -> None:
    wallet_path = Path(args.wallet)
    wallet = Wallet.create()
    wallet.save(wallet_path)
    print(f"Created NCoin wallet: {wallet_path}")
    print(f"Address: {wallet.address}")


def cmd_address(args: argparse.Namespace) -> None:
    wallet = Wallet.load(Path(args.wallet))
    print(wallet.address)


def cmd_balance(args: argparse.Namespace) -> None:
    chain = Chain.load(chain_path(Path(args.data_dir)))
    wallet = Wallet.load(Path(args.wallet))
    mature = wallet.balance(chain)
    total = wallet.balance(chain, include_immature=True)
    print(f"Mature balance: {format_amount(mature)} NCoin")
    print(f"Total balance:  {format_amount(total)} NCoin")


def cmd_mine_once(args: argparse.Namespace) -> None:
    data_dir = Path(args.data_dir)
    wallet = load_or_create_wallet(Path(args.wallet))
    chain = Chain.load(chain_path(data_dir))
    mempool = Mempool()
    block = mine_block(chain, mempool, wallet.public_key_hash)
    if block is None:
        raise SystemExit("Mining stopped before a block was found")
    became_best = chain.add_block(block)
    chain.save(chain_path(data_dir))
    print(f"Mined block {block.hash()} at height {chain.index[block.hash()].height}")
    print(f"Best chain updated: {became_best}")


async def broadcast_tx(host: str, port: int, tx: Transaction) -> None:
    reader, writer = await asyncio.open_connection(host, port)
    try:
        for _ in range(2):
            try:
                await asyncio.wait_for(reader.readline(), timeout=0.25)
            except asyncio.TimeoutError:
                break
        writer.write((json.dumps({"type": "tx", "tx": tx.to_dict()}) + "\n").encode("utf-8"))
        await writer.drain()
        await asyncio.sleep(0.1)
    finally:
        with contextlib.suppress(ConnectionError, OSError):
            writer.close()
        with contextlib.suppress(ConnectionError, OSError):
            await writer.wait_closed()


def write_transaction(path: Path, tx: Transaction) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(tx.to_dict(), indent=2), encoding="utf-8")


def explain_broadcast_failure(host: str, port: int, txid: str, exc: OSError, saved_path: Path | None = None) -> None:
    print(f"Could not broadcast transaction {txid}.")
    print(f"No NCoin node accepted the connection at {host}:{port}: {exc}")
    if saved_path is not None:
        print(f"Saved signed transaction to {saved_path}")
        print("Start your node, then submit it with:")
        print(f"python ncoin_core.py submit-tx --file {saved_path} --peer {host}:{port}")
    else:
        print("Start your node first, then run the send command again.")


def cmd_send(args: argparse.Namespace) -> None:
    data_dir = Path(args.data_dir)
    chain = Chain.load(chain_path(data_dir))
    wallet = Wallet.load(Path(args.wallet))
    tx = wallet.create_transaction(chain, args.to, parse_amount(args.amount), parse_amount(args.fee))
    txid = tx.txid()
    saved_path = None
    if args.out:
        saved_path = Path(args.out)
        write_transaction(saved_path, tx)
        print(f"Wrote transaction {txid} to {saved_path}")
    elif not args.broadcast:
        print(json.dumps(tx.to_dict(), indent=2))
    if args.broadcast:
        host, port = parse_peer(args.broadcast)
        try:
            asyncio.run(broadcast_tx(host, port, tx))
        except OSError as exc:
            if saved_path is None:
                saved_path = data_dir / "pending" / f"{txid}.json"
                write_transaction(saved_path, tx)
            explain_broadcast_failure(host, port, txid, exc, saved_path)
            raise SystemExit(1)
        print(f"Broadcast transaction {txid} to {host}:{port}")


def cmd_submit_tx(args: argparse.Namespace) -> None:
    tx_path = Path(args.file)
    tx = Transaction.from_dict(json.loads(tx_path.read_text(encoding="utf-8")))
    txid = tx.txid()
    host, port = parse_peer(args.peer)
    try:
        asyncio.run(broadcast_tx(host, port, tx))
    except OSError as exc:
        explain_broadcast_failure(host, port, txid, exc)
        raise SystemExit(1)
    print(f"Broadcast transaction {txid} to {host}:{port}")


async def run_node(args: argparse.Namespace) -> None:
    data_dir = Path(args.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    chain = Chain.load(chain_path(data_dir))
    mempool = Mempool()
    server = P2PServer(chain, mempool)
    mine_stop: threading.Event | None = None

    def on_new_best_block(_block) -> None:
        chain.save(chain_path(data_dir))
        if mine_stop is not None:
            mine_stop.set()

    server.on_new_best_block = on_new_best_block
    await server.start(args.host, args.port)

    for host, port in args.peer:
        try:
            await server.connect(host, port)
        except OSError as exc:
            print(f"Could not connect to peer {host}:{port}: {exc}")

    print(f"NCoin node listening on {args.host}:{args.port}")
    print(f"Best height {chain.height}, hash {chain.best_hash}")

    async def mining_loop() -> None:
        nonlocal mine_stop
        wallet = load_or_create_wallet(Path(args.wallet))
        print(f"Mining to {wallet.address}")
        while True:
            mine_stop = threading.Event()
            block = await run_blocking(mine_block, chain, mempool, wallet.public_key_hash, mine_stop)
            if block is None:
                continue
            try:
                chain.add_block(block)
            except ValidationError as exc:
                print(f"Mined stale/invalid block discarded: {exc}")
                continue
            mempool.remove_confirmed({tx.txid() for tx in block.transactions})
            chain.save(chain_path(data_dir))
            print(f"Mined block {block.hash()} at height {chain.height}")
            await server.broadcast_block(block)

    if args.mine:
        asyncio.create_task(mining_loop())

    try:
        await server.wait_closed()
    finally:
        chain.save(chain_path(data_dir))


def cmd_run(args: argparse.Namespace) -> None:
    try:
        asyncio.run(run_node(args))
    except KeyboardInterrupt:
        print("NCoin node stopped")


async def run_blocking(func, *args):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: func(*args))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ncoin", description="NCoin full node and miner")
    sub = parser.add_subparsers(dest="command", required=True)

    wallet = sub.add_parser("wallet", help="create a new wallet")
    wallet.add_argument("--wallet", default="wallet.json")
    wallet.set_defaults(func=cmd_wallet)

    address = sub.add_parser("address", help="print a wallet address")
    address.add_argument("--wallet", default="wallet.json")
    address.set_defaults(func=cmd_address)

    balance = sub.add_parser("balance", help="show wallet balance from local chain data")
    balance.add_argument("--data-dir", default="data")
    balance.add_argument("--wallet", default="wallet.json")
    balance.set_defaults(func=cmd_balance)

    mine_once = sub.add_parser("mine-once", help="mine one block locally")
    mine_once.add_argument("--data-dir", default="data")
    mine_once.add_argument("--wallet", default="wallet.json")
    mine_once.set_defaults(func=cmd_mine_once)

    send = sub.add_parser("send", help="create and optionally broadcast a signed transaction")
    send.add_argument("--data-dir", default="data")
    send.add_argument("--wallet", default="wallet.json")
    send.add_argument("--to", required=True)
    send.add_argument("--amount", required=True)
    send.add_argument("--fee", default="0.001")
    send.add_argument("--out")
    send.add_argument("--broadcast", help="host:port of an NCoin peer")
    send.set_defaults(func=cmd_send)

    submit_tx = sub.add_parser("submit-tx", help="broadcast a signed transaction JSON file")
    submit_tx.add_argument("--file", required=True)
    submit_tx.add_argument("--peer", required=True, help="host:port of an NCoin peer")
    submit_tx.set_defaults(func=cmd_submit_tx)

    run = sub.add_parser("run", help="run a full node or miner")
    run.add_argument("--data-dir", default="data")
    run.add_argument("--wallet", default="wallet.json")
    run.add_argument("--host", default="127.0.0.1")
    run.add_argument("--port", type=int, default=DEFAULT_PORT)
    run.add_argument("--peer", type=parse_peer, action="append", default=[])
    run.add_argument("--mine", action="store_true")
    run.set_defaults(func=cmd_run)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    if argv is None and len(sys.argv) == 1:
        parser.print_help()
        return
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
