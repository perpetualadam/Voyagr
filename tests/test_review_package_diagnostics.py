"""Synthetic refusal injection only; no actual Windows/private evidence required."""

import ast
import ctypes
import errno
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest
from voyagr.utils import review_package_io as io
from voyagr.utils import review_package as package
from voyagr.utils.review_package_diagnostics import (
    PolicyRefusal,
    CapabilityRefusal,
    CODES,
    refusal_details,
    operation,
)
from tests.test_review_package import seed, docs


@pytest.mark.parametrize("code", list(CODES))
def test_closed_vocabulary_never_serializes_exception_arguments(code):
    error = PolicyRefusal(code)
    error.args = ("PRIVATE_FILENAME_COORDINATE_CREDENTIAL_53.12345",)
    result = refusal_details(error)
    text = json.dumps(result)
    assert "PRIVATE_" not in text
    assert "53.12345" not in text
    assert result["category"] == CODES[code][0]
    assert len(text) < 512
    assert result["reviewed"] is False
    assert result["navigation_authorized"] is False
    assert result["production"] == "PRODUCTION_NO_GO"


def test_untyped_message_matching_is_not_trusted():
    result = refusal_details(
        ValueError("windows_no_atime_unavailable PRIVATE_FILENAME")
    )
    assert result["category"] == "INTERNAL_ERROR"
    assert "PRIVATE_FILENAME" not in json.dumps(result)


class Kernel:
    def __init__(self, open_error=None, freeze_error=None, enum_error=18):
        self.open_error, self.freeze_error, self.enum_error = (
            open_error,
            freeze_error,
            enum_error,
        )
        self.last = 0
        self.calls = []

    def CreateFileW(self, *args):
        self.calls.append(("open", args))
        if self.open_error is not None:
            self.last = self.open_error
            return ctypes.c_void_p(-1).value
        return 2**40 + 7  # Pointer-sized handle; never truncate to 32 bits.

    def SetFileTime(self, handle, creation, access, write):
        self.calls.append(
            ("freeze", (handle, creation, ctypes.string_at(access, 8), write))
        )
        if self.freeze_error is not None:
            self.last = self.freeze_error
            return False
        return True

    def CloseHandle(self, handle):
        self.calls.append(("close", handle))
        self.last = 87

    def GetFileInformationByHandleEx(self, *args):
        self.calls.append(("enumerate", args[1]))
        self.last = self.enum_error
        return False


def windows(kernel):
    win = io._Windows.__new__(io._Windows)
    win.k = kernel
    win.c = SimpleNamespace(
        c_void_p=ctypes.c_void_p,
        byref=ctypes.byref,
        get_last_error=lambda: kernel.last,
        create_string_buffer=ctypes.create_string_buffer,
    )
    win.w = SimpleNamespace(DWORD=ctypes.c_uint32)
    return win


@pytest.mark.parametrize(
    "code,category,reason",
    [
        (5, "SOURCE_ACCESS_DENIED", "ACCESS_DENIED"),
        (1314, "SOURCE_ACCESS_DENIED", "ACCESS_DENIED"),
        (32, "SOURCE_BUSY", "SHARING_OR_LOCK_CONFLICT"),
        (87, "WINDOWS_SOURCE_OPEN", "INVALID_PARAMETER"),
        (50, "WINDOWS_SOURCE_OPEN", "UNSUPPORTED_OPERATION"),
    ],
)
def test_windows_open_failure_classification_without_probe_or_retry(
    code, category, reason
):
    k = Kernel(open_error=code)
    with pytest.raises(CapabilityRefusal) as caught:
        windows(k).open("PRIVATE_SOURCE_FILE", False)
    result = refusal_details(caught.value)
    assert (result["category"], result["reason"], result["operation"]) == (
        category,
        reason,
        "WINDOWS_OPEN_FILE",
    )
    assert len(k.calls) == 1  # No retry with fewer rights/without no-atime.
    assert "PRIVATE_SOURCE" not in json.dumps(result)


@pytest.mark.parametrize(
    "code,reason",
    [(5, "ACCESS_DENIED"), (87, "INVALID_PARAMETER"), (50, "UNSUPPORTED_OPERATION")],
)
def test_windows_freeze_failure_saves_last_error_before_close(code, reason):
    k = Kernel(freeze_error=code)
    with pytest.raises(CapabilityRefusal) as caught:
        windows(k).open("PRIVATE_DIRECTORY", True)
    result = refusal_details(caught.value)
    assert result["category"] == "WINDOWS_NO_ATIME_CAPABILITY"
    assert result["operation"] == "WINDOWS_FREEZE_ATIME"
    assert result["reason"] == reason  # Close overwrites the mocked last-error.
    assert [call[0] for call in k.calls] == ["open", "freeze", "close"]
    assert k.calls[1][1][2] == b"\xff" * 8
    assert k.calls[1][1][1] is k.calls[1][1][3] is None


def test_successful_windows_handle_flags_are_unchanged():
    k = Kernel()
    win = windows(k)
    with win.directory("PRIVATE_DIRECTORY") as handle:
        assert handle == 2**40 + 7
        assert list(win.names(handle)) == []
    args = k.calls[0][1]
    assert args[1:] == (0x80000000 | 0x100, 1, None, 3, 0x00200000 | 0x02000000, None)
    assert [c[0] for c in k.calls] == ["open", "freeze", "enumerate", "close"]


@pytest.mark.parametrize(
    "code,category",
    [
        (5, "SOURCE_ACCESS_DENIED"),
        (87, "WINDOWS_DIRECTORY_ENUMERATION"),
        (50, "WINDOWS_DIRECTORY_ENUMERATION"),
    ],
)
def test_windows_directory_api_refusals_have_fixed_categories(code, category):
    k = Kernel(enum_error=code)
    with pytest.raises(CapabilityRefusal) as caught:
        list(windows(k).names(2**40 + 7))
    result = refusal_details(caught.value)
    assert result["category"] == category
    assert result["operation"] == "WINDOWS_ENUMERATE_DIRECTORY"
    assert [c[0] for c in k.calls] == ["enumerate"]


@pytest.mark.parametrize(
    "stage,expected",
    [
        ("OUTPUT_POLICY", "OUTPUT_ACCESS_DENIED"),
        ("OUTPUT_WRITE", "OUTPUT_ACCESS_DENIED"),
        ("INVENTORY", "SOURCE_ACCESS_DENIED"),
        ("INPUT_PATH_POLICY", "SOURCE_ACCESS_DENIED"),
        ("POSIX_NO_ATIME_OPEN", "SOURCE_ACCESS_DENIED"),
    ],
)
def test_acl_family_is_an_observed_denial_not_an_acl_cause_claim(stage, expected):
    with pytest.raises(PermissionError) as caught:
        with operation(stage):
            raise PermissionError(errno.EACCES, "PRIVATE_EXCEPTION", "PRIVATE_FILENAME")
    result = refusal_details(caught.value)
    assert result["category"] == expected
    assert result["reason"] == "ACCESS_DENIED"
    assert result["operation"] == stage
    assert "PRIVATE_" not in json.dumps(result)


def cli_module():
    spec = importlib.util.spec_from_file_location(
        "packager_cli_for_tests", "scripts/prepare-phase12fb-review-package.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("diagnose", [False, True])
def test_cli_same_single_workflow_and_no_extra_io_on_refusal(
    tmp_path, monkeypatch, capsys, diagnose
):
    calls = []

    def fail(root, output):
        calls.append((root, output))
        raise CapabilityRefusal(
            "windows_no_atime_unavailable", operation="WINDOWS_FREEZE_ATIME", winerror=5
        )

    monkeypatch.setattr(package, "prepare", fail)
    args = [
        "prepare",
        "--evidence-directory",
        str(tmp_path / "PRIVATE_SOURCE"),
        "--output-directory",
        str(tmp_path / "PRIVATE_OUTPUT"),
    ]
    if diagnose:
        args.append("--diagnose-refusal")
    monkeypatch.setattr(sys, "argv", args)
    assert cli_module().main() == 2
    out = capsys.readouterr()
    assert out.out == ""
    lines = out.err.splitlines()
    assert lines[0] == "PRIVATE_REVIEW_PACKAGE_REFUSED"
    assert len(lines) == (2 if diagnose else 1)
    assert len(calls) == 1
    if diagnose:
        assert json.loads(lines[1])["category"] == "WINDOWS_NO_ATIME_CAPABILITY"
    assert "PRIVATE_SOURCE" not in out.err and "PRIVATE_OUTPUT" not in out.err
    assert not list(tmp_path.iterdir())


def test_real_output_policy_refusal_has_no_source_metadata_changes(tmp_path):
    root = seed(tmp_path / "evidence")
    out = tmp_path / "existing"
    out.mkdir()
    paths = [root, *root.rglob("*")]
    before = {p: io.stamp(p.lstat()) for p in paths}
    args = [
        sys.executable,
        "scripts/prepare-phase12fb-review-package.py",
        "--evidence-directory",
        str(root),
        "--output-directory",
        str(out),
        "--diagnose-refusal",
    ]
    result = subprocess.run(args, capture_output=True, text=True)
    assert result.returncode == 2
    data = json.loads(result.stderr.splitlines()[1])
    assert (data["category"], data["operation"], data["reason"]) == (
        "OUTPUT_POLICY",
        "OUTPUT_POLICY",
        "OUTPUT_EXISTS",
    )
    assert {p: io.stamp(p.lstat()) for p in paths} == before
    assert result.stdout == ""
    assert str(tmp_path) not in result.stderr
    assert len(result.stderr) < 600


def test_invalid_cli_arguments_are_classified_without_echoing_them():
    args = [
        sys.executable,
        "scripts/prepare-phase12fb-review-package.py",
        "--diagnose-refusal",
        "--PRIVATE_CREDENTIAL_COORDINATES",
    ]
    result = subprocess.run(args, capture_output=True, text=True)
    assert result.returncode == 2
    assert json.loads(result.stderr.splitlines()[1])["category"] == "ARGUMENTS_INVALID"
    assert "PRIVATE_CREDENTIAL" not in result.stderr
    assert "COORDINATES" not in result.stderr


def test_conflicting_evidence_is_a_finding_not_a_new_refusal(tmp_path):
    root = seed(tmp_path / "evidence")
    (root / "conflict.json").write_text('{"graph_sha256":"' + "b" * 64 + '"}')
    out = tmp_path / "package"
    result = subprocess.run(
        [
            sys.executable,
            "scripts/prepare-phase12fb-review-package.py",
            "--evidence-directory",
            str(root),
            "--output-directory",
            str(out),
            "--diagnose-refusal",
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert (
        result.stdout.strip()
        == "PRIVATE_REVIEW_PACKAGE_CREATED_UNREVIEWED_PRODUCTION_NO_GO"
    )
    assert result.stderr == ""  # No refusal, no second evidence scan.
    checks = json.loads((out / "verification-results.json").read_bytes())["checks"]
    assert any(c["status"] == "CONFLICTING_CLAIMS" for c in checks)


def test_all_explicit_hard_refusal_sites_use_the_closed_vocabulary():
    # Prevent new internal refusal codes silently losing their stable category.
    for filename in (
        "voyagr/utils/review_package_io.py",
        "voyagr/utils/review_package.py",
    ):
        tree = ast.parse(Path(filename).read_text())
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Raise)
                and isinstance(node.exc, ast.Call)
                and isinstance(node.exc.func, ast.Name)
                and node.exc.func.id in ("PolicyRefusal", "CapabilityRefusal")
            ):
                assert isinstance(node.exc.args[0], ast.Constant)
                assert node.exc.args[0].value in CODES


def test_diagnostic_failure_still_suppresses_original_exception_chain(
    tmp_path, monkeypatch, capsys
):
    from voyagr.utils import review_package_diagnostics as d

    def fail(*args):
        raise RuntimeError("PRIVATE_ORIGINAL_EXCEPTION_COORDINATES")

    def broken(error):
        raise RuntimeError("PRIVATE_DIAGNOSTIC_FAILURE_CREDENTIAL")

    monkeypatch.setattr(package, "prepare", fail)
    monkeypatch.setattr(d, "refusal_details", broken)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare",
            "--evidence-directory",
            str(tmp_path / "private"),
            "--output-directory",
            str(tmp_path / "new"),
            "--diagnose-refusal",
        ],
    )
    assert cli_module().main() == 2
    text = capsys.readouterr().err
    assert json.loads(text.splitlines()[1])["reason"] == "DIAGNOSTIC_UNAVAILABLE"
    assert (
        "EXCEPTION" not in text and "CREDENTIAL" not in text and "Traceback" not in text
    )


def test_unsafe_exception_metadata_is_not_serialized():
    error = PermissionError(errno.EACCES, "PRIVATE_SECRET", "PRIVATE_PATH")
    error.refusal_operation = ["PRIVATE_COORDED_PATH"]
    result = refusal_details(error)
    assert result["operation"] == "UNKNOWN"
    assert result["category"] == "SOURCE_ACCESS_DENIED"
    assert "PRIVATE" not in json.dumps(result)
