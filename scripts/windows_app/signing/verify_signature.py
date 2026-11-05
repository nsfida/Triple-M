#!/usr/bin/env python3
"""Verify that a Windows executable carries an Authenticode signature with an
RFC 3161 / Authenticode timestamp.

    verify_signature.py FILE            exit 1 unless FILE is signed + timestamped
    verify_signature.py --report FILE.. print the status of each file, never fail

This is a structural check (signature present, SHA-256 digest, timestamp
present). When `osslsigncode` is installed it is also asked to verify the
signature cryptographically. The authoritative trust check (certificate chain
to a Windows-trusted root, revocation) is `signtool verify /pa /all /v` on
Windows - run it as part of every release (docs/WINDOWS-APP-SIGNING.md).
No third-party Python packages are required.
"""
import shutil
import struct
import subprocess
import sys
from pathlib import Path

OID_SIGNED_DATA = bytes.fromhex("06092a864886f70d010702")          # 1.2.840.113549.1.7.2
OID_SHA256 = bytes.fromhex("0609608648016503040201")              # 2.16.840.1.101.3.4.2.1
OID_RFC3161_TOKEN = bytes.fromhex("060a2b0601040182370303 01".replace(" ", ""))  # 1.3.6.1.4.1.311.3.3.1
OID_COUNTERSIGNATURE = bytes.fromhex("06092a864886f70d010906")    # 1.2.840.113549.1.9.6
OID_TST_INFO = bytes.fromhex("060b2a864886f70d0109100104")        # 1.2.840.113549.1.9.16.1.4


def security_directory(data: bytes):
    if data[:2] != b"MZ":
        raise ValueError("not a PE file")
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe:pe + 4] != b"PE\0\0":
        raise ValueError("not a PE file")
    opt = pe + 24
    magic = struct.unpack_from("<H", data, opt)[0]
    dd = opt + (112 if magic == 0x20B else 96)
    off, size = struct.unpack_from("<II", data, dd + 4 * 8)  # IMAGE_DIRECTORY_ENTRY_SECURITY
    return off, size


def check(path: Path):
    data = path.read_bytes()
    off, size = security_directory(data)
    if not off or not size or off + size > len(data):
        return False, "NOT SIGNED (no Authenticode signature)"
    blob = data[off:off + size]
    if OID_SIGNED_DATA not in blob:
        return False, "INVALID (security directory without PKCS#7 signedData)"
    problems = []
    if OID_SHA256 not in blob:
        problems.append("no SHA-256 digest")
    if not (OID_RFC3161_TOKEN in blob or OID_COUNTERSIGNATURE in blob or OID_TST_INFO in blob):
        problems.append("no timestamp (signature would expire with the certificate)")
    tool = shutil.which("osslsigncode")
    if tool:
        r = subprocess.run([tool, "verify", "-in", str(path)], capture_output=True, text=True)
        out = (r.stdout + r.stderr)
        if "Signature verification: ok" not in out and "Succeeded" not in out:
            problems.append("osslsigncode could not verify the signature")
    if problems:
        return False, "SIGNED BUT " + "; ".join(problems)
    return True, "signed, SHA-256, timestamped" + (" (osslsigncode verified)" if tool else "")


def main(argv):
    report = False
    if argv and argv[0] == "--report":
        report, argv = True, argv[1:]
    if not argv:
        print(__doc__)
        return 2
    ok_all = True
    for name in argv:
        p = Path(name)
        try:
            ok, text = check(p)
        except Exception as exc:  # noqa: BLE001 - report any parse failure
            ok, text = False, f"ERROR: {exc}"
        ok_all &= ok
        print(f"[signature] {p.name}: {text}")
    return 0 if (ok_all or report) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
