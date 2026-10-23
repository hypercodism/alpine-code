"""Stack templates new projects start from (decisions 6, 13 and 22 in docs/alpine-cloud.md).

A template is a folder in the templates folder, named by its id (``web-lite``, ``blank``...). Its project gets
everything in it: the code, ``AGENTS.md`` for the agent, and ``.alpine-code/cloud.toml``, which says how Alpine Cloud
publishes it. Nothing in it depends on Alpine, so a project is an ordinary folder that runs without Alpine.

The templates folder is the one setting below (``templates_dir``): ``$ALPINE_TEMPLATES``, else the local
``~/Developments/alpine-templates`` while it exists, else a copy fetched from the public ``alpine-templates``
repository (``TEMPLATES_REPO``) into ``~/.alpine-code/templates/<commit>``. A normal install has neither local folder,
so the first new project fetches the copy (``ensure_templates``), and one a day later fetches it again.
"""

from __future__ import annotations

import itertools
import os
import re
import shutil
import subprocess
import tempfile
import time
from collections.abc import Iterable
from pathlib import Path

from .cloning import git_tools_ready
from .home import home_dir

#: Overrides where the templates are.
TEMPLATES_ENV = "ALPINE_TEMPLATES"

#: The public repository the templates are fetched from when no local folder has them. ``None`` fetches nothing.
TEMPLATES_REPO: str | None = "https://github.com/hypercodism/alpine-templates.git"

#: Seconds a fetched copy is used before the next new project fetches the repository again.
_FRESH_FOR = 24 * 60 * 60

#: The templates the app knows, in the order it shows them. Only those in the templates folder can be made.
KNOWN = ("blank", "web-lite", "web-pro", "mobile")

#: A project name when the model's suggestion has nothing usable in it.
FALLBACK_NAME = "new-app"

#: Left out of the copy, wherever they are in the template: git's own folder, what installing, building and running
#: write (the local database, the dev sign-in's cookie file, build caches), and a developer's local secrets. The
#: templates folder is a working copy that is run in place, so whatever a template's own ``.gitignore`` keeps out of git
#: belongs here too; a copied cookie file would carry a session of the template's local database into a project.
_NOT_COPIED = (".git", "node_modules", ".wrangler", "dist", ".dev.vars*", ".dev.jar", "*.tsbuildinfo", ".DS_Store")

#: Who the first commit is by. Only that commit: it is given to git for that one call and written nowhere.
_AUTHOR_NAME = "Alpine Code"
_AUTHOR_EMAIL = "noreply@alpinecode.app"

#: Seconds one git command gets.
_GIT_TIMEOUT = 120


class TemplateNotFound(Exception):
    """The templates folder has no template with that id."""


class TemplatesUnavailable(Exception):
    """There are no templates and none could be fetched. ``reason`` says why, for the app to say what to do:
    ``no_git_tools`` (git, which fetches them, cannot run), ``unreachable`` (the fetch failed: no network, GitHub
    down), ``not_found`` (no repository to fetch, it is not there, or it has no templates)."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


def templates_dir() -> Path:
    """``$ALPINE_TEMPLATES``, else ``~/Developments/alpine-templates`` while it exists, else the newest fetched copy
    (``~/.alpine-code/templates/<commit>``). With none of them, the local path above: nothing is there, and
    ``available_templates`` says so."""
    return _local_templates() or fetched_templates() or Path.home() / "Developments" / "alpine-templates"


def _local_templates() -> Path | None:
    """The folder a developer keeps the templates in, which is never fetched over: ``$ALPINE_TEMPLATES``, else
    ``~/Developments/alpine-templates`` while it exists."""
    if os.environ.get(TEMPLATES_ENV):
        return Path(os.environ[TEMPLATES_ENV]).expanduser()
    local = Path.home() / "Developments" / "alpine-templates"
    return local if local.is_dir() else None


def ensure_templates() -> list[str]:
    """The templates a new project can start from, fetched first when it is time: with no local folder, a missing
    copy or one older than a day is fetched again. When fetching fails the copy there is still serves.

    Raises:
        TemplatesUnavailable: There are none, and none could be fetched.
    """
    local = _local_templates()
    if local is not None:
        found = available_templates(local)
        if not found:
            raise TemplatesUnavailable("not_found", f"No templates in {local}")
        return found
    copy = fetched_templates()
    kept = available_templates(copy) if copy is not None else []
    if kept and time.time() - copy.stat().st_mtime < _FRESH_FOR:
        return kept
    try:
        folder = fetch_templates()
    except OSError as e:
        if kept:
            return kept
        # GitHub answers a repository that is not there as one that needs signing in.
        missing = any(words in str(e) for words in ("not found", "not appear to be a git", "could not read Username"))
        raise TemplatesUnavailable("not_found" if missing else "unreachable", str(e)) from e
    if folder is None:  # nothing to fetch from, or no git to fetch with
        if kept:
            return kept
        if TEMPLATES_REPO is None:
            raise TemplatesUnavailable("not_found", "There is no templates repository to fetch")
        raise TemplatesUnavailable("no_git_tools", "git is needed to fetch the templates")
    found = available_templates(folder)
    if not found:
        raise TemplatesUnavailable("not_found", "The templates repository has no templates")
    return found


def fetched_templates() -> Path | None:
    """The newest copy ``fetch_templates`` made, or ``None``. A fetch still under way is not one."""
    root = home_dir() / "templates"
    copies = [p for p in root.glob("*") if p.is_dir() and not p.name.startswith("fetch-")] if root.is_dir() else []
    return max(copies, key=lambda p: p.stat().st_mtime, default=None)


def fetch_templates(repo: str | None = None) -> Path | None:
    """Fetches the public templates repository into ``~/.alpine-code/templates/<commit>`` (the latest commit, no
    history) and returns the folder; the copy already there when it is the latest. ``None`` while there is no
    repository address (``TEMPLATES_REPO``) or git cannot run.

    Raises:
        OSError: git failed.
    """
    repo = repo or TEMPLATES_REPO
    if repo is None or not git_tools_ready():
        return None
    root = home_dir() / "templates"
    root.mkdir(parents=True, exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix="fetch-", dir=root))
    try:
        _git(scratch.parent, "clone", "-q", "--depth", "1", repo, str(scratch))
        commit = _git(scratch, "rev-parse", "HEAD").strip()
        shutil.rmtree(scratch / ".git", ignore_errors=True)
        folder = root / commit
        if folder.is_dir():
            os.utime(folder)  # fresh again: it is the latest
            return folder
        scratch.rename(folder)
        return folder
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def _git(cwd: Path, *args: str) -> str:
    # The repository is public: git must never stop to ask for a password, which nobody would see.
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "LC_ALL": "C"}
    try:
        done = subprocess.run(
            ["git", "-C", str(cwd), *args], capture_output=True, text=True, env=env, timeout=_GIT_TIMEOUT
        )
    except subprocess.TimeoutExpired as e:
        raise OSError(f"git {args[0]} took too long") from e
    if done.returncode != 0:
        lines = (done.stderr or done.stdout).strip().splitlines()
        # git's first ``fatal:`` line says what went wrong; the lines after it are advice.
        said = next((line for line in lines if line.startswith("fatal:")), lines[-1] if lines else done.returncode)
        raise OSError(f"git {args[0]} failed: {said}")
    return done.stdout


def available_templates(root: Path | None = None) -> list[str]:
    """The known templates the templates folder has, in ``KNOWN`` order."""
    root = root or templates_dir()
    return [template for template in KNOWN if (root / template).is_dir()]


def safe_name(name: str) -> str:
    """A folder name from a suggested one: lowercase ASCII letters, digits and single ``-``, at most 40 characters.
    ``FALLBACK_NAME`` when nothing is left."""
    cleaned = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return cleaned[:40].rstrip("-") or FALLBACK_NAME


def create_project(template: str, parent: Path, name: str, taken: Iterable[Path] = ()) -> Path:
    """Copies the template into a new folder in ``parent`` and makes it a git repository with the template as its
    first commit. Returns the folder.

    The folder is ``parent/<name>``, or ``<name>-2``, ``<name>-3``... when taken: the first that does not exist (the
    rule clones follow) and is not in ``taken``, the folders other creations are writing to. It is claimed with
    ``mkdir`` before anything is copied, so two creations that run at once, even in two processes, never get the same
    one. ``name`` goes through ``safe_name`` again, so it cannot name anything outside ``parent``.

    The copy leaves out ``.git``, ``node_modules``, ``.wrangler``, ``dist``, ``.dev.vars*``, ``.dev.jar``,
    ``*.tsbuildinfo`` and ``.DS_Store``. The commit is on branch ``main``, by ``Alpine Code <noreply@alpinecode.app>``
    and with no signing or hooks, whatever the user's git is set up to do; the user's git config is not touched, so the
    agent's later changes show as changes against the template. Where git cannot run (``git_tools_ready``) the folder
    is made without it.

    Raises:
        TemplateNotFound: The templates folder has no such template.
        OSError: The folder could not be written, or git failed. Nothing of the folder is left.
    """
    source = templates_dir() / template
    if template in ("", ".", "..") or Path(template).name != template or not source.is_dir():
        raise TemplateNotFound(template)
    folder = _claim(Path(parent), safe_name(name), taken)
    try:
        shutil.copytree(source, folder, symlinks=True, dirs_exist_ok=True, ignore=shutil.ignore_patterns(*_NOT_COPIED))
        if git_tools_ready():
            _commit_template(folder, template)
    except BaseException:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    return folder


class FolderNotEmpty(Exception):
    """A project is started only in an empty folder; one with files in it is a project to open."""


#: What a folder may hold and still count as empty: Finder's file, and git's own folder (an empty repository cloned
#: from GitHub, or made with ``git init``), which the template's first commit then goes into.
EMPTY_ANYWAY = frozenset({".DS_Store", ".git"})


def start_in(template: str, folder: Path) -> Path:
    """Copies the template into ``folder``, which the person made and which must be empty (``EMPTY_ANYWAY`` aside),
    and makes it a git repository with the template as its first commit, as ``create_project`` does. Returns the
    folder, resolved.

    Raises:
        TemplateNotFound: The templates folder has no such template.
        FolderNotEmpty: ``folder`` is missing, not a folder, or has files in it.
        OSError: The folder could not be written, or git failed. What was copied is taken out again.
    """
    source = templates_dir() / template
    if template in ("", ".", "..") or Path(template).name != template or not source.is_dir():
        raise TemplateNotFound(template)
    folder = Path(folder).expanduser().resolve()
    if not folder.is_dir() or any(entry.name not in EMPTY_ANYWAY for entry in folder.iterdir()):
        raise FolderNotEmpty(str(folder))
    try:
        shutil.copytree(source, folder, symlinks=True, dirs_exist_ok=True, ignore=shutil.ignore_patterns(*_NOT_COPIED))
        if git_tools_ready():
            _commit_template(folder, template)
    except BaseException:
        for entry in folder.iterdir():
            if entry.name not in EMPTY_ANYWAY:
                shutil.rmtree(entry) if entry.is_dir() and not entry.is_symlink() else entry.unlink()
        raise
    return folder


def _claim(parent: Path, name: str, taken: Iterable[Path]) -> Path:
    """Makes the first free folder of ``name``, ``name-2``... in ``parent`` and returns it."""
    parent = parent.expanduser().resolve()
    busy = {Path(p).expanduser().resolve() for p in taken}
    parent.mkdir(parents=True, exist_ok=True)
    for n in itertools.count(1):
        folder = parent / (name if n == 1 else f"{name}-{n}")
        if folder in busy:
            continue
        try:
            folder.mkdir()
        except FileExistsError:
            continue
        return folder
    raise AssertionError("unreachable")


def _commit_template(folder: Path, template: str) -> None:
    # An author in the user's environment would win over -c, and a language other than English would change what
    # git's last line says.
    env = {k: v for k, v in os.environ.items() if not k.startswith(("GIT_AUTHOR_", "GIT_COMMITTER_"))}
    env["LC_ALL"] = "C"
    # Given to the commit alone, so the repository's config stays empty. Not signed, because the user's key is not
    # Alpine's to use (and signing may ask for a passphrase); no hooks, because the user's are for their own commits.
    author = ("-c", f"user.name={_AUTHOR_NAME}", "-c", f"user.email={_AUTHOR_EMAIL}", "-c", "commit.gpgsign=false")
    # ``symbolic-ref`` rather than ``init -b``: older git has no -b, and init.defaultBranch is the user's to set.
    steps = (
        ("init", "-q"),
        ("symbolic-ref", "HEAD", "refs/heads/main"),
        ("add", "-A"),
        ("commit", "-q", "--allow-empty", "--no-verify", "-m", f"Start from the {template} template"),
    )
    for verb, *args in steps:
        command = ["git", "-C", str(folder), *(author if verb == "commit" else ()), verb, *args]
        try:
            done = subprocess.run(command, capture_output=True, text=True, env=env, timeout=_GIT_TIMEOUT)
        except subprocess.TimeoutExpired as e:
            raise OSError(f"git {verb} took too long") from e
        if done.returncode != 0:
            lines = (done.stderr or done.stdout).strip().splitlines()
            raise OSError(f"git {verb} failed: {lines[-1] if lines else done.returncode}")
