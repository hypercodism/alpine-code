import subprocess

import pytest

from alpine_core import current_branch, git_status
from alpine_core.git import _checks, clone_url, repo_name


def git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


@pytest.fixture
def origin(tmp_path):
    repo = tmp_path / "origin" / "demo"
    repo.mkdir(parents=True)
    git("init", "-q", "-b", "trunk", cwd=repo)
    (repo / "a.txt").write_text("hi")
    git("add", ".", cwd=repo)
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init", cwd=repo)
    return repo


def test_what_the_user_types_becomes_a_url():
    assert clone_url("owner/repo") == "https://github.com/owner/repo.git"
    assert clone_url("github.com/owner/repo") == "https://github.com/owner/repo"
    assert clone_url("git@github.com:owner/repo.git") == "git@github.com:owner/repo.git"
    assert repo_name("git@github.com:owner/repo.git") == "repo"
    assert repo_name("https://github.com/owner/repo/") == "repo"


def test_branch(tmp_path, origin):
    assert current_branch(origin) == "trunk"
    assert current_branch(tmp_path) is None


def test_status_counts_what_the_branch_adds_to_the_default_branch(tmp_path, origin):
    git("clone", "-q", str(origin), "work", cwd=tmp_path)
    work = tmp_path / "work"
    assert git_status(work).added == 0 and git_status(work).branch == "trunk"
    assert git_status(tmp_path) is None

    git("switch", "-qc", "feature", cwd=work)
    (work / "a.txt").write_text("hi\nthere\n")  # committed on the branch: 1 line changed, 1 added
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "more", cwd=work)
    (work / "new.txt").write_text("one\ntwo")  # untracked: 2 lines
    (work / "blob.bin").write_bytes(b"\0\1")  # binary: not counted
    status = git_status(work)
    assert (status.branch, status.added, status.deleted) == ("feature", 4, 1)


def test_ci_state_from_the_check_rollup():
    assert _checks([]) is None
    assert _checks([{"status": "COMPLETED", "conclusion": "SUCCESS"}]) == "passing"
    assert _checks([{"status": "IN_PROGRESS", "conclusion": ""}, {"state": "SUCCESS"}]) == "pending"
    assert _checks([{"status": "IN_PROGRESS"}, {"state": "FAILURE"}]) == "failing"


def test_diff_is_what_git_diff_head_shows_plus_new_files(tmp_path, origin):
    from alpine_core.git import diff

    assert diff(tmp_path) is None
    assert diff(origin).files == []
    (origin / "a.txt").write_text("hello\nthere\n")
    (origin / "new.txt").write_text("one\ntwo\n")
    (origin / "blob.bin").write_bytes(b"\0\1")
    git("add", "new.txt", cwd=origin)  # staged counts too
    (origin / "later.txt").write_text("x\n")
    found = {f.path: f for f in diff(origin).files}
    assert set(found) == {"a.txt", "new.txt", "blob.bin", "later.txt"}
    assert (found["a.txt"].status, found["a.txt"].added, found["a.txt"].deleted) == ("modified", 2, 1)
    assert found["a.txt"].patch.startswith("diff --git a/a.txt b/a.txt")
    assert "+there" in found["a.txt"].patch
    assert (found["new.txt"].status, found["new.txt"].added) == ("added", 2)
    assert (found["later.txt"].status, found["later.txt"].added) == ("untracked", 1)
    assert found["blob.bin"].binary and found["blob.bin"].patch == ""
