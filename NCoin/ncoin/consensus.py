"""Consensus math: compact targets, PoW checks, rewards, and amounts."""

from __future__ import annotations

from .constants import COIN, HALVING_INTERVAL, INITIAL_BITS, INITIAL_SUBSIDY, MAX_MONEY


def bits_to_target(bits: int) -> int:
    exponent = bits >> 24
    mantissa = bits & 0x007FFFFF
    if bits & 0x00800000:
        raise ValueError("negative compact target")
    if exponent <= 3:
        target = mantissa >> (8 * (3 - exponent))
    else:
        target = mantissa << (8 * (exponent - 3))
    if target <= 0:
        raise ValueError("compact target decodes to zero")
    return target


def target_to_bits(target: int) -> int:
    if target <= 0:
        raise ValueError("target must be positive")
    raw = target.to_bytes((target.bit_length() + 7) // 8, "big")
    if raw[0] & 0x80:
        exponent = len(raw) + 1
        mantissa = int.from_bytes(b"\x00" + raw[:2], "big")
    else:
        exponent = len(raw)
        mantissa = int.from_bytes(raw[:3].ljust(3, b"\x00"), "big")
    return (exponent << 24) | mantissa


POW_LIMIT = bits_to_target(INITIAL_BITS)


def check_proof_of_work(block_hash_hex: str, bits: int) -> bool:
    target = bits_to_target(bits)
    if target > POW_LIMIT:
        return False
    return int.from_bytes(bytes.fromhex(block_hash_hex), "big") <= target


def block_work(bits: int) -> int:
    target = bits_to_target(bits)
    return (1 << 256) // (target + 1)


def block_subsidy(height: int) -> int:
    if height < 0:
        raise ValueError("negative height")
    halvings = height // HALVING_INTERVAL
    if halvings >= 64:
        return 0
    return INITIAL_SUBSIDY >> halvings


def parse_amount(value: str) -> int:
    text = value.strip()
    if not text:
        raise ValueError("empty amount")
    whole, dot, frac = text.partition(".")
    if not whole.isdigit() or (dot and (not frac.isdigit() or len(frac) > 8)):
        raise ValueError("amount must have at most 8 decimal places")
    sats = int(whole) * COIN + int(frac.ljust(8, "0") if dot else 0)
    if sats < 0 or sats > MAX_MONEY:
        raise ValueError("amount outside NCoin money range")
    return sats


def format_amount(amount: int) -> str:
    if amount < 0:
        raise ValueError("negative amount")
    whole, frac = divmod(amount, COIN)
    return f"{whole}.{frac:08d}".rstrip("0").rstrip(".")
