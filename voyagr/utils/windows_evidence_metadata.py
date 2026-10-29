"""Exact Win32 metadata representation; no Python stat/fstat semantic mixing."""

from dataclasses import dataclass, astuple
import stat
import struct

from voyagr.utils.review_package_diagnostics import PolicyRefusal

EPOCH_TICKS = 116444736000000000


@dataclass(frozen=True)
class WindowsMetadata:
    volume: int
    identity: bytes
    creation: int
    access: int
    write: int
    change: int
    size: int
    allocation: int
    links: int
    attributes: int
    tag: int
    directory: bool
    pending_delete: bool

    @property
    def fingerprint(self):
        return astuple(self)

    @property
    def st_dev(self):
        return self.volume

    @property
    def st_ino(self):
        return int.from_bytes(self.identity, "little")

    @property
    def st_size(self):
        return self.size

    @property
    def st_nlink(self):
        return self.links

    @property
    def st_file_attributes(self):
        return self.attributes

    @property
    def st_mode(self):
        # Type/readonly compatibility only, never an ACL/access authorization.
        return (stat.S_IFDIR | 0o111 if self.directory else stat.S_IFREG) | (
            0o444 if self.attributes & 1 else 0o666
        )

    @property
    def st_birthtime_ns(self):
        return (self.creation - EPOCH_TICKS) * 100

    @property
    def st_atime_ns(self):
        return (self.access - EPOCH_TICKS) * 100

    @property
    def st_mtime_ns(self):
        return (self.write - EPOCH_TICKS) * 100

    @property
    def st_ctime_ns(self):
        return (self.change - EPOCH_TICKS) * 100


def decode_metadata(basic, standard, identity, tag):
    """Fixed Windows ABI sizes/offsets, independent of host ctypes C widths."""
    try:
        creation, access, write, change, attributes = struct.unpack("<qqqqI4x", basic)
        allocation, size, links, pending, directory = struct.unpack(
            "<qqIBB2x", standard
        )
        volume, file_id = struct.unpack("<Q16s", identity)
        tag_attributes, reparse_tag = struct.unpack("<II", tag)
    except (struct.error, TypeError):
        raise PolicyRefusal("windows_metadata_invalid") from None
    if (
        attributes != tag_attributes
        or bool(attributes & 0x10) != bool(directory)
        or pending not in (0, 1)
        or directory not in (0, 1)
        or size < 0
        or allocation < 0
        or links < 1
        or not any(file_id)
    ):
        raise PolicyRefusal("windows_metadata_invalid")
    if attributes & 0x400 or reparse_tag:
        raise PolicyRefusal("symlink_or_reparse_forbidden")
    if pending:
        raise PolicyRefusal("windows_delete_pending")
    return WindowsMetadata(
        volume,
        file_id,
        creation,
        access,
        write,
        change,
        size,
        allocation,
        links,
        attributes,
        reparse_tag,
        bool(directory),
        bool(pending),
    )
