"""The little git the app needs outside a session: what the branch changes, its pull request, and what a clone
address means (the clone itself is in ``cloning.py``)."""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

#: ``owner/repo`` means GitHub, as ``gh`` reads it.
_SHORTHAND = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")


def current_branch(folder: Path) -> str | None:
    """The checked-out branch, or ``None`` outside a repository or on a detached HEAD."""
    try:
        result = subprocess.run(
            ["git", "-C", str(folder), "symbolic-ref", "--quiet", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() or None


@dataclass(frozen=True)
class PullRequest:
    number: int
    url: str
    checks: Literal["passing", "failing", "pending"] | None
    """CI on its last commit; ``None`` when it has no checks."""


@dataclass(frozen=True)
class GitStatus:
    branch: str | None
    """``None`` on a detached HEAD."""
    added: int
    deleted: int
    """Lines this branch changes that the default branch does not have yet, uncommitted work and new files included.
    On the default branch itself that is what is not pushed or not committed."""


#: Untracked files bigger than this are not counted (and are not read).
_MAX_COUNTED = 1_000_000


def status(folder: Path) -> GitStatus | None:
    """The branch and its changes, or ``None`` outside a repository."""
    if _git(folder, "rev-parse", "--is-inside-work-tree") != "true":
        return None
    base = _base(folder)
    added = deleted = 0
    for line in (_git(folder, "diff", "--numstat", base) or "").splitlines():
        plus, minus, _ = line.split("\t", 2)
        if plus != "-":  # binary files show "-"
            added, deleted = added + int(plus), deleted + int(minus)
    for name in (_git(folder, "ls-files", "--others", "--exclude-standard", "-z") or "").split("\0"):
        path = folder / name
        if name and path.is_file() and path.stat().st_size <= _MAX_COUNTED:
            data = path.read_bytes()
            if b"\0" not in data:
                added += data.count(b"\n") + (0 if data.endswith(b"\n") or not data else 1)
    return GitStatus(current_branch(folder), added, deleted)


def _base(folder: Path) -> str:
    """Where the branch left the default branch (``origin/HEAD``, else ``main`` or ``master``); ``HEAD`` if none."""
    default = _git(folder, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD")
    for ref in (default, "main", "master"):
        if ref and (base := _git(folder, "merge-base", "HEAD", ref)):
            return base
    return "HEAD" if _git(folder, "rev-parse", "--verify", "--quiet", "HEAD") else _EMPTY_TREE


#: What an unborn branch (no commit yet) is compared with.
_EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"


@dataclass(frozen=True)
class FileDiff:
    path: str
    status: Literal["modified", "added", "deleted", "renamed", "untracked"]
    added: int
    deleted: int
    patch: str
    """The file's part of ``git diff``, from its ``diff --git`` line; empty for a binary file or one cut off."""
    binary: bool = False


@dataclass(frozen=True)
class Diff:
    files: list[FileDiff]
    truncated: bool
    """Some patches were left out because the whole diff was over ``_MAX_PATCH``."""


#: How much patch text one diff carries; the files past it keep their counts and lose their patch.
_MAX_PATCH = 2_000_000


def diff(folder: Path) -> Diff | None:
    """What a developer's ``git diff HEAD`` shows (uncommitted work, staged or not), plus new files git does not track
    yet, or ``None`` outside a repository."""
    if _git(folder, "rev-parse", "--is-inside-work-tree") != "true":
        return None
    base = "HEAD" if _git(folder, "rev-parse", "--verify", "--quiet", "HEAD") else _EMPTY_TREE
    statuses = {"M": "modified", "A": "added", "D": "deleted", "R": "renamed"}
    names: list[tuple[str, str]] = []
    fields = (_raw(folder, "diff", "--name-status", "-z", "-M", base) or "").split("\0")
    while len(fields) > 1:
        code = fields.pop(0)
        if code.startswith("R") or code.startswith("C"):
            fields.pop(0)  # the old name
        names.append((fields.pop(0), statuses.get(code[:1], "modified")))
    untracked = _raw(folder, "ls-files", "--others", "--exclude-standard", "-z") or ""
    names += [(name, "untracked") for name in untracked.split("\0") if name]
    files: list[FileDiff] = []
    used = 0
    for name, state in names:
        if state == "untracked":
            # git diff --no-index exits 1 when the files differ, so its output is read whatever the code.
            patch = _raw(folder, "diff", "--no-index", "--", "/dev/null", name, ok=(0, 1)) or ""
        else:
            patch = _raw(folder, "diff", "-M", base, "--", name) or ""
        binary = "\nBinary files " in patch or patch.startswith("Binary files ")
        lines = patch.splitlines()
        body = [line for line in lines if not line.startswith(("+++", "---"))]
        added = sum(1 for line in body if line.startswith("+"))
        deleted = sum(1 for line in body if line.startswith("-"))
        keep = not binary and used + len(patch) <= _MAX_PATCH
        used += len(patch) if keep else 0
        files.append(FileDiff(name, state, added, deleted, patch if keep else "", binary))  # type: ignore[arg-type]
    return Diff(files, any(not f.patch and not f.binary and (f.added or f.deleted) for f in files))


def pull_request(folder: Path) -> PullRequest | None:
    """The open pull request of the checked-out branch, through ``gh``. ``None`` without one, or without ``gh``."""
    try:
        result = subprocess.run(
            ["gh", "pr", "view", "--json", "number,url,state,statusCheckRollup"],
            cwd=folder,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    data = json.loads(result.stdout)
    if data.get("state") != "OPEN":
        return None
    return PullRequest(data["number"], data["url"], _checks(data.get("statusCheckRollup") or []))


def _checks(rollup: list[dict[str, str]]) -> Literal["passing", "failing", "pending"] | None:
    # Check runs carry status + conclusion; commit statuses carry a state.
    failed = {"FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"}
    if not rollup:
        return None
    if any(c.get("conclusion") in failed or c.get("state") in failed for c in rollup):
        return "failing"
    if any(c.get("status", "COMPLETED") != "COMPLETED" or c.get("state") in {"PENDING", "EXPECTED"} for c in rollup):
        return "pending"
    return "passing"


def _raw(folder: Path, *args: str, ok: tuple[int, ...] = (0,)) -> str | None:
    """git's output as it is (not stripped, so patches and NUL lists stay whole), or ``None`` when it fails."""
    try:
        result = subprocess.run(
            ["git", "-C", str(folder), "-c", "core.quotepath=off", *args],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout if result.returncode in ok else None


def _git(folder: Path, *args: str) -> str | None:
    """git's output, stripped, or ``None`` when it fails."""
    try:
        result = subprocess.run(["git", "-C", str(folder), *args], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def clone_url(address: str) -> str:
    """What git clones for what the user typed: ``owner/repo`` and ``github.com/owner/repo`` become GitHub URLs."""
    address = address.strip()
    if _SHORTHAND.fullmatch(address):
        return f"https://github.com/{address}.git"
    if address.startswith("github.com/"):
        return f"https://{address}"
    return address


def repo_name(address: str) -> str:
    name = address.strip().rstrip("/").rsplit("/", 1)[-1].rsplit(":", 1)[-1]
    return name.removesuffix(".git") or "repository"
