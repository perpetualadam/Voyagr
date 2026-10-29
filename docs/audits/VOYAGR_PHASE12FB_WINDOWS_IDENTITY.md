# Windows evidence identity mismatch investigation

Status: **PRODUCTION_NO_GO**. Baseline failure: PR #365, `464c530db2f915545ffc11512bedf5ccf1e29395`. This investigation changes only offline evidence inventory and diagnostics. No private evidence, production/VPS filesystem or operator Windows instance was accessed.

## Established defect versus operator-specific cause

The observed diagnostic identifies `inventory()` in `voyagr/utils/review_package_io.py`: before the first source-byte read, it compared `stamp(os.fstat(fd))` against `stamp(target.lstat())`. `stamp()` included `st_dev`, `st_ino`, `st_mode`, size, integer nanosecond mtime/atime/ctime, link count, uid and gid. `file_changed_before_read` maps to EVIDENCE_CHANGED / INVENTORY / BEFORE_READ_IDENTITY_OR_METADATA_MISMATCH. That legacy category names the refusal, not a proven mutation.

Inspection of public **CPython v3.13.14** establishes a representation defect capable of causing this refusal with stable evidence:

- [`win32_xstat`, Modules/posixmodule.c:2202](https://github.com/python/cpython/blob/v3.13.14/Modules/posixmodule.c#L2202) copies birth/creation time to legacy `st_ctime`/`st_ctime_ns` for path `stat/lstat` compatibility.
- [`os_fstat_impl`, Modules/posixmodule.c:12000](https://github.com/python/cpython/blob/v3.13.14/Modules/posixmodule.c#L12000) returns `_Py_fstat_noraise` output without that copy. [`Python/fileutils.c:1228`](https://github.com/python/cpython/blob/v3.13.14/Python/fileutils.c#L1228) queries FileBasicInfo; [`_Py_attribute_data_to_stat`:1103](https://github.com/python/cpython/blob/v3.13.14/Python/fileutils.c#L1103) assigns its **ChangeTime** to `st_ctime`, separately from **CreationTime**. Creation and NTFS metadata-change time need not be equal even when a file is stable throughout inventory.
- [`update_st_mode_from_path`:1957](https://github.com/python/cpython/blob/v3.13.14/Modules/posixmodule.c#L1957) adds executable bits for certain filename extensions on the path side; descriptor mode construction derives from attributes instead. Renaming evidence to avoid this discrepancy is not a correction.

These are demonstrated cross-API semantic differences, not timestamp rounding. The examined conversion helpers use integer 100 ns FILETIME ticks and integer nanoseconds; do not convert through float seconds or introduce tolerances. Path lookup can use the by-name fast API or a handle fallback. In this CPython version, descriptor queries attempt FileIdInfo (128-bit ID and volume serial); fallback can use BY_HANDLE_FILE_INFORMATION's 64-bit file index/32-bit volume serial. Do **not** assume all Python 3.13 descriptor IDs are truncated, nor repair identity by masking high bits. `st_uid/gid` and synthesized mode bits are not NTFS ACL attestations. The old tuple did not compare full native attributes or separately protect both creation and change time.

The operator's actual differing field is **not yet established**. Its observed category alone cannot distinguish the ctime defect, executable-mode difference, unavailable identity API, genuine size/identity/timestamp change, pending access-time update, filesystem filter behavior or other API inconsistency. A reported healthy local NTFS volume and clean Git tree do not settle this.

## Correction: compare equivalent native records

Windows inventory now obtains both path-bound and already-open-handle snapshots through the **same** `GetFileInformationByHandleEx` classes: FileBasicInfo (0), FileStandardInfo (1), FileIdInfo (18), FileAttributeTagInfo (9), with fixed ABI byte sizes 40/24/24/8. No host-dependent `ctypes` C integer width is used to decode records. File type must be FILE_TYPE_DISK.

Exact comparisons retain full 128-bit file identity, 64-bit volume identity, creation/access/write/change timestamps as raw 100 ns ticks, end-of-file size, allocated size, link count, attributes, reparse tag and directory/delete flags. No field is dropped because it mismatched. This adds separate creation/change and attribute checks; directory handle identity is also checked on Windows now. A native snapshot is not a Python stat tuple and is never compared against one. POSIX `stamp()` and no-atime reads retain their existing exact checks.

Path snapshots use the existing protected CreateFileW path: GENERIC_READ | FILE_WRITE_ATTRIBUTES, FILE_SHARE_READ only, OPEN_EXISTING, OPEN_REPARSE_POINT, and BACKUP_SEMANTICS where applicable. The existing all-ones access FILETIME sentinel is set immediately after each open; creation/write pointers remain null. This suppresses this handle's automatic atime updates; it does not set a stored timestamp. Requesting FILE_WRITE_ATTRIBUTES is an access right, not a metadata-write instruction. No extra rights, ACL change, elevation, reduced-right retry, timestamp reset or ordinary-read fallback is introduced.

Missing native APIs fail closed as WINDOWS_METADATA_CAPABILITY / WINDOWS_METADATA_QUERY. Invalid/internally inconsistent records fail as WINDOWS_METADATA_INCONSISTENT / INVALID_OR_TORN_SNAPSHOT; reparse handles and delete-pending entries are refused. No fallback to a truncated ID or an approximate timestamp is allowed. Before/during/after-read identity/metadata checks still refuse genuine changes, including a one-tick (100 ns) access/change-time difference. Root/ancestor reparse, hard-link, local-filesystem, same-volume, inventory/output policy and evidence-integrity protections remain. Native attributes and change time improve detection but do not claim a full independent ACL/security-descriptor attestation.

## Bounded operator diagnostic

Run this **separate, explicit diagnostic**, from the updated repository root with the operator's existing non-elevated Python environment. Substitute the absolute private evidence directory; do not upload it or its contents:

```powershell
& .\.venv\Scripts\python.exe .\scripts\diagnose-review-evidence-identity.py `
  --evidence-directory 'C:\PrivateEvidence\Phase12FB'
$LASTEXITCODE
```

This enumerates metadata only: **zero source-byte reads**, no source hashing, no output directory, no package creation, no permission changes. It uses the same protected Windows handles and refuses unsupported platforms/capabilities. The existing limits apply: at most 512 files, 128 directories, depth 8 and 2,048 entries; unsafe paths, nested Git repositories, case conflicts, reparse points, hard links and cross-volume entries are refused. Do not run normal-open probes or relax ACLs to make it work. No retries are performed.

For each file, it samples native path metadata, Python lstat, native opened-handle metadata, Python fstat/lstat/fstat, native handle metadata, then Python lstat and native path metadata after closure. The directory enumeration handles remain no-atime protected. Standard Python metadata queries do not read source data; they reproduce the two representations being investigated. All native stamps are compared exactly; each Python API family is separately checked for sample stability. Only aggregate fixed categories, differing **field names**, two pattern counts and bounded sample counts are output. No file index/name/path, file ID, timestamp value, size, coordinates, raw exception or source content is published.

| Classification | Interpretation and action |
| --- | --- |
| STABLE_API_REPRESENTATION_DIFFERENCE_OBSERVED | Native records and each Python API family were stable during sampling, but Python path/descriptor fields differed. A ctime creation/change pattern specifically matches the demonstrated CPython issue; execute-only mode differences match the filename-derived mode issue. Supports a representation explanation, not proof of unchanged bytes for all time. |
| NATIVE_METADATA_OR_IDENTITY_CHANGE_OBSERVED | At least one exact native snapshot changed. Stop packaging and investigate source writers, replacement/rename, filters or delayed timestamp updates locally. This does not identify a writer or prove which contents changed. No retry-until-pass. |
| INCONSISTENT_SAMPLING_UNRESOLVED | Native samples matched but one Python API family varied. Treat as inconclusive; retain the refusal and investigate locally. Do not label it harmless. |
| NO_DIFFERENCE_OBSERVED | No discrepancy seen in this sampling interval; does not explain an earlier refusal or prove immutable content. |

`different_fields` is an aggregate union and does not correlate files. Mixed categories can coexist. `ctime_creation_vs_change_patterns` and `mode_execute_only_patterns` are observed signatures, not approval or root-cause verdicts. Every successful diagnostic exits **1** (diagnostic only), with `mutation_absence_proven:false`, `reviewed:false`, `navigation_authorized:false`, `production:PRODUCTION_NO_GO`. A refused/incomplete diagnostic exits **2**, prints PRIVATE_IDENTITY_DIAGNOSTIC_REFUSED plus a sanitised refusal object where available, and publishes no partial source listing. A refusal can establish only that the diagnostic could not safely complete.

After reviewing the diagnostic, reproduce ordinary packaging with a fresh, nonexistent output path. The default refusal line and existing `--diagnose-refusal` behavior remain unchanged:

```powershell
& .\.venv\Scripts\python.exe .\scripts\prepare-phase12fb-review-package.py `
  --evidence-directory 'C:\PrivateEvidence\Phase12FB' `
  --output-directory 'C:\PrivateReview\Phase12FB-identity-investigation-01' `
  --diagnose-refusal
$LASTEXITCODE
```

The evidence and output-parent directories must already satisfy existing policy. Never alter source metadata, rename evidence, remove fields, mask IDs, grant broader permissions or elevate to suppress a refusal. A created package remains unreviewed and is not evidence acceptance.

## Verification and limits

Deterministic regressions reproduce the old ctime/mode mismatch, exact 128-bit identity and 64-bit volume, every protected metadata field (including 100 ns differences), unavailable native APIs without fallback, reparse/delete/inconsistent records, unchanged open rights/no-atime sentinel, pre-read change refusal, and metadata-only diagnostic privacy. Existing packager/refusal tests retain their assertions.

A dedicated Windows Python 3.13 CI job runs the new suite and exercises real protected handles, inventory and diagnostics on newly created synthetic files, asserting native file/directory metadata remains unchanged. This is separate from Linux ABI/mocked API tests; their results are reported in the PR. Windows CI does not reproduce the operator's exact Windows 11 build, CPython 3.13.14 patch build, NTFS settings, token/ACL, security filters, capture files or concurrent writers. No private data is uploaded. The sampling procedure cannot prove that bytes never changed and were restored between observations; no new acceptance guarantee is inferred.

Final operational status: **PRODUCTION_NO_GO**.
