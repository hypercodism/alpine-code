"""Project development servers, backed by the shared process registry."""

from typing import Literal

from pydantic import Field

from .base import Message


class DevServerInfo(Message):
    id: str
    cwd: str
    command: str
    port: int
    url: str | None = None
    board_url: str | None = None
    """The same server through Alpine's relay, which adds the map's bridge script to every page (where each screen's
    buttons and promises are). The map opens its screens here; ``None`` until the relay listens."""
    process_id: str | None = None
    status: Literal["starting", "running", "stopping", "stopped", "failed"]
    external: bool = False


class DevServerConflict(Message):
    port: int
    pid: int | None = None
    cwd: str | None = None
    can_reuse: bool = False


class DevServersListParams(Message):
    cwd: str


class DevServersListResult(Message):
    servers: list[DevServerInfo]


class DevServersStartParams(Message):
    cwd: str
    command: str = Field(min_length=1, max_length=8192)
    port: int = Field(ge=1, le=65535)
    session_id: str | None = None
    reuse: bool = False


class DevServersStartResult(Message):
    server: DevServerInfo | None = None
    conflict: DevServerConflict | None = None


class DevServersOpenParams(Message):
    """The project's app, running: the server it has, else one Alpine starts the way the project runs."""

    cwd: str
    session_id: str | None = None


class DevServersOpenResult(Message):
    server: DevServerInfo | None = None
    """``None`` when nothing in the project says how it runs; the app then asks for the command."""


class DevServersStopParams(Message):
    id: str


class DevServersStopResult(Message):
    server: DevServerInfo


class DevServersRestartParams(Message):
    id: str


class DevServersRestartResult(DevServersStartResult):
    pass


class DevServersLogsParams(Message):
    id: str
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=65536, ge=1, le=262144)


class DevServersLogsResult(Message):
    text: str
    next_offset: int
    total: int


class ScreensCaptureParams(Message):
    """``screens/capture`` (a notification to the app): the AI asked to see one screen of the project's running app.
    The app opens ``url`` out of sight at ``width`` x ``height``, then answers with ``screens/captured`` and the same
    ``id``: a picture of it and what it says."""

    id: str
    url: str
    width: int = Field(ge=200, le=2560)
    height: int = Field(ge=200, le=4000)


class ScreenTarget(Message):
    to: str
    label: str = ""


class ScreenRead(Message):
    """What a screen says and shows, read from the page itself."""

    screen: str | None = None
    """Its ``data-alpine-screen`` mark; ``None`` when the page has none (still loading, or written without the marks)."""
    title: str = ""
    text: str = ""
    """The words on it, as a person reads them, cut to a few thousand characters."""
    targets: list[ScreenTarget] = Field(default_factory=list)
    """Its buttons to other screens (``data-alpine-to``)."""
    promises: list[str] = Field(default_factory=list)
    """The promises it marks (``data-alpine-promise``)."""
    errors: list[str] = Field(default_factory=list)
    """What the page reported going wrong: uncaught errors, rejected promises, ``console.error``."""
    href: str = ""


class ScreensCapturedParams(Message):
    id: str
    image: str | None = None
    """The screen as a PNG, base64; ``None`` when no picture could be taken."""
    read: ScreenRead | None = None
    error: str | None = None
    """Why the screen could not be opened."""


class ScreensCapturedResult(Message):
    pass


SCREEN_NOTIFICATIONS = {"screens/capture": ScreensCaptureParams}

DEV_SERVER_METHODS = {
    "screens/captured": (ScreensCapturedParams, ScreensCapturedResult),
    "devServers/list": (DevServersListParams, DevServersListResult),
    "devServers/start": (DevServersStartParams, DevServersStartResult),
    "devServers/open": (DevServersOpenParams, DevServersOpenResult),
    "devServers/stop": (DevServersStopParams, DevServersStopResult),
    "devServers/restart": (DevServersRestartParams, DevServersRestartResult),
    "devServers/logs": (DevServersLogsParams, DevServersLogsResult),
}
