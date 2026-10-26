"""What the AI sees of the project's app: a screen opened through Alpine's own server and photographed by the app."""

import asyncio
import base64
import json
import shlex
import socket
import sys
from pathlib import Path

import pytest
from alpineagents import Image, ToolError

from alpine_core.dev_servers import DevelopmentServerManager
from alpine_core.processes import process_manager
from alpine_protocol.dev_servers import ScreenRead, ScreensCapturedParams, ScreenTarget
from alpine_server.screens import AppScreenTools, ScreenCaptures

PNG = base64.b64encode(
    bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
    )
).decode()


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_a_screen_is_opened_through_alpines_server_and_seen_with_what_it_says(tmp_path: Path, monkeypatch):
    async def check():
        port = free_port()
        (tmp_path / "index.html").write_text("<main data-alpine-screen='home'>hi</main>")
        monkeypatch.setattr(
            "alpine_core.dev_servers.how_to_run",
            lambda project: (f"{shlex.quote(sys.executable)} -u -m http.server {port} --bind 127.0.0.1", port),
        )
        asked = []

        def notify(request):
            asked.append(request)
            read = ScreenRead(
                screen="home",
                title="Home",
                text="hi",
                targets=[ScreenTarget(to="post", label="읽기")],
                errors=["TypeError: x is undefined"],
                href=request.url,
            )
            asyncio.get_running_loop().call_soon(
                lambda: asyncio.ensure_future(
                    captures.captured(ScreensCapturedParams(id=request.id, image=PNG, read=read))
                )
            )

        captures = ScreenCaptures(notify)
        tools = AppScreenTools(tmp_path, DevelopmentServerManager(), captures)
        try:
            seen = await tools.app_screen.invoke({"path": "/posts/1", "situation": "empty"}, None)
            text, picture = seen
            said = json.loads(text)
            assert said["screen"] == "home" and said["buttons"] == [{"to": "post", "label": "읽기"}]
            assert said["errors"] == ["TypeError: x is undefined"]
            assert isinstance(picture, Image)
            [request] = asked
            # Through the map's relay, at a phone's width, with the situation as the map opens it.
            assert request.url.startswith("http://127.0.0.1:") and request.url.endswith("/posts/1?alpine-state=empty")
            assert (request.width, request.height) == (390, 844)
            with pytest.raises(ToolError, match="starting with /"):
                await tools.app_screen.invoke({"path": "https://evil.example/"}, None)
        finally:
            await process_manager().shutdown()

    asyncio.run(check())


def test_without_the_app_window_the_ai_is_told_why(tmp_path: Path, monkeypatch):
    async def check():
        monkeypatch.setattr("alpine_server.screens.CAPTURE_WAIT", 0.2)
        captures = ScreenCaptures(lambda request: None)
        with pytest.raises(ToolError, match="only while the Alpine app is open"):
            await captures.capture("http://127.0.0.1:1/", 390, 844)

    asyncio.run(check())


def test_map_check_says_what_the_map_could_not_read(tmp_path: Path):
    tools = AppScreenTools(tmp_path, DevelopmentServerManager(), ScreenCaptures(lambda request: None))
    assert tools.map_check.invoke({}, None) == "This project has no product map yet."
    base = tmp_path / ".alpine-code/map"
    (base / "features").mkdir(parents=True)
    (base / "map.json").write_text('{"formatVersion": 1}')
    (base / "features/home.json").write_text('{"id": "home", "title": "Home"}')
    assert tools.map_check.invoke({}, None).startswith("The map reads cleanly: 1 cards")
    (base / "features/post.json").write_text('{"id": "post"}')
    said = tools.map_check.invoke({}, None)
    assert "features/post.json (not shown)" in said and "title" in said
