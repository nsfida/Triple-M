"""Small binary serialization helpers."""

from __future__ import annotations

import struct


def ser_u8(value: int) -> bytes:
    return struct.pack("<B", value)


def ser_i32(value: int) -> bytes:
    return struct.pack("<i", value)


def ser_u32(value: int) -> bytes:
    return struct.pack("<I", value)


def ser_u64(value: int) -> bytes:
    return struct.pack("<Q", value)


def ser_varint(value: int) -> bytes:
    if value < 0:
        raise ValueError("varint cannot be negative")
    if value < 0xFD:
        return ser_u8(value)
    if value <= 0xFFFF:
        return b"\xfd" + struct.pack("<H", value)
    if value <= 0xFFFFFFFF:
        return b"\xfe" + ser_u32(value)
    if value <= 0xFFFFFFFFFFFFFFFF:
        return b"\xff" + ser_u64(value)
    raise ValueError("varint too large")


def ser_bytes(value: bytes) -> bytes:
    return ser_varint(len(value)) + value


class BytesReader:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.offset = 0

    def read(self, size: int) -> bytes:
        if size < 0:
            raise ValueError("negative read size")
        end = self.offset + size
        if end > len(self.data):
            raise ValueError("truncated byte stream")
        out = self.data[self.offset:end]
        self.offset = end
        return out

    def read_u8(self) -> int:
        return struct.unpack("<B", self.read(1))[0]

    def read_i32(self) -> int:
        return struct.unpack("<i", self.read(4))[0]

    def read_u32(self) -> int:
        return struct.unpack("<I", self.read(4))[0]

    def read_u64(self) -> int:
        return struct.unpack("<Q", self.read(8))[0]

    def read_varint(self) -> int:
        marker = self.read_u8()
        if marker < 0xFD:
            return marker
        if marker == 0xFD:
            return struct.unpack("<H", self.read(2))[0]
        if marker == 0xFE:
            return self.read_u32()
        return self.read_u64()

    def read_bytes(self) -> bytes:
        return self.read(self.read_varint())

    def ensure_finished(self) -> None:
        if self.offset != len(self.data):
            raise ValueError("trailing bytes in stream")
