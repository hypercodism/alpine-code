"""Development servers share managed terminal processes and outlive frontend navigation."""

from __future__ import annotations

import asyncio
import json
import os
import re
import shlex
import shutil
import socket
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .processes import process_manager


async def _command(*args: str) -> str:
    try:
        child = await asyncio.create_subprocess_exec(
            *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL
        )
        stdout, _ = await asyncio.wait_for(child.communicate(), 3)
        return stdout.decode(errors="replace").strip()
    except OSError:
        return ""
    except TimeoutError:
        child.kill()
        await child.wait()
        return ""


async def listener(port: int) -> dict[str, Any] | None:
    """Probe loopback first. Unknown ownership remains a conflict, never permission to kill/reuse."""

    def connected() -> bool:
        for host in ("127.0.0.1", "::1"):
            try:
                with socket.create_connection((host, port), timeout=0.15):
                    return True
            except OSError:
                pass
        return False

    if not await asyncio.to_thread(connected):
        return None
    info: dict[str, Any] = {"port": port, "pid": None, "cwd": None, "can_reuse": False}
    lsof = shutil.which("lsof") or ("/usr/sbin/lsof" if Path("/usr/sbin/lsof").exists() else None)
    if lsof:
        owners = await _command(lsof, "-nP", "-t", f"-iTCP:{port}", "-sTCP:LISTEN")
        pids = owners.splitlines()
        if len(pids) == 1 and pids[0].isdigit():
            info["pid"] = int(pids[0])
            fields = await _command(lsof, "-a", "-p", pids[0], "-d", "cwd", "-Fn")
            info["cwd"] = next((line[1:] for line in fields.splitlines() if line.startswith("n")), None)
    return info


def _owned_by(listener: dict[str, Any], pid: int) -> bool:
    if listener["pid"] is None:
        return False
    try:
        return os.getpgid(listener["pid"]) == pid
    except OSError:
        return False


#: Terminal colour and style codes; Vite, for one, prints its port in bold inside the URL.
_ANSI = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))")


def _loopback_ports(process: Any) -> list[int]:
    # The tail also finds URLs from a restarted child after a long-running build's output.
    offset = max(0, process.snapshot()["output_size"] - 262144)
    text = _ANSI.sub("", process.read(offset=offset, limit=262144)["text"])
    values = re.findall(r"https?://(?:localhost|127\.0\.0\.1|\[::1\]):(\d{1,5})(?!\d)", text)
    return list(dict.fromkeys(int(value) for value in reversed(values) if 1 <= int(value) <= 65535))


#: The package.json scripts a Node.js project is run with while developing, in the order they are tried.
_NODE_SCRIPTS = ("dev", "start")

#: The package manager a project uses, by its lockfile; npm when there is none.
_LOCKFILES = (("pnpm-lock.yaml", "pnpm"), ("yarn.lock", "yarn"), ("bun.lock", "bun"), ("bun.lockb", "bun"))

#: How many ports after the first one a project's server may take, when the first is in use.
_PORT_TRIES = 50


def how_to_run(project: Path) -> tuple[str, int] | None:
    """How a project runs while developing, as a person would start it at a terminal, and the port to try first: its
    package.json's ``dev`` (else ``start``) script with the package manager its lockfile names, installing first when
    nothing is installed yet; else a folder with an ``index.html`` is served as it is. ``{port}`` in the command is the
    port it gets; a Node.js server is given ``PORT`` instead, and Vite, which ignores it, says in its output where it
    went. ``None`` when nothing says how."""
    package = project / "package.json"
    if package.is_file():
        try:
            scripts = json.loads(package.read_text(encoding="utf-8")).get("scripts")
        except (OSError, ValueError, AttributeError):
            scripts = None
        name = next((n for n in _NODE_SCRIPTS if isinstance(scripts, dict) and isinstance(scripts.get(n), str)), None)
        if name:
            tool = next((tool for lockfile, tool in _LOCKFILES if (project / lockfile).exists()), "npm")
            run = f"{tool} run {name}"
            if not (project / "node_modules").is_dir():
                run = f"{tool} install && {run}"
            return run, 5173 if "vite" in scripts[name] else 3000
    if (project / "index.html").is_file():
        return f"{shlex.quote(sys.executable)} -u -m http.server {{port}} --bind 127.0.0.1", 8000
    return None


#: A managed server still starting that prints nothing new and does no work for this long, with nothing listening
#: where it should, is given up on: it never listens, or listens where no one looks (a port of its own, no address
#: printed). It is stopped and shown as failed, which offers to have the AI fix it, instead of "starting" for ever.
#: A first install that prints nothing (npm, when its output is not a terminal) still works, so it is not quiet.
QUIET_LIMIT = 180.0


def _cpu_seconds(text: str) -> float:
    """``ps``'s cumulative CPU time (``[[dd-]hh:]mm:ss[.cc]``) in seconds."""
    days, _, clock = text.rpartition("-")
    total = 0.0
    for part in clock.split(":"):
        total = total * 60 + float(part)
    return total + (int(days) * 86400 if days else 0)


async def _group_work(pgid: int) -> float | None:
    """How much CPU time the process group (the server's command and everything it started) has used, or ``None``
    when ``ps`` cannot tell."""
    total, found = 0.0, False
    for line in (await _command("ps", "-A", "-o", "pgid=,time=")).splitlines():
        group, _, used = line.strip().partition(" ")
        if group == str(pgid):
            try:
                total += _cpu_seconds(used.strip())
                found = True
            except ValueError:
                pass
    return total if found else None


@dataclass
class DevelopmentServer:
    id: str
    cwd: str
    command: str
    port: int
    process_id: str | None = None
    external: bool = False
    session_id: str | None = None
    requested_port: int | None = None
    external_pid: int | None = None
    # How much output and work were seen last and since when they stayed so, while starting (``QUIET_LIMIT``).
    heard: int = 0
    worked: float | None = None
    quiet_since: float = field(default_factory=time.monotonic)
    gave_up: bool = False

    async def snapshot(self) -> dict[str, Any]:
        if self.process_id:
            process = process_manager().get(self.process_id)
            # Dev tools may choose another free port. Only accept loopback URLs, never arbitrary log links.
            for candidate in _loopback_ports(process):
                owner = await listener(candidate)
                if owner and _owned_by(owner, process.snapshot()["pid"]):
                    self.port = candidate
                    break
        occupied = await listener(self.port)
        if occupied and self.process_id and not _owned_by(occupied, process.snapshot()["pid"]):
            occupied = None
        status = "running" if occupied else "starting"
        if self.external:
            same_project = occupied and occupied["cwd"] and str(Path(occupied["cwd"]).resolve()) == self.cwd
            same_process = occupied and occupied["pid"] == self.external_pid
            status = "running" if same_project and same_process else "stopped"
        else:
            process = process_manager().get(self.process_id)
            state = process.snapshot()
            if self.gave_up:
                status = "failed"
            elif state.get("status") in {"exited", "failed", "stopped", "cancelled"}:
                status = "stopped" if state.get("cancelled") or state.get("exit_code") in (0, None) else "failed"
            elif state.get("status") == "stopping":
                status = "stopping"
            elif status == "starting":
                now = time.monotonic()
                worked = await _group_work(state["pid"]) if state.get("pid") else None
                if state.get("output_size", 0) != self.heard or worked != self.worked:
                    self.heard, self.worked, self.quiet_since = state.get("output_size", 0), worked, now
                elif now - self.quiet_since >= QUIET_LIMIT:
                    self.gave_up = True
                    status = "failed"
                    await process.stop()
        return {
            "id": self.id,
            "cwd": self.cwd,
            "command": self.command,
            "port": self.port,
            "url": f"http://localhost:{self.port}" if status == "running" else None,
            "process_id": self.process_id,
            "external": self.external,
            "status": status,
        }


class DevelopmentServerManager:
    def __init__(self) -> None:
        self.servers: dict[str, DevelopmentServer] = {}
        self._lock = asyncio.Lock()

    async def start(
        self, cwd: str, command: str, port: int, *, session_id: str | None = None, reuse: bool = False
    ) -> dict[str, Any]:
        project = Path(cwd).expanduser().resolve(strict=True)
        if not project.is_dir() or not command.strip():
            raise ValueError("Choose a project folder and a server command")
        async with self._lock:
            await self._discover(str(project))
            return await self._start(project, command, port, session_id=session_id, reuse=reuse)

    async def open(self, cwd: str, *, session_id: str | None = None) -> dict[str, Any]:
        """The project's app, running: the server it already has (one the agent or a terminal started counts), else one
        started the way the project runs (``how_to_run``) on a free port. No server when nothing says how."""
        project = Path(cwd).expanduser().resolve(strict=True)
        if not project.is_dir():
            raise ValueError("Choose a project folder")
        async with self._lock:
            await self._discover(str(project))
            for server in reversed(list(self.servers.values())):
                if server.cwd == str(project):
                    current = await server.snapshot()
                    if current["status"] in {"starting", "running"}:
                        return {"server": current}
            how = how_to_run(project)
            if how is None:
                return {"server": None}
            command, first = how
            # Only servers still alive hold their port; a stopped one's port is free again (Vite takes it back).
            taken = {
                server.requested_port
                for server in self.servers.values()
                if (await server.snapshot())["status"] in {"starting", "running", "stopping"}
            }
            port = first
            for candidate in range(first, first + _PORT_TRIES):
                if candidate not in taken and not await listener(candidate):
                    port = candidate
                    break
            return await self._start(project, command.replace("{port}", str(port)), port, session_id=session_id)

    async def _start(
        self, project: Path, command: str, port: int, *, session_id: str | None = None, reuse: bool = False
    ) -> dict[str, Any]:
        """Starts (or reuses) a server; the caller holds the lock."""
        # A second click or another session must not duplicate a managed process that is still starting.
        for existing in self.servers.values():
            if existing.cwd == str(project) and (existing.port == port or existing.requested_port == port):
                current = await existing.snapshot()
                if current["status"] in {"starting", "running", "stopping"}:
                    return {"server": current}
        conflict = await listener(port)
        if conflict:
            conflict["can_reuse"] = conflict["cwd"] is not None and Path(conflict["cwd"]).resolve() == project
            if not reuse or not conflict["can_reuse"]:
                return {"conflict": conflict}
            server = DevelopmentServer(
                uuid.uuid4().hex, str(project), command, port, external=True, external_pid=conflict["pid"]
            )
        else:
            # PORT is supplied for servers that support it; explicit CLI flags still take precedence. Exported, so it
            # reaches every step of a command like ``npm install && npm run start``, not only the first.
            process = await process_manager().start(
                f"export PORT={port}; {command}", project, session_id=session_id, title=f"Dev server :{port}"
            )
            server = DevelopmentServer(
                uuid.uuid4().hex,
                str(project),
                command,
                port,
                process_id=process.id,
                session_id=session_id,
                requested_port=port,
            )
        self.servers[server.id] = server
        return {"server": await server.snapshot()}

    async def _discover(self, project: str) -> None:
        """Adopt agent/terminal-launched servers only after verifying their listening process group."""
        registered = {server.process_id for server in self.servers.values() if server.process_id}
        for process in process_manager().list(cwd=project):
            state = process.snapshot()
            if process.id in registered or state["status"] != "running":
                continue
            for port in _loopback_ports(process):
                owner = await listener(port)
                if owner and _owned_by(owner, state["pid"]):
                    server = DevelopmentServer(
                        uuid.uuid4().hex,
                        project,
                        state["command"],
                        port,
                        process_id=process.id,
                        session_id=state["session_id"],
                    )
                    self.servers[server.id] = server
                    registered.add(process.id)
                    break

    async def list(self, cwd: str) -> list[dict[str, Any]]:
        project = str(Path(cwd).expanduser().resolve())
        async with self._lock:
            await self._discover(project)
            return [await s.snapshot() for s in list(self.servers.values()) if s.cwd == project]

    async def stop(self, id: str) -> dict[str, Any]:
        server = self.servers[id]
        if server.external:
            # Reused processes belong to their original launcher. Detach without signaling them.
            del self.servers[id]
            return {**await server.snapshot(), "status": "stopped", "url": None}
        await process_manager().get(server.process_id).stop()
        return await server.snapshot()

    async def restart(self, id: str) -> dict[str, Any]:
        server = self.servers[id]
        if server.external:
            raise ValueError("Stop or restart this server in its original terminal")
        await self.stop(id)
        return await self.start(server.cwd, server.command, server.port, session_id=server.session_id)

    def logs(self, id: str, offset: int, limit: int) -> dict[str, Any]:
        server = self.servers[id]
        if server.external:
            return {"text": "", "next_offset": 0, "total": 0}
        return process_manager().get(server.process_id).read(offset=offset, limit=limit)
