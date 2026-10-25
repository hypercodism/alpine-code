"""Where the templates come from: the environment, the local folder, a fetched copy; nothing fetched without a repo."""

import os
import subprocess
import time

import pytest

from alpine_core import templates


def test_the_environment_wins_then_the_local_folder_then_a_fetched_copy(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    fetched = tmp_path / "alpine-home" / "templates" / "abc123"
    fetched.mkdir(parents=True)
    assert templates.templates_dir() == fetched  # nothing local: the fetched copy

    local = tmp_path / "home" / "Developments" / "alpine-templates"
    local.mkdir(parents=True)
    assert templates.templates_dir() == local  # the local folder while it exists

    monkeypatch.setenv("ALPINE_TEMPLATES", str(tmp_path / "mine"))
    assert templates.templates_dir() == tmp_path / "mine"


def test_with_nothing_anywhere_the_local_path_is_returned_and_has_no_templates(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    assert templates.templates_dir() == tmp_path / "home" / "Developments" / "alpine-templates"
    assert templates.available_templates() == []


def test_nothing_is_fetched_without_a_repository(monkeypatch):
    monkeypatch.setattr(templates, "TEMPLATES_REPO", None)
    assert templates.fetch_templates() is None


def test_the_public_repository_is_where_templates_come_from():
    assert templates.TEMPLATES_REPO == "https://github.com/hypercodism/alpine-templates.git"


def test_a_fetched_copy_is_kept_by_commit_without_history(tmp_path, monkeypatch):
    repo = tmp_path / "public"
    (repo / "web-lite").mkdir(parents=True)
    (repo / "web-lite" / "package.json").write_text("{}\n")
    for args in (
        ("init", "-q"),
        ("add", "-A"),
        ("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "x"),
    ):
        subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)
    commit = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"], check=True, capture_output=True, text=True
    ).stdout.strip()

    folder = templates.fetch_templates(f"file://{repo}")
    assert folder.name == commit and (folder / "web-lite" / "package.json").is_file() and not (folder / ".git").exists()
    assert templates.fetch_templates(f"file://{repo}") == folder  # the latest is already there
    assert [p.name for p in folder.parent.iterdir()] == [commit]
    monkeypatch.setenv("HOME", str(tmp_path / "nohome"))
    assert templates.templates_dir() == folder


def _public(tmp_path, *names):
    repo = tmp_path / "public"
    for name in names:
        (repo / name).mkdir(parents=True, exist_ok=True)
        (repo / name / "AGENTS.md").write_text(f"# {name}\n")
    for args in (
        ("init", "-q"),
        ("add", "-A"),
        ("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "x"),
    ):
        subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)
    return f"file://{repo}"


def test_a_local_folder_is_used_as_it_is_and_never_fetched_over(tmp_path, monkeypatch):
    monkeypatch.setenv("ALPINE_TEMPLATES", str(tmp_path / "mine"))
    (tmp_path / "mine" / "blank").mkdir(parents=True)
    monkeypatch.setattr(templates, "fetch_templates", lambda: pytest.fail("fetched"))
    assert templates.ensure_templates() == ["blank"]
    monkeypatch.setenv("ALPINE_TEMPLATES", str(tmp_path / "empty"))
    with pytest.raises(templates.TemplatesUnavailable) as e:
        templates.ensure_templates()
    assert e.value.reason == "not_found"


def test_the_first_new_project_fetches_and_a_fresh_copy_is_not_fetched_again(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setattr(templates, "TEMPLATES_REPO", _public(tmp_path, "blank", "web-lite"))
    assert templates.ensure_templates() == ["blank", "web-lite"]
    monkeypatch.setattr(templates, "TEMPLATES_REPO", "http://127.0.0.1:9/nothing.git")
    assert templates.ensure_templates() == ["blank", "web-lite"]  # fresh: the copy, no network


def _day_old(copy):
    day_ago = time.time() - 25 * 60 * 60
    os.utime(copy, (day_ago, day_ago))


def _refreshed():
    templates._refresh.join(timeout=30)


def test_a_day_old_copy_serves_at_once_and_a_newer_one_is_fetched_behind_it(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setattr(templates, "_refresh_started", 0.0)
    monkeypatch.setattr(templates, "TEMPLATES_REPO", _public(tmp_path, "blank"))
    templates.ensure_templates()
    old = templates.fetched_templates()
    _day_old(old)
    _public(tmp_path, "web-lite")  # the repository moved on
    assert templates.ensure_templates() == ["blank"]  # nobody waits for the network
    _refreshed()
    assert templates.ensure_templates() == ["blank", "web-lite"]
    # The copy that served until now stays (a new project may be copying from it); the next fetch removes it.
    assert old.exists() and templates.fetched_templates() != old
    _day_old(templates.fetched_templates())
    _public(tmp_path, "web-pro")
    monkeypatch.setattr(templates, "_refresh_started", 0.0)
    templates.ensure_templates()
    _refreshed()
    assert not old.exists()
    assert len(list((templates.home_dir() / "templates").iterdir())) == 2


def test_a_project_made_from_the_copy_that_is_being_replaced_is_made(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setattr(templates, "TEMPLATES_REPO", _public(tmp_path, "blank"))
    templates.ensure_templates()
    source = templates.templates_dir()
    _public(tmp_path, "web-lite")
    # The newer copy lands while a creation has already picked the older one.
    monkeypatch.setattr(templates, "templates_dir", lambda: source)
    templates.fetch_templates()
    folder = templates.create_project("blank", tmp_path / "projects", "app")
    assert (folder / "AGENTS.md").read_text() == "# blank\n"


def test_a_failed_fetch_behind_a_copy_keeps_it_and_waits_before_trying_again(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setattr(templates, "_refresh_started", 0.0)
    monkeypatch.setattr(templates, "TEMPLATES_REPO", _public(tmp_path, "blank"))
    templates.ensure_templates()
    _day_old(templates.fetched_templates())
    monkeypatch.setattr(templates, "TEMPLATES_REPO", "http://127.0.0.1:9/nothing.git")
    assert templates.ensure_templates() == ["blank"]  # offline: the old copy still serves
    _refreshed()
    assert templates.ensure_templates() == ["blank"]
    tried = []
    monkeypatch.setattr(templates, "fetch_templates", lambda: tried.append(1))
    assert templates.ensure_templates() == ["blank"]
    assert tried == []  # not again within the hour


def test_with_nothing_to_use_the_reason_says_what_to_do(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setattr(templates, "TEMPLATES_REPO", "http://127.0.0.1:9/alpine-templates.git")
    with pytest.raises(templates.TemplatesUnavailable) as e:
        templates.ensure_templates()
    assert e.value.reason == "unreachable"
    monkeypatch.setattr(templates, "TEMPLATES_REPO", f"file://{tmp_path / 'gone'}")
    with pytest.raises(templates.TemplatesUnavailable) as e:
        templates.ensure_templates()
    assert e.value.reason == "not_found"
    monkeypatch.setattr(templates, "git_tools_ready", lambda: False)
    with pytest.raises(templates.TemplatesUnavailable) as e:
        templates.ensure_templates()
    assert e.value.reason == "no_git_tools"


def test_a_fetch_under_way_is_not_a_copy(tmp_path):
    (tmp_path / "alpine-home" / "templates" / "fetch-abc").mkdir(parents=True)
    assert templates.fetched_templates() is None
