"""Fixed refusal vocabulary. Never serialize exception text, paths or filenames."""

from contextlib import contextmanager
import errno

# Internal codes are literals at refusal sites, never values from evidence.
CODES = {
    "windows_identity_diagnostic_required": (
        "WINDOWS_METADATA_CAPABILITY",
        "WINDOWS_REQUIRED",
    ),
    "windows_metadata_unavailable": ("WINDOWS_METADATA_CAPABILITY", "OPERATION_FAILED"),
    "windows_metadata_invalid": (
        "WINDOWS_METADATA_INCONSISTENT",
        "INVALID_OR_TORN_SNAPSHOT",
    ),
    "windows_delete_pending": ("EVIDENCE_CHANGED", "DELETE_PENDING"),
    "storage_type_unavailable": ("STORAGE_POLICY", "STORAGE_TYPE_UNAVAILABLE"),
    "local_drive_required": ("STORAGE_POLICY", "LOCAL_DRIVE_REQUIRED"),
    "local_filesystem_required": ("STORAGE_POLICY", "LOCAL_FILESYSTEM_REQUIRED"),
    "unsupported_no_atime_platform": ("NO_ATIME_CAPABILITY", "UNSUPPORTED_PLATFORM"),
    "no_atime_not_supported": ("NO_ATIME_CAPABILITY", "UNSUPPORTED_PLATFORM"),
    "unsafe_relative_reference": ("UNSAFE_FILESYSTEM_ENTRY", "UNSAFE_RELATIVE_NAME"),
    "nonportable_reference": ("UNSAFE_FILESYSTEM_ENTRY", "NONPORTABLE_NAME"),
    "local_path_required": ("PATH_POLICY", "LOCAL_PATH_REQUIRED"),
    "absolute_path_without_traversal_required": (
        "PATH_POLICY",
        "ABSOLUTE_NO_TRAVERSAL_REQUIRED",
    ),
    "reparse_path_forbidden": ("UNSAFE_FILESYSTEM_ENTRY", "REPARSE_ANCESTOR"),
    "git_destination_forbidden": ("REPOSITORY_POLICY", "GIT_LOCATION_FORBIDDEN"),
    "windows_read_handle_unavailable": ("WINDOWS_SOURCE_OPEN", "OPERATION_FAILED"),
    "windows_no_atime_unavailable": ("WINDOWS_NO_ATIME_CAPABILITY", "OPERATION_FAILED"),
    "windows_directory_read_unavailable": (
        "WINDOWS_DIRECTORY_ENUMERATION",
        "OPERATION_FAILED",
    ),
    "invalid_windows_directory_record": ("WINDOWS_DIRECTORY_FORMAT", "INVALID_RECORD"),
    "invalid_windows_directory_name": ("WINDOWS_DIRECTORY_FORMAT", "INVALID_RECORD"),
    "invalid_windows_directory_offset": ("WINDOWS_DIRECTORY_FORMAT", "INVALID_RECORD"),
    "evidence_directory_required": ("INPUT_UNAVAILABLE", "DIRECTORY_REQUIRED"),
    "traversal_limit": ("INVENTORY_LIMIT", "DIRECTORY_OR_DEPTH_LIMIT"),
    "entry_limit": ("INVENTORY_LIMIT", "ENTRY_LIMIT"),
    "file_limit": ("INVENTORY_LIMIT", "FILE_LIMIT"),
    "external_directory_forbidden": ("UNSAFE_FILESYSTEM_ENTRY", "EXTERNAL_DIRECTORY"),
    "nested_git_forbidden": ("REPOSITORY_POLICY", "NESTED_GIT"),
    "case_conflicting_paths": ("UNSAFE_FILESYSTEM_ENTRY", "CASE_CONFLICTING_PATHS"),
    "symlink_or_reparse_forbidden": ("UNSAFE_FILESYSTEM_ENTRY", "SYMLINK_OR_REPARSE"),
    "external_or_special_file_forbidden": (
        "UNSAFE_FILESYSTEM_ENTRY",
        "EXTERNAL_LINK_OR_SPECIAL_FILE",
    ),
    "directory_changed": (
        "EVIDENCE_CHANGED",
        "DIRECTORY_IDENTITY_OR_METADATA_MISMATCH",
    ),
    "file_changed_before_read": (
        "EVIDENCE_CHANGED",
        "BEFORE_READ_IDENTITY_OR_METADATA_MISMATCH",
    ),
    "file_changed_during_read": (
        "EVIDENCE_CHANGED",
        "DURING_READ_IDENTITY_OR_METADATA_MISMATCH",
    ),
    "file_changed_after_read": (
        "EVIDENCE_CHANGED",
        "AFTER_READ_IDENTITY_OR_METADATA_MISMATCH",
    ),
    "directory_metadata_changed": (
        "EVIDENCE_CHANGED",
        "DIRECTORY_IDENTITY_OR_METADATA_MISMATCH",
    ),
    "existing_output_forbidden": ("OUTPUT_POLICY", "OUTPUT_EXISTS"),
    "input_output_overlap": ("OUTPUT_POLICY", "INPUT_OUTPUT_OVERLAP"),
    "output_parent_required": ("OUTPUT_POLICY", "OUTPUT_PARENT_REQUIRED"),
    "unexpected_output": ("OUTPUT_POLICY", "UNEXPECTED_OUTPUT_NAME"),
    "package_output_limit": ("OUTPUT_LIMIT", "PACKAGE_BYTES_LIMIT"),
    "verification_limit": ("VERIFICATION_LIMIT", "CHECK_COUNT_LIMIT"),
    "json_structure_limit": ("VERIFICATION_LIMIT", "REFERENCE_SCAN_LIMIT"),
}
OPERATIONS = frozenset(
    (
        "UNKNOWN",
        "IMPORT",
        "OUTPUT_POLICY",
        "INPUT_PATH_POLICY",
        "INVENTORY",
        "VERIFY",
        "OUTPUT_WRITE",
        "WINDOWS_BACKEND_SETUP",
        "WINDOWS_METADATA_QUERY",
        "WINDOWS_OPEN_DIRECTORY",
        "WINDOWS_OPEN_FILE",
        "WINDOWS_FREEZE_ATIME",
        "WINDOWS_ENUMERATE_DIRECTORY",
        "WINDOWS_WRAP_READ_HANDLE",
        "POSIX_NO_ATIME_OPEN",
        "SOURCE_READ",
        "STORAGE_CHECK",
    )
)
OS_REASONS = frozenset(
    (
        "ACCESS_DENIED",
        "SHARING_OR_LOCK_CONFLICT",
        "NOT_FOUND",
        "UNSUPPORTED_OPERATION",
        "INVALID_PARAMETER",
        "STORAGE_FULL",
        "RESOURCE_UNAVAILABLE",
        "IO_FAILURE",
        "OPERATION_FAILED",
    )
)


class PolicyRefusal(ValueError):
    def __init__(self, code):
        super().__init__("private_review_package_refusal")
        self.refusal_code = code if isinstance(code, str) and code in CODES else None


class CapabilityRefusal(OSError):
    def __init__(self, code, *, operation="UNKNOWN", winerror=None):
        super().__init__("private_review_package_refusal")
        self.refusal_code = code if isinstance(code, str) and code in CODES else None
        self.refusal_operation = operation if operation in OPERATIONS else "UNKNOWN"
        self.refusal_reason = (
            windows_reason(winerror) if type(winerror) is int else None
        )


def windows_reason(code):
    return {
        5: "ACCESS_DENIED",
        1314: "ACCESS_DENIED",
        32: "SHARING_OR_LOCK_CONFLICT",
        33: "SHARING_OR_LOCK_CONFLICT",
        2: "NOT_FOUND",
        3: "NOT_FOUND",
        50: "UNSUPPORTED_OPERATION",
        1: "UNSUPPORTED_OPERATION",
        87: "INVALID_PARAMETER",
        112: "STORAGE_FULL",
        8: "RESOURCE_UNAVAILABLE",
        14: "RESOURCE_UNAVAILABLE",
    }.get(code, "OPERATION_FAILED")


@contextmanager
def operation(name):
    """Annotate the existing failure; no retry/probe or exception type change."""
    if name not in OPERATIONS:
        raise ValueError("invalid_internal_operation")
    try:
        yield
    except Exception as error:
        previous = getattr(error, "refusal_operation", None)
        if (
            not isinstance(previous, str)
            or previous not in OPERATIONS
            or previous == "UNKNOWN"
        ):
            error.refusal_operation = name
        raise


def refusal_details(error):
    op = getattr(error, "refusal_operation", "UNKNOWN")
    if not isinstance(op, str) or op not in OPERATIONS:
        op = "UNKNOWN"
    code = (
        getattr(error, "refusal_code", None)
        if isinstance(error, (PolicyRefusal, CapabilityRefusal))
        else None
    )
    if not isinstance(code, str):
        code = None
    category, reason = CODES.get(code, ("INTERNAL_ERROR", "UNCLASSIFIED_FAILURE"))
    if isinstance(error, CapabilityRefusal):
        os_reason = getattr(error, "refusal_reason", None)
        if isinstance(os_reason, str) and os_reason in OS_REASONS:
            reason = os_reason
        if code in (
            "windows_read_handle_unavailable",
            "windows_directory_read_unavailable",
        ):
            if reason == "ACCESS_DENIED":
                category = "SOURCE_ACCESS_DENIED"
            elif reason == "SHARING_OR_LOCK_CONFLICT":
                category = "SOURCE_BUSY"
    elif isinstance(error, ImportError):
        category, reason = "RUNTIME_UNAVAILABLE", "IMPORT_OR_DEPENDENCY_FAILED"
    elif isinstance(error, OSError):
        win = getattr(error, "winerror", None)
        os_reason = (
            windows_reason(win)
            if isinstance(win, int)
            else {
                errno.EACCES: "ACCESS_DENIED",
                errno.EPERM: "ACCESS_DENIED",
                errno.ENOENT: "NOT_FOUND",
                errno.ENOSPC: "STORAGE_FULL",
                errno.ENOTSUP: "UNSUPPORTED_OPERATION",
                errno.EINVAL: "INVALID_PARAMETER",
                errno.EIO: "IO_FAILURE",
                errno.EMFILE: "RESOURCE_UNAVAILABLE",
                errno.ELOOP: "UNSUPPORTED_OPERATION",
            }.get(error.errno if type(error.errno) is int else None, "OPERATION_FAILED")
        )
        reason = os_reason
        output = op in ("OUTPUT_POLICY", "OUTPUT_WRITE")
        if op == "WINDOWS_BACKEND_SETUP":
            category = "WINDOWS_BACKEND_UNAVAILABLE"
        elif op == "STORAGE_CHECK":
            category = "STORAGE_POLICY"
        elif isinstance(error, FileExistsError):
            category, reason = "OUTPUT_POLICY", "OUTPUT_EXISTS_OR_RACE"
        elif os_reason == "ACCESS_DENIED":
            category = "OUTPUT_ACCESS_DENIED" if output else "SOURCE_ACCESS_DENIED"
        elif os_reason == "SHARING_OR_LOCK_CONFLICT":
            category = "SOURCE_BUSY" if not output else "OUTPUT_IO"
        else:
            category = "OUTPUT_IO" if output else "SOURCE_IO"
    elif isinstance(error, UnicodeError) and op == "WINDOWS_ENUMERATE_DIRECTORY":
        category, reason = "WINDOWS_DIRECTORY_FORMAT", "INVALID_ENCODING"
    return {
        "diagnostic_schema_version": 1,
        "outcome": "REFUSED",
        "category": category,
        "operation": op,
        "reason": reason,
        "reviewed": False,
        "navigation_authorized": False,
        "production": "PRODUCTION_NO_GO",
    }
