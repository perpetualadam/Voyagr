"""Synthetic Win32 ABI tests plus disposable Windows integration; no private data."""

import ctypes
from dataclasses import replace
import importlib.util
import json
import os
from pathlib import Path
import stat
import struct
import sys
from types import SimpleNamespace

import pytest

from voyagr.utils import review_package_io as io
from voyagr.utils import review_identity_diagnostic as diagnostic
from voyagr.utils.windows_evidence_metadata import (
    decode_metadata,
    WindowsMetadata,
    EPOCH_TICKS,
)
from voyagr.utils.review_package_diagnostics import (
    PolicyRefusal,
    CapabilityRefusal,
    refusal_details,
    operation,
)


def records(**kw):
    values = dict(
        creation=EPOCH_TICKS + 123456789,
        access=EPOCH_TICKS + 223456789,
        write=EPOCH_TICKS + 323456789,
        change=EPOCH_TICKS + 423456789,
        attributes=0x20,
        allocation=4096,
        size=3,
        links=1,
        pending=0,
        directory=0,
        volume=2**48 + 7,
        identity=(2**110 + 9).to_bytes(16, "little"),
        tag=0,
    )
    values.update(kw)
    v = values
    return {
        0: struct.pack(
            "<qqqqI4x",
            v["creation"],
            v["access"],
            v["write"],
            v["change"],
            v["attributes"],
        ),
        1: struct.pack(
            "<qqIBB2x",
            v["allocation"],
            v["size"],
            v["links"],
            v["pending"],
            v["directory"],
        ),
        18: struct.pack("<Q16s", v["volume"], v["identity"]),
        9: struct.pack("<II", v["attributes"], v["tag"]),
    }


def native(**kw):
    r = records(**kw)
    return decode_metadata(*(r[k] for k in (0, 1, 18, 9)))


class Kernel:
    def __init__(self, data=None, fail=None):
        self.data = data or records()
        self.fail = fail
        self.calls = []

    def CreateFileW(self, *args):
        self.calls.append(("open", args))
        return 2**40 + 7

    def SetFileTime(self, handle, creation, access, write):
        self.calls.append(("freeze", creation, ctypes.string_at(access, 8), write))
        return True

    def GetFileType(self, handle):
        self.calls.append(("type", handle))
        return 1

    def GetFileInformationByHandleEx(self, handle, kind, buffer, size):
        self.calls.append(("metadata", kind, size, handle))
        if kind == self.fail:
            return False
        ctypes.memmove(buffer, self.data[kind], size)
        return True

    def CloseHandle(self, handle):
        self.calls.append(("close", handle))
        return True


def win(kernel):
    w = io._Windows.__new__(io._Windows)
    w.k = kernel
    w.c = SimpleNamespace(
        c_void_p=ctypes.c_void_p,
        byref=ctypes.byref,
        create_string_buffer=ctypes.create_string_buffer,
        get_last_error=lambda: 50,
    )
    w.w = SimpleNamespace(DWORD=ctypes.c_uint32)
    return w


def test_exact_128bit_identity_64bit_volume_and_100ns_timestamps():
    info = native()
    assert info.st_ino == 2**110 + 9 and info.st_dev == 2**48 + 7
    assert info.st_birthtime_ns == 12345678900
    assert info.st_ctime_ns == 42345678900
    assert info.st_atime_ns == 22345678900
    assert info.st_mtime_ns == 32345678900
    assert len(info.fingerprint) == 13


def test_path_and_handle_use_identical_native_apis_without_python_conversion():
    k = Kernel()
    w = win(k)
    assert io.stamp(w.path_metadata("PRIVATE_FILENAME.exe")) == io.stamp(
        w.metadata(2**40 + 7)
    )
    assert [c[1] for c in k.calls if c[0] == "metadata"] == [0, 1, 18, 9] * 2
    assert k.calls[0][1][1:] == (
        0x80000000 | 0x100,
        1,
        None,
        3,
        0x00200000 | 0x02000000,
        None,
    )
    assert k.calls[1] == ("freeze", None, b"\xff" * 8, None)
    assert sum(c[0] == "close" for c in k.calls) == 1


@pytest.mark.parametrize(
    "field,value",
    [
        ("volume", 2**48 + 8),
        ("identity", (2**111 + 9).to_bytes(16, "little")),
        ("creation", EPOCH_TICKS + 123456790),
        ("access", EPOCH_TICKS + 223456790),
        ("write", EPOCH_TICKS + 323456790),
        ("change", EPOCH_TICKS + 423456790),
        ("size", 4),
        ("allocation", 8192),
        ("links", 2),
        ("attributes", 0x21),
    ],
)
def test_no_field_or_submicrosecond_change_is_discarded(field, value):
    assert io.stamp(native()) != io.stamp(native(**{field: value}))


@pytest.mark.parametrize("kind", [0, 1, 18, 9])
def test_missing_native_capability_is_refused_without_reduced_fallback(kind):
    k = Kernel(fail=kind)
    with pytest.raises(CapabilityRefusal) as caught:
        win(k).path_metadata("PRIVATE_SOURCE")
    details = refusal_details(caught.value)
    assert details["category"] == "WINDOWS_METADATA_CAPABILITY"
    assert details["operation"] == "WINDOWS_METADATA_QUERY"
    assert sum(c[0] == "close" for c in k.calls) == 1
    assert [c[1] for c in k.calls if c[0] == "metadata"] == [0, 1, 18, 9][
        : [0, 1, 18, 9].index(kind) + 1
    ]
    assert "PRIVATE_SOURCE" not in json.dumps(details)


@pytest.mark.parametrize(
    "kw",
    [
        {"attributes": 0x420},
        {"pending": 1},
        {"identity": bytes(16)},
        {"size": -1},
        {"directory": 1},
        {"links": 0},
        {"tag": 0xA000000C},
    ],
)
def test_reparse_deleted_or_inconsistent_metadata_still_refused(kw):
    with pytest.raises(PolicyRefusal):
        native(**kw)


def py_stat(n, path=True):
    return SimpleNamespace(
        st_dev=n.st_dev,
        st_ino=n.st_ino,
        st_mode=n.st_mode,
        st_size=n.st_size,
        st_mtime_ns=n.st_mtime_ns,
        st_atime_ns=n.st_atime_ns,
        st_ctime_ns=n.st_birthtime_ns if path else n.st_ctime_ns,
        st_birthtime_ns=n.st_birthtime_ns,
        st_nlink=n.st_nlink,
        st_uid=0,
        st_gid=0,
        st_file_attributes=n.attributes,
        st_reparse_tag=0,
    )


def test_cpython313_legacy_ctime_difference_is_not_mutation_proof():
    n = native()
    p, h = py_stat(n), py_stat(n, False)
    assert io.stamp(p) != io.stamp(h)  # Exact old failing comparison.
    result = diagnostic.classify_samples([n] * 4, [p] * 3, [h] * 2)
    assert result["classification"] == "STABLE_API_REPRESENTATION_DIFFERENCE_OBSERVED"
    assert result["different_fields"] == ["st_ctime_ns"]
    assert result["ctime_creation_vs_change_pattern"] is True
    assert io.stamp(n) == io.stamp(native())  # New equivalent representation.


def test_executable_mode_representation_and_native_change_are_distinguished():
    n = native()
    p, h = py_stat(n), py_stat(n, False)
    p.st_mode |= 0o111
    result = diagnostic.classify_samples([n] * 4, [p] * 3, [h] * 2)
    assert result["mode_execute_only_pattern"] is True
    result = diagnostic.classify_samples(
        [n, n, replace(n, change=n.change + 1), n], [p] * 3, [h] * 2
    )
    assert result["classification"] == "NATIVE_METADATA_OR_IDENTITY_CHANGE_OBSERVED"
    p2 = py_stat(n)
    p2.st_size += 1
    result = diagnostic.classify_samples([n] * 4, [p, p2, p], [h] * 2)
    assert result["classification"] == "INCONSISTENT_SAMPLING_UNRESOLVED"


def canonical_from_stat(s):
    return WindowsMetadata(
        s.st_dev,
        s.st_ino.to_bytes(16, "little"),
        EPOCH_TICKS + s.st_ctime_ns // 100,
        EPOCH_TICKS + s.st_atime_ns // 100,
        EPOCH_TICKS + s.st_mtime_ns // 100,
        EPOCH_TICKS + s.st_ctime_ns // 100 + 1,
        s.st_size,
        4096,
        s.st_nlink,
        0x10 if stat.S_ISDIR(s.st_mode) else 0x20,
        0,
        stat.S_ISDIR(s.st_mode),
        False,
    )


@pytest.mark.skipif(
    os.name == "nt", reason="POSIX-host simulation; real Win32 test below"
)
@pytest.mark.parametrize("changed", [False, True])
def test_inventory_uses_native_family_and_refuses_real_change_before_read(
    tmp_path, monkeypatch, changed
):
    path = tmp_path / "PRIVATE_EVIDENCE"
    path.mkdir()
    f = path / "file.exe"
    f.write_bytes(b"123")
    real_reader = io.Reader()

    class NativeReader:
        win = True
        directory = real_reader.directory
        names = real_reader.names
        file = real_reader.file

        def path_metadata(self, p):
            return canonical_from_stat(p.lstat())

        def directory_metadata(self, fd):
            return canonical_from_stat(os.fstat(fd))

        def file_metadata(self, fd):
            n = canonical_from_stat(os.fstat(fd))
            return replace(n, change=n.change + 1) if changed else n

    monkeypatch.setattr(io, "Reader", NativeReader)
    if changed:
        monkeypatch.setattr(
            os,
            "read",
            lambda *args: pytest.fail("source read before identity validation"),
        )
        with pytest.raises(PolicyRefusal) as caught:
            io.inventory(path)
        assert caught.value.refusal_code == "file_changed_before_read"
    else:
        files, _ = io.inventory(path)
        assert files[0]["fingerprint"] == "BYTES_RECOMPUTED"


def test_metadata_diagnostic_has_no_content_read_primitive():
    import ast

    tree = ast.parse(Path(diagnostic.__file__).read_text())
    assert not any(
        isinstance(node, ast.Attribute)
        and node.attr
        in (
            "read",
            "read_bytes",
            "read_text",
            "write",
            "write_bytes",
            "write_text",
            "chmod",
            "utime",
            "unlink",
            "mkdir",
        )
        for node in ast.walk(tree)
    )


@pytest.mark.skipif(
    os.name != "nt", reason="Requires actual Windows handles on disposable CI fixtures"
)
def test_real_windows_protected_inventory_and_diagnostic_preserve_all_metadata(
    tmp_path,
):
    # Only new disposable files are modified. No operator evidence is loaded.
    root = tmp_path / "evidence"
    root.mkdir()
    path = root / "synthetic.exe"
    path.write_bytes(b'{"synthetic":true}')
    reader = io.Reader()
    before = reader.path_metadata(path)
    root_before = reader.path_metadata(root)
    records_, _ = io.inventory(root)
    assert records_[0]["fingerprint"] == "BYTES_RECOMPUTED"
    result = diagnostic.diagnose(root)
    assert result["sampled_files"] == 1
    assert result["source_file_reads"] == 0
    assert result["reviewed"] is result["navigation_authorized"] is False
    assert io.stamp(reader.path_metadata(path)) == io.stamp(before)
    assert io.stamp(reader.path_metadata(root)) == io.stamp(root_before)
    assert path.name not in json.dumps(result) and str(root) not in json.dumps(result)


def test_diagnostic_cli_invalid_arguments_never_echo_private_values(
    monkeypatch, capsys
):
    spec = importlib.util.spec_from_file_location(
        "identity_cli", "scripts/diagnose-review-evidence-identity.py"
    )
    cli = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cli)
    monkeypatch.setattr(sys, "argv", ["diagnostic", "--private-credential"])
    with pytest.raises(SystemExit) as caught:
        cli.main()
    assert caught.value.code == 2
    assert capsys.readouterr().err == "PRIVATE_IDENTITY_DIAGNOSTIC_REFUSED\n"
