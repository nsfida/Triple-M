"""Hashing, Base58Check, and a compact secp256k1 ECDSA implementation."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from typing import Optional, Tuple

BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
A = 0
B = 7
GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
G = (GX, GY)
Point = Optional[Tuple[int, int]]


def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def double_sha256(data: bytes) -> bytes:
    return sha256(sha256(data))


def hash160(data: bytes) -> bytes:
    ripe = hashlib.new("ripemd160")
    ripe.update(sha256(data))
    return ripe.digest()


def random_private_key() -> int:
    while True:
        key = secrets.randbelow(N)
        if 1 <= key < N:
            return key


def inverse_mod(value: int, modulus: int) -> int:
    value %= modulus
    if value == 0:
        raise ZeroDivisionError("inverse of zero")
    low, high = value, modulus
    lm, hm = 1, 0
    while low > 1:
        ratio = high // low
        nm = hm - lm * ratio
        new = high - low * ratio
        high, low = low, new
        hm, lm = lm, nm
    return lm % modulus


def is_on_curve(point: Point) -> bool:
    if point is None:
        return True
    x, y = point
    return (y * y - (x * x * x + A * x + B)) % P == 0


def point_add(p1: Point, p2: Point) -> Point:
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2 and y1 != y2:
        return None
    if p1 == p2:
        slope = (3 * x1 * x1 + A) * inverse_mod(2 * y1, P)
    else:
        slope = (y2 - y1) * inverse_mod(x2 - x1, P)
    slope %= P
    x3 = (slope * slope - x1 - x2) % P
    y3 = (slope * (x1 - x3) - y1) % P
    return x3, y3


def scalar_mult(k: int, point: Point = G) -> Point:
    if k % N == 0 or point is None:
        return None
    if k < 0:
        x, y = point
        return scalar_mult(-k, (x, -y % P))
    result: Point = None
    addend = point
    while k:
        if k & 1:
            result = point_add(result, addend)
        addend = point_add(addend, addend)
        k >>= 1
    return result


def public_key_from_private(private_key: int) -> tuple[int, int]:
    if not 1 <= private_key < N:
        raise ValueError("private key outside secp256k1 order")
    point = scalar_mult(private_key, G)
    if point is None or not is_on_curve(point):
        raise ValueError("invalid derived public key")
    return point


def encode_public_key(point: tuple[int, int], compressed: bool = True) -> bytes:
    x, y = point
    if compressed:
        return (b"\x03" if y & 1 else b"\x02") + x.to_bytes(32, "big")
    return b"\x04" + x.to_bytes(32, "big") + y.to_bytes(32, "big")


def decode_public_key(data: bytes) -> tuple[int, int]:
    if len(data) == 33 and data[0] in (2, 3):
        x = int.from_bytes(data[1:], "big")
        alpha = (x * x * x + 7) % P
        beta = pow(alpha, (P + 1) // 4, P)
        y = beta if (beta & 1) == (data[0] & 1) else P - beta
        point = (x, y)
    elif len(data) == 65 and data[0] == 4:
        point = (int.from_bytes(data[1:33], "big"), int.from_bytes(data[33:], "big"))
    else:
        raise ValueError("unsupported public key encoding")
    if not is_on_curve(point):
        raise ValueError("public key is not on secp256k1")
    return point


def _rfc6979_k(private_key: int, msg_hash: bytes) -> int:
    x = private_key.to_bytes(32, "big")
    h1 = msg_hash
    v = b"\x01" * 32
    k = b"\x00" * 32
    k = hmac.new(k, v + b"\x00" + x + h1, hashlib.sha256).digest()
    v = hmac.new(k, v, hashlib.sha256).digest()
    k = hmac.new(k, v + b"\x01" + x + h1, hashlib.sha256).digest()
    v = hmac.new(k, v, hashlib.sha256).digest()
    while True:
        v = hmac.new(k, v, hashlib.sha256).digest()
        candidate = int.from_bytes(v, "big")
        if 1 <= candidate < N:
            return candidate
        k = hmac.new(k, v + b"\x00", hashlib.sha256).digest()
        v = hmac.new(k, v, hashlib.sha256).digest()


def der_encode_signature(r: int, s: int) -> bytes:
    def encode_int(value: int) -> bytes:
        raw = value.to_bytes((value.bit_length() + 7) // 8 or 1, "big")
        raw = raw.lstrip(b"\x00") or b"\x00"
        if raw[0] & 0x80:
            raw = b"\x00" + raw
        return raw

    rb = encode_int(r)
    sb = encode_int(s)
    body = b"\x02" + bytes([len(rb)]) + rb + b"\x02" + bytes([len(sb)]) + sb
    if len(body) > 127:
        raise ValueError("signature too long")
    return b"\x30" + bytes([len(body)]) + body


def der_decode_signature(signature: bytes) -> tuple[int, int]:
    if len(signature) < 8 or signature[0] != 0x30:
        raise ValueError("invalid DER signature")
    total_len = signature[1]
    if total_len + 2 != len(signature):
        raise ValueError("invalid DER signature length")
    pos = 2
    if signature[pos] != 0x02:
        raise ValueError("invalid DER integer marker")
    pos += 1
    r_len = signature[pos]
    pos += 1
    r = int.from_bytes(signature[pos : pos + r_len], "big")
    pos += r_len
    if signature[pos] != 0x02:
        raise ValueError("invalid DER integer marker")
    pos += 1
    s_len = signature[pos]
    pos += 1
    s = int.from_bytes(signature[pos : pos + s_len], "big")
    if pos + s_len != len(signature):
        raise ValueError("trailing DER bytes")
    return r, s


def sign(private_key: int, msg_hash: bytes) -> bytes:
    if len(msg_hash) != 32:
        raise ValueError("ECDSA signs 32-byte hashes")
    z = int.from_bytes(msg_hash, "big")
    while True:
        k = _rfc6979_k(private_key, msg_hash)
        point = scalar_mult(k, G)
        if point is None:
            continue
        r = point[0] % N
        if r == 0:
            continue
        s = (inverse_mod(k, N) * (z + r * private_key)) % N
        if s == 0:
            continue
        if s > N // 2:
            s = N - s
        return der_encode_signature(r, s)


def verify(public_key: bytes, msg_hash: bytes, signature: bytes) -> bool:
    try:
        q = decode_public_key(public_key)
        r, s = der_decode_signature(signature)
    except ValueError:
        return False
    if not (1 <= r < N and 1 <= s < N) or len(msg_hash) != 32:
        return False
    z = int.from_bytes(msg_hash, "big")
    w = inverse_mod(s, N)
    u1 = (z * w) % N
    u2 = (r * w) % N
    point = point_add(scalar_mult(u1, G), scalar_mult(u2, q))
    return point is not None and point[0] % N == r


def base58_encode(data: bytes) -> str:
    number = int.from_bytes(data, "big")
    chars = []
    while number:
        number, rem = divmod(number, 58)
        chars.append(BASE58_ALPHABET[rem])
    prefix = "1" * (len(data) - len(data.lstrip(b"\x00")))
    return prefix + "".join(reversed(chars or ["1"]))


def base58_decode(value: str) -> bytes:
    number = 0
    for char in value:
        number *= 58
        try:
            number += BASE58_ALPHABET.index(char)
        except ValueError as exc:
            raise ValueError(f"invalid Base58 character {char!r}") from exc
    raw = number.to_bytes((number.bit_length() + 7) // 8, "big")
    prefix = b"\x00" * (len(value) - len(value.lstrip("1")))
    return prefix + raw


def base58check_encode(version: int, payload: bytes) -> str:
    body = bytes([version]) + payload
    checksum = double_sha256(body)[:4]
    return base58_encode(body + checksum)


def base58check_decode(value: str) -> tuple[int, bytes]:
    raw = base58_decode(value)
    if len(raw) < 5:
        raise ValueError("Base58Check payload too short")
    body, checksum = raw[:-4], raw[-4:]
    if double_sha256(body)[:4] != checksum:
        raise ValueError("invalid Base58Check checksum")
    return body[0], body[1:]


@dataclass(frozen=True)
class KeyPair:
    private_key: int

    @property
    def public_point(self) -> tuple[int, int]:
        return public_key_from_private(self.private_key)

    @property
    def public_key(self) -> bytes:
        return encode_public_key(self.public_point, compressed=True)

    @property
    def public_key_hash(self) -> bytes:
        return hash160(self.public_key)
