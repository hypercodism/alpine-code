import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[3] / "packages" / "core" / "tests"))  # fake_cloud.py


@pytest.fixture(autouse=True)
def cloud_off(monkeypatch):
    """Alpine Cloud is off, so no test reaches the real Alpine API; a test that wants it on points
    ``ALPINE_CLOUD_URL`` somewhere (``cloud``)."""
    monkeypatch.setenv("ALPINE_CLOUD_URL", "")


@pytest.fixture
def cloud(monkeypatch):
    """A fake Alpine API on the loopback, which ``ALPINE_CLOUD_URL`` points at."""
    from fake_cloud import FakeCloud

    from alpine_core.cloud import account

    with FakeCloud() as fake:
        monkeypatch.setenv("ALPINE_CLOUD_URL", fake.url)
        account.reset()
        yield fake
    account.reset()
