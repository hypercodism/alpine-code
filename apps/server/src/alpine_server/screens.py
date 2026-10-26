"""What the AI sees of the project's running app: the ``app_screen`` tool opens one screen through the map's relay,
asks the app for a picture of it and what it says (``screens/capture``, answered by ``screens/captured``), and gives
both to the model; ``map_check`` reads the map files as the map does; ``app_restart`` starts the app again fresh.
The app's server is Alpine's (``devServers``): the AI never needs to start one, install a browser or build its own
checks to see a screen."""

from __future__ import annotations

import asyncio
import base64
import json
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Literal
from urllib.parse import urlencode

from alpineagents import Image, ToolError, tool
from alpineagents.tool import collect_tools

from alpine_core.dev_servers import DevelopmentServerManager
from alpine_core.tool_sources import Offered
from alpine_protocol.dev_servers import ScreensCapturedParams, ScreensCapturedResult, ScreensCaptureParams

from . import map_files

#: The page size a screen is opened at, by the device its journey is on (as the map draws it).
SIZES = {"phone": (390, 844), "computer": (1280, 800)}

#: How long a screen may take: the app starting, the page loading and drawing.
CAPTURE_WAIT = 45.0
START_WAIT = 90.0


class ScreenCaptures:
    """The app's answers to ``screens/capture``, by request id."""

    def __init__(self, notify: Callable[[ScreensCaptureParams], None]) -> None:
        self._notify = notify
        self._waiting: dict[str, asyncio.Future[ScreensCapturedParams]] = {}

    async def capture(self, url: str, width: int, height: int) -> ScreensCapturedParams:
        request = ScreensCaptureParams(id=uuid.uuid4().hex, url=url, width=width, height=height)
        answer = self._waiting[request.id] = asyncio.get_running_loop().create_future()
        try:
            self._notify(request)
            return await asyncio.wait_for(answer, CAPTURE_WAIT)
        except TimeoutError as exc:
            raise ToolError(
                "Alpine's window did not answer: the screen can be seen only while the Alpine app is open."
            ) from exc
        finally:
            self._waiting.pop(request.id, None)

    async def captured(self, params: ScreensCapturedParams) -> ScreensCapturedResult:
        answer = self._waiting.get(params.id)
        if answer is not None and not answer.done():
            answer.set_result(params)
        return ScreensCapturedResult()


class AppScreens:
    """A tool source: what the AI sees of the project's app, for every session in a project folder."""

    def __init__(self, project: Path, servers: DevelopmentServerManager, captures: ScreenCaptures) -> None:
        self.project = project
        self.servers = servers
        self.captures = captures

    def offered(self) -> list[Offered]:
        tools = collect_tools([AppScreenTools(self.project, self.servers, self.captures)])
        return [Offered(t, "builtin", optional=False) for t in tools.values()]


class AppScreenTools:
    def __init__(self, project: Path, servers: DevelopmentServerManager, captures: ScreenCaptures) -> None:
        self.project = project
        self.servers = servers
        self.captures = captures

    async def _running(self) -> dict:
        """The project's app, running: the one it has, else started the way the project runs; waits for it."""
        opened = await self.servers.open(str(self.project))
        server = opened.get("server")
        if server is None:
            raise ToolError(
                "Nothing in this project says how to run it (a package.json dev script, or an index.html). "
                "Add a dev script; Alpine then starts it."
            )
        loop = asyncio.get_running_loop()
        deadline = loop.time() + START_WAIT
        while server["status"] == "starting" and loop.time() < deadline:
            await asyncio.sleep(1)
            server = next((s for s in await self.servers.list(str(self.project)) if s["id"] == server["id"]), server)
        if server["status"] != "running" or not (server.get("board_url") or server.get("url")):
            tail = ""
            if server.get("process_id"):
                logs = self.servers.logs(server["id"], 0, 262144)["text"][-2000:]
                tail = f" Its last output:\n{logs}" if logs.strip() else ""
            raise ToolError(f"The app is {server['status']}, not running (command: {server['command']}).{tail}")
        return server

    @tool(name="app_screen", read_only=True, open_world=False)
    async def app_screen(
        self,
        address: str = "/",
        situation: str | None = None,
        device: Literal["phone", "computer"] = "phone",
        save: str | None = None,
    ) -> list[str | Image] | str:
        """See one screen of this project's running app as the person sees it: a picture of the whole page and what
        it says (its data-alpine-screen mark, words, buttons to other screens, promises, and errors the page reported).
        Alpine starts the app if it is not running; never start a dev server, install a browser or Playwright, or
        write your own capture scripts to see a screen. Use it after changing a screen and before calling it done.

        Args:
            address: The screen's address in the app, its card's path ("/", "/posts/hello")
            situation: A situation id of the card, opened as ?alpine-state=<id>; leave out for the usual day
            device: "phone" (390 wide) or "computer" (1280 wide), as the screen's journey is drawn
            save: A project-relative .png path to keep the picture at (a card's preview, a check's screenshot);
                never under .alpine-code/
        """
        # Not named `path`: the permissions read a `path` as a file, and an app's "/rss" is not one.
        path = address
        if not path.startswith("/") or path.startswith("//"):
            raise ToolError("address is inside the app, starting with / (no host)")
        kept = self._keep_at(save) if save else None
        server = await self._running()
        base = (server.get("board_url") or server["url"]).rstrip("/")
        query = f"{'&' if '?' in path else '?'}{urlencode({'alpine-state': situation})}" if situation else ""
        width, height = SIZES[device]
        answer = await self.captures.capture(base + path + query, width, height)
        if answer.error:
            raise ToolError(f"The screen could not be opened: {answer.error}")
        read = answer.read
        said = {
            "address": path + query,
            "device": device,
            "screen": read.screen if read else None,
            "title": read.title if read else "",
            "buttons": [{"to": t.to, "label": t.label} for t in read.targets] if read else [],
            "promises": read.promises if read else [],
            "errors": read.errors if read else [],
            "text": read.text if read else "",
        }
        if read and read.screen is None:
            said["note"] = "The page has no data-alpine-screen mark: it may still be loading, blank, or not marked."
        if not answer.image:
            return json.dumps(said, ensure_ascii=False) + "\n(No picture could be taken.)"
        picture = base64.b64decode(answer.image)
        if kept is not None:
            kept.parent.mkdir(parents=True, exist_ok=True)
            kept.write_bytes(picture)
            said["saved"] = kept.relative_to(self.project.resolve()).as_posix()
        return [json.dumps(said, ensure_ascii=False), Image(picture)]

    def _keep_at(self, save: str) -> Path:
        root = self.project.resolve()
        target = (root / save).resolve()
        if not target.is_relative_to(root) or target.is_relative_to(root / ".alpine-code") or target.suffix != ".png":
            raise ToolError("save is a project-relative .png path outside .alpine-code/")
        return target

    @tool(name="map_check", read_only=True, open_world=False)
    def map_check(self) -> str:
        """Check the product map files (.alpine-code/map/) the way Alpine reads them: the schema of each card and
        flow and the checks across them (a check's conditionId must name a condition of its card, a flow's steps and
        edges must be its own cards). Use it instead of writing your own schema checks."""
        root = self.project.resolve()
        layout = map_files.read_layout(root)
        if not layout.exists:
            return "This project has no product map yet."
        lines = []
        for problem in layout.problems:
            how = "shown without these parts" if problem.partial else "not shown"
            lines.append(f"- {problem.file} ({how}): {problem.message}")
        if not lines:
            return (
                f"The map reads cleanly: {len(layout.features)} cards, {len(layout.flows)} flows, every check "
                "linked to its card's conditions."
            )
        return "Fix these, then check again:\n" + "\n".join(lines)

    @tool(name="app_restart", read_only=False, open_world=False)
    async def app_restart(self) -> str:
        """Start the project's app again, fresh (Vite's prepared modules are thrown away first): for screens that stay
        blank or load files that never come. Alpine's own server only; one started elsewhere is restarted there."""
        server = await self._running()
        if server["external"]:
            raise ToolError("This app was started outside Alpine; restart it where it was started")
        restarted = await self.servers.restart(server["id"])
        return f"Restarted: {restarted.get('server', {}).get('command', server['command'])}"
