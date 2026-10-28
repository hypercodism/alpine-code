"""Real loopback listeners and subprocesses, isolated from the user's development servers."""

import asyncio
import shlex
import socket
import sys
from pathlib import Path

from alpine_core.dev_servers import DevelopmentServerManager, how_to_run, listener
from alpine_core.processes import process_manager


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


async def ready(port: int) -> None:
    for _ in range(100):
        if await listener(port):
            return
        await asyncio.sleep(0.03)
    raise AssertionError("Server did not listen")


def command(port: int) -> str:
    return f"{shlex.quote(sys.executable)} -u -m http.server {port} --bind 127.0.0.1"


def test_lifecycle_deduplication_and_logs(tmp_path: Path):
    async def check():
        manager = DevelopmentServerManager()
        port = free_port()
        try:
            first = (await manager.start(str(tmp_path), command(port), port))["server"]
            duplicate = (await manager.start(str(tmp_path), command(port), port))["server"]
            assert duplicate["process_id"] == first["process_id"]
            await ready(port)
            listed = await manager.list(str(tmp_path))
            assert listed[0]["status"] == "running"
            assert listed[0]["url"] == f"http://localhost:{port}"
            # The map's way in: the same server through the relay, which adds the bridge to its pages.
            assert listed[0]["board_url"].startswith("http://127.0.0.1:")
            import urllib.request

            page = await asyncio.to_thread(
                lambda: urllib.request.urlopen(listed[0]["board_url"] + "/", timeout=5).read()
            )
            assert b"/__alpine/bridge.js" in page
            assert "Serving HTTP" in manager.logs(first["id"], 0, 65536)["text"]
            # A restart starts fresh: Vite's prepared modules, which go stale and leave pages blank, are thrown away.
            (tmp_path / "node_modules" / ".vite" / "deps").mkdir(parents=True)
            restarted = (await manager.restart(first["id"]))["server"]
            assert not (tmp_path / "node_modules" / ".vite").exists()
            assert restarted["process_id"] != first["process_id"]
            await ready(port)
            stopped = await manager.stop(restarted["id"])
            assert stopped["status"] == "stopped"
            assert await listener(port) is None
        finally:
            await process_manager().shutdown()

    asyncio.run(check())


def test_external_project_ownership_and_detach(tmp_path: Path):
    async def check():
        manager = DevelopmentServerManager()
        port = free_port()
        outside = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "http.server",
            str(port),
            "--bind",
            "127.0.0.1",
            cwd=tmp_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await ready(port)
            conflict = await manager.start(str(tmp_path), command(port), port)
            assert conflict["conflict"]["pid"] == outside.pid
            assert conflict["conflict"]["can_reuse"]
            other = tmp_path / "other"
            other.mkdir()
            unrelated = await manager.start(str(other), command(port), port, reuse=True)
            assert not unrelated["conflict"]["can_reuse"]
            reused = (await manager.start(str(tmp_path), command(port), port, reuse=True))["server"]
            assert reused["external"]
            assert reused["process_id"] is None
            await manager.stop(reused["id"])
            assert outside.returncode is None
            assert await listener(port)
        finally:
            outside.terminate()
            await outside.wait()

    asyncio.run(check())


def test_detect_actual_port_and_reject_unrelated_log_url(tmp_path: Path):
    async def check():
        manager = DevelopmentServerManager()
        requested, actual, unrelated = free_port(), free_port(), free_port()
        outside = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "http.server",
            str(unrelated),
            "--bind",
            "127.0.0.1",
            cwd=tmp_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await ready(unrelated)
            source = (
                f"import http.server; print('http://localhost:{actual}', flush=True); "
                f"http.server.HTTPServer(('127.0.0.1',{actual}), http.server.SimpleHTTPRequestHandler)"
                ".serve_forever()"
            )
            cmd = f"{shlex.quote(sys.executable)} -u -c {shlex.quote(source)}"
            first = (await manager.start(str(tmp_path), cmd, requested))["server"]
            await ready(actual)
            listed = await manager.list(str(tmp_path))
            assert listed[0]["port"] == actual
            duplicate = (await manager.start(str(tmp_path), cmd, requested))["server"]
            assert duplicate["id"] == first["id"]
            source = f"import time; print('http://localhost:{unrelated}',flush=True); time.sleep(30)"
            fake = f"{shlex.quote(sys.executable)} -u -c {shlex.quote(source)}"
            fake_server = (await manager.start(str(tmp_path), fake, free_port()))["server"]
            await asyncio.sleep(0.1)
            fake_snapshot = await manager.servers[fake_server["id"]].snapshot()
            assert fake_snapshot["url"] is None
            assert fake_snapshot["status"] == "starting"
        finally:
            outside.terminate()
            await outside.wait()
            await process_manager().shutdown()

    asyncio.run(check())


def test_discovers_agent_launched_server_and_can_stop_it(tmp_path: Path):
    async def check():
        manager = DevelopmentServerManager()
        port, unrelated = free_port(), free_port()
        outside = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "http.server",
            str(unrelated),
            "--bind",
            "127.0.0.1",
            cwd=tmp_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await ready(unrelated)
            source = (
                f"import http.server; print('http://localhost:{port}', flush=True); "
                f"http.server.HTTPServer(('127.0.0.1',{port}), http.server.SimpleHTTPRequestHandler)"
                ".serve_forever()"
            )
            cmd = f"{shlex.quote(sys.executable)} -u -c {shlex.quote(source)}"
            process = await process_manager().start(cmd, tmp_path, session_id="agent-session")
            fake_source = f"import time; print('http://localhost:{unrelated}',flush=True); time.sleep(30)"
            fake_cmd = f"{shlex.quote(sys.executable)} -u -c {shlex.quote(fake_source)}"
            await process_manager().start(fake_cmd, tmp_path)
            await ready(port)
            await asyncio.sleep(0.05)
            servers = await manager.list(str(tmp_path))
            assert len(servers) == 1
            server = servers[0]
            assert server["process_id"] == process.id
            assert server["port"] == port
            assert server["command"] == cmd
            assert server["status"] == "running"
            assert manager.servers[server["id"]].session_id == "agent-session"
            assert len(await manager.list(str(tmp_path))) == 1
            stopped = await manager.stop(server["id"])
            assert stopped["status"] == "stopped"
            assert await listener(port) is None
            assert outside.returncode is None
        finally:
            outside.terminate()
            await outside.wait()
            await process_manager().shutdown()

    asyncio.run(check())


def test_how_to_run_follows_the_project(tmp_path: Path):
    assert how_to_run(tmp_path) is None
    (tmp_path / "index.html").write_text("<h1>hi</h1>")
    command, port = how_to_run(tmp_path)
    assert "http.server {port}" in command and port == 8000
    (tmp_path / "package.json").write_text('{"scripts": {"dev": "vite", "build": "vite build"}}')
    assert how_to_run(tmp_path) == ("npm install && npm run dev", 5173)
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "pnpm-lock.yaml").write_text("")
    assert how_to_run(tmp_path) == ("pnpm run dev", 5173)
    (tmp_path / "package.json").write_text('{"scripts": {"start": "next start"}}')
    assert how_to_run(tmp_path) == ("pnpm run start", 3000)
    (tmp_path / "package.json").write_text("not json")
    assert how_to_run(tmp_path)[1] == 8000


def test_open_starts_the_project_once_and_shows_what_runs(tmp_path: Path):
    async def check():
        manager = DevelopmentServerManager()
        assert await manager.open(str(tmp_path)) == {"server": None}
        (tmp_path / "index.html").write_text("<h1>hi</h1>")
        # The first port to try is in use by someone else: the next free one is taken.
        busy = socket.socket()
        try:
            busy.bind(("127.0.0.1", 8000))
            busy.listen()
        except OSError:
            pass  # Something here already listens on it.
        try:
            opened = (await manager.open(str(tmp_path)))["server"]
            assert opened["port"] != 8000
            await ready(opened["port"])
            again = (await manager.open(str(tmp_path)))["server"]
            assert again["id"] == opened["id"] and again["status"] == "running"
            assert again["url"] == f"http://localhost:{opened['port']}"
        finally:
            busy.close()
            await process_manager().shutdown()

    asyncio.run(check())


def test_open_again_after_stop_finds_the_port_the_app_took_back(tmp_path: Path, monkeypatch):
    # Like Vite: ignores PORT, takes the first free port from its own, and prints the port in bold.
    first = free_port()
    source = (
        "import http.server\n"
        f"port = {first}\n"
        "while True:\n"
        "    try:\n"
        "        server = http.server.HTTPServer(('127.0.0.1', port), http.server.SimpleHTTPRequestHandler)\n"
        "        break\n"
        "    except OSError:\n"
        "        port += 1\n"
        "print(f'  Local:   \\x1b[36mhttp://localhost:\\x1b[1m{port}\\x1b[22m/\\x1b[39m', flush=True)\n"
        "server.serve_forever()\n"
    )
    (tmp_path / "vite_like.py").write_text(source)
    run = f"{shlex.quote(sys.executable)} -u vite_like.py"
    monkeypatch.setattr("alpine_core.dev_servers.how_to_run", lambda project: (run, first))

    async def running(manager: DevelopmentServerManager, id: str) -> dict:
        for _ in range(100):
            current = await manager.servers[id].snapshot()
            if current["status"] == "running":
                return current
            await asyncio.sleep(0.03)
        raise AssertionError("Server did not run")

    async def check():
        manager = DevelopmentServerManager()
        try:
            opened = (await manager.open(str(tmp_path)))["server"]
            assert (await running(manager, opened["id"]))["port"] == first
            await manager.stop(opened["id"])
            for _ in range(100):
                if not await listener(first):
                    break
                await asyncio.sleep(0.03)
            again = (await manager.open(str(tmp_path)))["server"]
            assert again["id"] != opened["id"]
            current = await running(manager, again["id"])
            assert current["url"] == f"http://localhost:{first}"
        finally:
            await process_manager().shutdown()

    asyncio.run(check())


def test_port_reaches_every_step_of_the_command(tmp_path: Path):
    # Like ``npm install && npm run start`` on a first open: the server is the second step and listens on PORT.
    (tmp_path / "serve.py").write_text(
        "import http.server, os\n"
        "http.server.HTTPServer(('127.0.0.1', int(os.environ['PORT'])), http.server.SimpleHTTPRequestHandler)"
        ".serve_forever()\n"
    )

    async def check():
        manager = DevelopmentServerManager()
        port = free_port()
        try:
            await manager.start(str(tmp_path), f"true && {shlex.quote(sys.executable)} -u serve.py", port)
            await ready(port)
        finally:
            await process_manager().shutdown()

    asyncio.run(check())


def test_a_server_that_never_listens_fails_instead_of_starting_for_ever(tmp_path: Path, monkeypatch):
    # Like a dev script that ignores PORT and says nothing: once quiet for QUIET_LIMIT it is stopped and failed, so the
    # preview can offer the AI's fix. Output keeps it starting, and so does work without output (npm's first install
    # prints nothing when its output is not a terminal).
    from alpine_core import dev_servers

    monkeypatch.setattr(dev_servers, "QUIET_LIMIT", 0.6)

    async def check():
        manager = DevelopmentServerManager()
        port = free_port()
        quiet = f"{shlex.quote(sys.executable)} -u -c 'import time; time.sleep(60)'"
        talking = (
            f"{shlex.quote(sys.executable)} -u -c "
            "'import time\nfor i in range(60):\n    print(i, flush=True); time.sleep(0.2)'"
        )
        silent = (
            f"{shlex.quote(sys.executable)} -u -c "
            "'import time\nend = time.time() + 60\nwhile time.time() < end: sum(range(1000))'"
        )
        try:
            given_up = (await manager.start(str(tmp_path), quiet, port))["server"]
            busy = (await manager.start(str(tmp_path), talking, free_port()))["server"]
            installing = (await manager.start(str(tmp_path), silent, free_port()))["server"]
            for _ in range(60):
                listed = {s["id"]: s for s in await manager.list(str(tmp_path))}
                if listed[given_up["id"]]["status"] == "failed":
                    break
                await asyncio.sleep(0.1)
            assert listed[given_up["id"]]["status"] == "failed"
            assert process_manager().get(given_up["process_id"]).snapshot()["status"] != "running"
            assert listed[busy["id"]]["status"] == "starting"
            assert listed[installing["id"]]["status"] == "starting"
        finally:
            await process_manager().shutdown()

    asyncio.run(check())


def test_cpu_time_is_read_as_ps_prints_it():
    from alpine_core.dev_servers import _cpu_seconds

    assert _cpu_seconds("0:01.50") == 1.5
    assert _cpu_seconds("01:02:03") == 3723
    assert _cpu_seconds("1-00:00:01") == 86401


def test_list_adopts_a_server_started_outside_alpine(tmp_path: Path):
    """A server the AI started with ``nohup`` (or another terminal) is the project's app on the map all the same,
    found by the folder its process works in, and it is not Alpine's to stop."""

    async def check():
        manager = DevelopmentServerManager()
        port = free_port()
        (tmp_path / "index.html").write_text("<p>hi</p>")
        outside = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "http.server",
            str(port),
            "--bind",
            "127.0.0.1",
            cwd=tmp_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await ready(port)
            servers = await manager.list(str(tmp_path))
            assert [(s["port"], s["status"], s["external"]) for s in servers] == [(port, "running", True)]
            assert servers[0]["board_url"]
            # Opening the app uses it rather than starting a second one.
            opened = (await manager.open(str(tmp_path)))["server"]
            assert opened["id"] == servers[0]["id"]
            await manager.stop(opened["id"])
            assert outside.returncode is None
        finally:
            outside.terminate()
            await outside.wait()
            await process_manager().shutdown()

    asyncio.run(check())


def test_the_map_gets_a_new_way_in_when_the_app_moves(tmp_path: Path):
    async def check():
        manager = DevelopmentServerManager()
        first, second = free_port(), free_port()
        try:
            server = (await manager.start(str(tmp_path), command(first), first))["server"]
            await ready(first)
            before = (await manager.list(str(tmp_path)))[0]["board_url"]
            managed = manager.servers[server["id"]]
            await process_manager().get(managed.process_id).stop()
            process = await process_manager().start(command(second), tmp_path)
            managed.process_id, managed.port = process.id, second
            await ready(second)
            after = (await manager.list(str(tmp_path)))[0]
            assert after["port"] == second and after["board_url"] and after["board_url"] != before
        finally:
            await process_manager().shutdown()

    asyncio.run(check())
