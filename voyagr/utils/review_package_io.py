"""Local, no-follow/no-atime inventory IO. No network or Git subprocesses."""

from contextlib import contextmanager
import hashlib
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import stat
import struct
import re
import sys

from voyagr.utils.review_package_diagnostics import (
    PolicyRefusal,
    CapabilityRefusal,
    operation,
)

MAX_FILES = 512
MAX_DIRS = 128
MAX_DEPTH = 8
MAX_ENTRIES = 2048
MAX_FILE_BYTES = 512 * 1024 * 1024
MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
MAX_JSON_BYTES = 32 * 1024 * 1024
MAX_TOTAL_JSON = 64 * 1024 * 1024
REPOSITORY = Path(__file__).resolve().parents[2]
LOCAL_FILESYSTEMS = frozenset(
    "ext2 ext3 ext4 xfs btrfs tmpfs ramfs overlay aufs zfs ntfs3 vfat exfat ubifs f2fs squashfs iso9660".split()
)


def _filesystem_type(path):
    candidates = []
    for line in Path("/proc/self/mountinfo").read_text().splitlines():
        left, right = line.split(" - ", 1)
        mount = re.sub(r"\\([0-7]{3})", lambda m: chr(int(m[1], 8)), left.split()[4])
        if path.is_relative_to(Path(mount)):
            candidates.append((len(mount), right.split()[0]))
    if not candidates:
        raise CapabilityRefusal("storage_type_unavailable")
    return max(candidates)[1]


def _require_local_storage(path):
    if os.name == "nt":
        import ctypes

        function = ctypes.WinDLL("kernel32", use_last_error=True).GetDriveTypeW
        function.argtypes = [ctypes.c_wchar_p]
        function.restype = ctypes.c_uint
        if function(path.anchor) not in (2, 3, 6):
            raise CapabilityRefusal("local_drive_required")
    elif sys.platform.startswith("linux"):
        if _filesystem_type(path) not in LOCAL_FILESYSTEMS:
            raise CapabilityRefusal("local_filesystem_required")
    else:
        raise CapabilityRefusal("unsupported_no_atime_platform")


def relative_path(value):
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 2048
        or "\\" in value
        or ":" in value
        or any(ord(c) < 32 or ord(c) > 126 for c in value)
        or PurePosixPath(value).is_absolute()
        or PureWindowsPath(value).is_absolute()
        or any(part in ("", ".", "..") for part in value.split("/"))
    ):
        raise PolicyRefusal("unsafe_relative_reference")
    reserved = {
        "CON",
        "PRN",
        "AUX",
        "NUL",
        *("COM" + str(i) for i in range(1, 10)),
        *("LPT" + str(i) for i in range(1, 10)),
    }
    if any(
        part.endswith((".", " "))
        or part.split(".")[0].upper() in reserved
        or any(c in part for c in '%?*<>"|')
        for part in value.split("/")
    ):
        raise PolicyRefusal("nonportable_reference")
    return value


def reparse(info):
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0) & 0x400
    )


def local_path(value):
    text = str(value)
    if "\x00" in text or text.startswith(("\\\\", "//")):
        raise PolicyRefusal("local_path_required")
    path = Path(value)
    if not path.is_absolute() or ".." in path.parts:
        raise PolicyRefusal("absolute_path_without_traversal_required")
    with operation("STORAGE_CHECK"):
        _require_local_storage(path)
    for parent in reversed((path, *path.parents)):
        try:
            info = parent.lstat()
        except FileNotFoundError:
            continue
        if reparse(info):
            raise PolicyRefusal("reparse_path_forbidden")
    return path


def git_boundary(directory):
    marker = directory / ".git"
    if (
        marker.is_file()
        or marker.is_symlink()
        or (
            marker.is_dir()
            and (
                (marker / "HEAD").exists()
                or (marker / "config").exists()
                or (marker / "objects").is_dir()
            )
        )
    ):
        return True
    return (
        (directory / "HEAD").is_file()
        and (directory / "objects").is_dir()
        and (directory / "refs").is_dir()
    )


def outside_git(path):
    if path.is_relative_to(REPOSITORY) or any(
        git_boundary(p) for p in (path, *path.parents)
    ):
        raise PolicyRefusal("git_destination_forbidden")


def stamp(info):
    from voyagr.utils.windows_evidence_metadata import WindowsMetadata

    if isinstance(info, WindowsMetadata):
        return info.fingerprint
    return (
        info.st_dev,
        info.st_ino,
        info.st_mode,
        info.st_size,
        info.st_mtime_ns,
        info.st_atime_ns,
        info.st_ctime_ns,
        info.st_nlink,
        info.st_uid,
        info.st_gid,
    )


class _Windows:
    """Freeze access-time updates on each handle, never set an actual timestamp."""

    def __init__(self):
        import ctypes
        from ctypes import wintypes as w

        self.c, self.w = ctypes, w
        self.k = ctypes.WinDLL("kernel32", use_last_error=True)
        self.k.CreateFileW.argtypes = [
            w.LPCWSTR,
            w.DWORD,
            w.DWORD,
            w.LPVOID,
            w.DWORD,
            w.DWORD,
            w.HANDLE,
        ]
        self.k.CreateFileW.restype = w.HANDLE
        self.k.SetFileTime.argtypes = [w.HANDLE, w.LPVOID, w.LPVOID, w.LPVOID]
        self.k.SetFileTime.restype = w.BOOL
        self.k.GetFileInformationByHandleEx.argtypes = [
            w.HANDLE,
            ctypes.c_int,
            w.LPVOID,
            w.DWORD,
        ]
        self.k.GetFileInformationByHandleEx.restype = w.BOOL
        self.k.CloseHandle.argtypes = [w.HANDLE]
        self.k.CloseHandle.restype = w.BOOL
        self.k.GetFileType.argtypes = [w.HANDLE]
        self.k.GetFileType.restype = w.DWORD

    def open(self, path, directory):
        # FILE_WRITE_ATTRIBUTES is required by Windows to disable automatic atime
        # updates on this handle. No file data/timestamp/ACL is written.
        with operation("WINDOWS_OPEN_DIRECTORY" if directory else "WINDOWS_OPEN_FILE"):
            handle = self.k.CreateFileW(
                str(path),
                0x80000000 | 0x100,
                1,
                None,
                3,
                0x00200000 | (0x02000000 if directory else 0),
                None,
            )
        if handle == self.c.c_void_p(-1).value:
            raise CapabilityRefusal(
                "windows_read_handle_unavailable",
                operation=(
                    "WINDOWS_OPEN_DIRECTORY" if directory else "WINDOWS_OPEN_FILE"
                ),
                winerror=self.c.get_last_error(),
            )
        frozen = (self.w.DWORD * 2)(0xFFFFFFFF, 0xFFFFFFFF)
        with operation("WINDOWS_FREEZE_ATIME"):
            if not self.k.SetFileTime(handle, None, self.c.byref(frozen), None):
                code = self.c.get_last_error()
                self.k.CloseHandle(handle)
                raise CapabilityRefusal(
                    "windows_no_atime_unavailable",
                    operation="WINDOWS_FREEZE_ATIME",
                    winerror=code,
                )
        return handle

    @contextmanager
    def directory(self, path):
        handle = self.open(path, True)
        try:
            yield handle
        finally:
            self.k.CloseHandle(handle)

    @contextmanager
    def file(self, path):
        import msvcrt

        handle = self.open(path, False)
        try:
            with operation("WINDOWS_WRAP_READ_HANDLE"):
                fd = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
        except Exception:
            self.k.CloseHandle(handle)
            raise
        try:
            yield fd
        finally:
            os.close(fd)

    def metadata(self, handle):
        from voyagr.utils.windows_evidence_metadata import decode_metadata

        with operation("WINDOWS_METADATA_QUERY"):
            if self.k.GetFileType(handle) != 1:  # FILE_TYPE_DISK only
                raise PolicyRefusal("external_or_special_file_forbidden")
            records = []
            # FileBasicInfo, FileStandardInfo, FileIdInfo, FileAttributeTagInfo.
            # No 64-bit-ID or reduced-metadata fallback when an API is unavailable.
            for kind, size in ((0, 40), (1, 24), (18, 24), (9, 8)):
                buffer = self.c.create_string_buffer(size)
                if not self.k.GetFileInformationByHandleEx(handle, kind, buffer, size):
                    raise CapabilityRefusal(
                        "windows_metadata_unavailable",
                        operation="WINDOWS_METADATA_QUERY",
                        winerror=self.c.get_last_error(),
                    )
                records.append(buffer.raw)
            return decode_metadata(*records)

    def path_metadata(self, path):
        # BACKUP_SEMANTICS permits both files and directories. OPEN_REPARSE_POINT
        # plus native attribute/tag checks refuses reparse handles themselves.
        with self.directory(path) as handle:
            return self.metadata(handle)

    def names(self, handle):
        buffer = self.c.create_string_buffer(65536)
        first = True
        while True:
            with operation("WINDOWS_ENUMERATE_DIRECTORY"):
                ok = self.k.GetFileInformationByHandleEx(
                    handle, 11 if first else 10, buffer, len(buffer)
                )
            first = False
            if not ok:
                if self.c.get_last_error() == 18:
                    return
                raise CapabilityRefusal(
                    "windows_directory_read_unavailable",
                    operation="WINDOWS_ENUMERATE_DIRECTORY",
                    winerror=self.c.get_last_error(),
                )
            with operation("WINDOWS_ENUMERATE_DIRECTORY"):
                yield from windows_names(buffer.raw)


def windows_names(raw):
    """FILE_ID_BOTH_DIR_INFO, fixed Win32 offsets (not host ctypes widths)."""
    offset = 0
    while True:
        if offset + 104 > len(raw):
            raise PolicyRefusal("invalid_windows_directory_record")
        next_offset = struct.unpack_from("<I", raw, offset)[0]
        size = struct.unpack_from("<I", raw, offset + 60)[0]
        if size % 2 or offset + 104 + size > len(raw):
            raise PolicyRefusal("invalid_windows_directory_name")
        name = raw[offset + 104 : offset + 104 + size].decode("utf-16-le")
        if name not in (".", ".."):
            yield name
        if not next_offset:
            break
        if next_offset < 104 + size:
            raise PolicyRefusal("invalid_windows_directory_offset")
        offset += next_offset


class Reader:
    def __init__(self):
        with operation("WINDOWS_BACKEND_SETUP"):
            self.win = _Windows() if os.name == "nt" else None

    def path_metadata(self, path):
        return self.win.path_metadata(path) if self.win else path.lstat()

    def file_metadata(self, fd):
        if self.win:
            import msvcrt

            return self.win.metadata(msvcrt.get_osfhandle(fd))
        return os.fstat(fd)

    def directory_metadata(self, handle):
        return self.win.metadata(handle) if self.win else os.fstat(handle)

    @contextmanager
    def directory(self, path, *, parent=None, name=None):
        if self.win:
            with self.win.directory(path) as handle:
                yield handle
            return
        if not hasattr(os, "O_NOATIME"):
            raise CapabilityRefusal("no_atime_not_supported")
        with operation("POSIX_NO_ATIME_OPEN"):
            fd = os.open(
                name if parent is not None else path,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME,
                dir_fd=parent,
            )
        try:
            yield fd
        finally:
            os.close(fd)

    def names(self, handle, limit):
        result = []
        if self.win:
            iterator = self.win.names(handle)
            for name in iterator:
                if len(result) >= limit:
                    raise PolicyRefusal("entry_limit")
                result.append(name)
        else:
            with os.scandir(handle) as iterator:
                for entry in iterator:
                    if len(result) >= limit:
                        raise PolicyRefusal("entry_limit")
                    result.append(entry.name)
        return result

    @contextmanager
    def file(self, path, parent, name):
        if self.win:
            with self.win.file(path) as fd:
                yield fd
            return
        if not hasattr(os, "O_NOATIME"):
            raise CapabilityRefusal("no_atime_not_supported")
        with operation("POSIX_NO_ATIME_OPEN"):
            fd = os.open(
                name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME, dir_fd=parent
            )
        try:
            yield fd
        finally:
            os.close(fd)


def inventory(root):
    root = local_path(root)
    if not root.is_dir():
        raise PolicyRefusal("evidence_directory_required")
    outside_git(root)
    reader = Reader()
    files, blobs, seen = [], {}, set()
    dirs, entries, total, json_total = 0, 0, 0, 0
    device = reader.path_metadata(root).st_dev

    def walk(path, rel, depth, parent=None, name=None):
        nonlocal dirs, entries, total, json_total
        dirs += 1
        if dirs > MAX_DIRS or depth > MAX_DEPTH:
            raise PolicyRefusal("traversal_limit")
        before = reader.path_metadata(path)
        if reparse(before) or before.st_dev != device:
            raise PolicyRefusal("external_directory_forbidden")
        if git_boundary(path):
            raise PolicyRefusal("nested_git_forbidden")
        with reader.directory(path, parent=parent, name=name) as directory:
            if stamp(reader.directory_metadata(directory)) != stamp(before):
                raise PolicyRefusal("directory_changed")
            names = reader.names(directory, MAX_ENTRIES - entries)
            entries += len(names)
            if entries > MAX_ENTRIES:
                raise PolicyRefusal("entry_limit")
            for child in sorted(names):
                if child == ".git":
                    raise PolicyRefusal("nested_git_forbidden")
                relative_path(child)
                relative = relative_path(rel + "/" + child if rel else child)
                if relative.casefold() in seen:
                    raise PolicyRefusal("case_conflicting_paths")
                seen.add(relative.casefold())
                target = path / child
                info = reader.path_metadata(target)
                if reparse(info):
                    raise PolicyRefusal("symlink_or_reparse_forbidden")
                if stat.S_ISDIR(info.st_mode):
                    walk(target, relative, depth + 1, directory, child)
                    continue
                if (
                    not stat.S_ISREG(info.st_mode)
                    or info.st_nlink != 1
                    or info.st_dev != device
                ):
                    raise PolicyRefusal("external_or_special_file_forbidden")
                if len(files) >= MAX_FILES:
                    raise PolicyRefusal("file_limit")
                record = {
                    "path": relative,
                    "size_bytes": info.st_size,
                    "sha256": None,
                    "fingerprint": "NOT_READ_LIMIT",
                }
                if (
                    info.st_size <= MAX_FILE_BYTES
                    and total + info.st_size <= MAX_TOTAL_BYTES
                ):
                    collect = (
                        target.suffix.lower() == ".json"
                        and info.st_size <= MAX_JSON_BYTES
                        and json_total + info.st_size <= MAX_TOTAL_JSON
                    )
                    with reader.file(target, directory, child) as fd:
                        if stamp(reader.file_metadata(fd)) != stamp(info):
                            raise PolicyRefusal("file_changed_before_read")
                        h, size, parts = hashlib.sha256(), 0, []
                        while True:
                            with operation("SOURCE_READ"):
                                chunk = os.read(
                                    fd, min(1024 * 1024, info.st_size - size + 1)
                                )
                            if not chunk:
                                break
                            size += len(chunk)
                            if size > info.st_size:
                                raise PolicyRefusal("file_changed_during_read")
                            h.update(chunk)
                            if collect:
                                parts.append(chunk)
                        if size != info.st_size or stamp(
                            reader.file_metadata(fd)
                        ) != stamp(info):
                            raise PolicyRefusal("file_changed_during_read")
                    if stamp(reader.path_metadata(target)) != stamp(info):
                        raise PolicyRefusal("file_changed_after_read")
                    record.update(sha256=h.hexdigest(), fingerprint="BYTES_RECOMPUTED")
                    total += size
                    if collect:
                        blobs[relative] = b"".join(parts)
                        json_total += size
                files.append(record)
        if stamp(reader.path_metadata(path)) != stamp(before):
            raise PolicyRefusal("directory_metadata_changed")

    walk(root, "", 0)
    return sorted(files, key=lambda f: f["path"]), blobs


def output_directory(root, output):
    with operation("INPUT_PATH_POLICY"):
        root = local_path(root)
    output = local_path(output)
    outside_git(output)
    if output.exists() or output.is_symlink():
        raise PolicyRefusal("existing_output_forbidden")
    if output.is_relative_to(root) or root.is_relative_to(output):
        raise PolicyRefusal("input_output_overlap")
    if not output.parent.is_dir():
        raise PolicyRefusal("output_parent_required")
    return output


def write_package(output, documents):
    # Caller validates disjoint roots before inventory; repeat no-follow checks.
    output = local_path(output)
    outside_git(output)
    if output.exists():
        raise PolicyRefusal("existing_output_forbidden")
    os.mkdir(output, 0o700)
    for name, raw in documents.items():
        if name not in {
            "evidence-manifest.json",
            "verification-results.json",
            "reviewer-checklist.md",
            "unresolved-findings.json",
            "package-summary.md",
        }:
            raise PolicyRefusal("unexpected_output")
        fd = os.open(
            output / name,
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL
            | getattr(os, "O_NOFOLLOW", 0)
            | getattr(os, "O_BINARY", 0),
            0o600,
        )
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
