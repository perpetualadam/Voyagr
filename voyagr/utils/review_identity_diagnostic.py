"""Opt-in, bounded metadata-only Windows investigation. Never package acceptance."""

import os
import stat

from voyagr.utils import review_package_io as io
from voyagr.utils.review_package_diagnostics import PolicyRefusal, CapabilityRefusal

FIELDS = (
    "st_dev",
    "st_ino",
    "st_mode",
    "st_size",
    "st_mtime_ns",
    "st_atime_ns",
    "st_ctime_ns",
    "st_nlink",
    "st_uid",
    "st_gid",
    "st_birthtime_ns",
    "st_file_attributes",
    "st_reparse_tag",
)


def python_metadata(info):
    # Internal only; raw values must never reach a report.
    return tuple(getattr(info, name, None) for name in FIELDS)


def classify_samples(native, paths, handles):
    """Sample stability is evidence for an API difference, not absence of mutation."""
    path_values = [python_metadata(p) for p in paths]
    handle_values = [python_metadata(h) for h in handles]
    differences = [
        name
        for i, name in enumerate(FIELDS)
        if path_values[0][i] != handle_values[0][i]
    ]
    if any(io.stamp(n) != io.stamp(native[0]) for n in native[1:]):
        category = "NATIVE_METADATA_OR_IDENTITY_CHANGE_OBSERVED"
    elif any(p != path_values[0] for p in path_values[1:]) or any(
        h != handle_values[0] for h in handle_values[1:]
    ):
        category = "INCONSISTENT_SAMPLING_UNRESOLVED"
    elif differences:
        category = "STABLE_API_REPRESENTATION_DIFFERENCE_OBSERVED"
    else:
        category = "NO_DIFFERENCE_OBSERVED"
    p, h, n = paths[0], handles[0], native[0]
    return {
        "classification": category,
        "different_fields": differences,
        "ctime_creation_vs_change_pattern": (
            p.st_ctime_ns == n.st_birthtime_ns
            and h.st_ctime_ns == n.st_ctime_ns
            and n.st_birthtime_ns != n.st_ctime_ns
        ),
        "mode_execute_only_pattern": (
            p.st_mode != h.st_mode and p.st_mode & ~0o111 == h.st_mode & ~0o111
        ),
    }


def sample_file(path, reader, parent, name, before):
    # Existing protected no-follow/no-atime open only. No os.read or file hashing.
    paths = [path.lstat()]
    with reader.file(path, parent, name) as fd:
        first = reader.file_metadata(fd)
        handles = [os.fstat(fd)]
        paths.append(path.lstat())
        handles.append(os.fstat(fd))
        last = reader.file_metadata(fd)
    paths.append(path.lstat())
    after = reader.path_metadata(path)
    return classify_samples([before, first, last, after], paths, handles)


def diagnose(root):
    root = io.local_path(root)
    io.outside_git(root)
    reader = io.Reader()
    if not reader.win:
        raise CapabilityRefusal("windows_identity_diagnostic_required")
    initial = reader.path_metadata(root)
    if not stat.S_ISDIR(initial.st_mode):
        raise PolicyRefusal("evidence_directory_required")
    report = {
        "diagnostic_schema_version": 1,
        "outcome": "METADATA_DIAGNOSTIC_ONLY",
        "source_file_reads": 0,
        "sampled_files": 0,
        "classifications": {},
        "different_fields": [],
        "ctime_creation_vs_change_patterns": 0,
        "mode_execute_only_patterns": 0,
        "mutation_absence_proven": False,
        "reviewed": False,
        "navigation_authorized": False,
        "production": "PRODUCTION_NO_GO",
    }
    dirs, entries = 0, 0
    names_seen = set()
    differences = set()

    def walk(path, rel, depth, before, parent=None, name=None):
        nonlocal dirs, entries
        dirs += 1
        if dirs > io.MAX_DIRS or depth > io.MAX_DEPTH:
            raise PolicyRefusal("traversal_limit")
        if io.reparse(before) or before.st_dev != initial.st_dev:
            raise PolicyRefusal("external_directory_forbidden")
        if io.git_boundary(path):
            raise PolicyRefusal("nested_git_forbidden")
        with reader.directory(path, parent=parent, name=name) as directory:
            if io.stamp(reader.directory_metadata(directory)) != io.stamp(before):
                raise PolicyRefusal("directory_changed")
            children = reader.names(directory, io.MAX_ENTRIES - entries)
            entries += len(children)
            if entries > io.MAX_ENTRIES:
                raise PolicyRefusal("entry_limit")
            for child in sorted(children):
                if child == ".git":
                    raise PolicyRefusal("nested_git_forbidden")
                relative = io.relative_path(rel + "/" + child if rel else child)
                if relative.casefold() in names_seen:
                    raise PolicyRefusal("case_conflicting_paths")
                names_seen.add(relative.casefold())
                target = path / child
                info = reader.path_metadata(target)
                if io.reparse(info) or info.st_dev != initial.st_dev:
                    raise PolicyRefusal("external_or_special_file_forbidden")
                if stat.S_ISDIR(info.st_mode):
                    walk(target, relative, depth + 1, info, directory, child)
                    continue
                if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                    raise PolicyRefusal("external_or_special_file_forbidden")
                if report["sampled_files"] >= io.MAX_FILES:
                    raise PolicyRefusal("file_limit")
                result = sample_file(target, reader, directory, child, info)
                category = result["classification"]
                counts = report["classifications"]
                counts[category] = counts.get(category, 0) + 1
                report["sampled_files"] += 1
                differences.update(result["different_fields"])
                report["ctime_creation_vs_change_patterns"] += int(
                    result["ctime_creation_vs_change_pattern"]
                )
                report["mode_execute_only_patterns"] += int(
                    result["mode_execute_only_pattern"]
                )
            if io.stamp(reader.directory_metadata(directory)) != io.stamp(before):
                raise PolicyRefusal("directory_metadata_changed")
        if io.stamp(reader.path_metadata(path)) != io.stamp(before):
            raise PolicyRefusal("directory_metadata_changed")

    walk(root, "", 0, initial)
    report["different_fields"] = sorted(differences)
    return report
