"""A relay in front of a project's dev server, so the map can show the app's real screens and know what is on them.

The map opens each screen in a frame through this relay instead of the dev server itself. The relay passes every
request through unchanged, except that it adds one script tag to each HTML page: ``relay_bridge.js``, which tells the
map where the screen's buttons to other screens (``data-alpine-to``) and its promises (``data-alpine-promise``) are.
WebSocket upgrades (the dev server's hot reload) are passed through byte for byte, so the screens on the map change the
moment the code does.

Standard library only, on the server's event loop. One request per connection: every response says
``Connection: close``, which keeps the parsing simple, and on loopback the cost of new connections is small.
"""

from __future__ import annotations

import asyncio
import contextlib
import re
from importlib import resources

#: Where the bridge script is served, on the app's own origin so the page can load it like any of its own files.
BRIDGE_PATH = "/__alpine/bridge.js"
_TAG = f'<script src="{BRIDGE_PATH}"></script>'.encode()
_HEAD_LIMIT = 64 * 1024
#: An HTML page larger than this is passed through without the bridge rather than held in memory.
_PAGE_LIMIT = 8 * 1024 * 1024
#: Where a dev server on this machine may listen: Vite on Node 17+ takes ``localhost`` as ``::1`` only.
_HOSTS = ("127.0.0.1", "::1")
#: What a frame gets while the app is not up: a page that asks again every two seconds, so the map's screens come
#: back by themselves once the server listens (again), without anyone reopening the map.
_NOT_RUNNING = (
    b"<!doctype html><meta charset=utf-8><meta http-equiv=refresh content=2>"
    b"<title>The app is not running</title><body style='font:13px system-ui;color:#888;padding:16px'>"
    b"The app is not running yet."
)


async def connect(port: int, prefer: str = _HOSTS[0]) -> tuple[asyncio.StreamReader, asyncio.StreamWriter, str]:
    """A connection to ``port`` on this machine, over IPv4 or IPv6, whichever the server listens on (``prefer``
    first), and the host it answered on. ``OSError`` when it listens on neither."""
    error: OSError | None = None
    for host in (prefer, *(h for h in _HOSTS if h != prefer)):
        try:
            reader, writer = await asyncio.open_connection(host, port)
            return reader, writer, host
        except OSError as exc:
            error = exc
    assert error is not None
    raise error


def _bridge() -> bytes:
    return resources.files("alpine_core").joinpath("relay_bridge.js").read_bytes()


def _split_head(head: bytes) -> tuple[str, list[tuple[str, str]]]:
    lines = head.decode("latin-1").split("\r\n")
    headers = []
    for line in lines[1:]:
        if ":" in line:
            name, value = line.split(":", 1)
            headers.append((name.strip(), value.strip()))
    return lines[0], headers


def _header(headers: list[tuple[str, str]], name: str) -> str:
    return next((value for key, value in headers if key.lower() == name), "")


def _join_head(first: str, headers: list[tuple[str, str]]) -> bytes:
    return (first + "\r\n" + "".join(f"{k}: {v}\r\n" for k, v in headers) + "\r\n").encode("latin-1")


def _without(headers: list[tuple[str, str]], *names: str) -> list[tuple[str, str]]:
    return [(k, v) for k, v in headers if k.lower() not in names]


def _unchunk(body: bytes) -> bytes:
    out, rest = bytearray(), body
    while rest:
        size_line, _, rest = rest.partition(b"\r\n")
        size = int(size_line.split(b";")[0] or b"0", 16)
        if size == 0:
            break
        out += rest[:size]
        rest = rest[size + 2 :]
    return bytes(out)


def inject(page: bytes) -> bytes:
    """The page with the bridge's script tag, before ``</head>`` when there is one."""
    match = re.search(rb"</head\s*>", page, re.IGNORECASE)
    if match is None:
        return _TAG + page
    return page[: match.start()] + _TAG + page[match.start() :]


async def _pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while chunk := await reader.read(65536):
            writer.write(chunk)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        with contextlib.suppress(Exception):
            writer.close()


class Relay:
    """Listens on a free loopback port and relays to ``target_port`` on the same machine."""

    def __init__(self, target_port: int) -> None:
        self.target_port = target_port
        self.port = 0
        self._server: asyncio.Server | None = None
        # The address family the app answered on last, tried first next time.
        self._host = _HOSTS[0]

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    async def start(self) -> Relay:
        self._server = await asyncio.start_server(self._serve, "127.0.0.1", 0)
        self.port = self._server.sockets[0].getsockname()[1]
        return self

    async def close(self) -> None:
        if self._server is not None:
            self._server.close()
            self._server = None

    async def _serve(self, client_in: asyncio.StreamReader, client_out: asyncio.StreamWriter) -> None:
        try:
            await self._one(client_in, client_out)
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, ConnectionError, ValueError):
            pass
        finally:
            with contextlib.suppress(Exception):
                client_out.close()

    async def _one(self, client_in: asyncio.StreamReader, client_out: asyncio.StreamWriter) -> None:
        head = await client_in.readuntil(b"\r\n\r\n")
        if len(head) > _HEAD_LIMIT:
            return
        first, headers = _split_head(head)
        target = first.split(" ")[1] if " " in first else ""
        if target.split("?")[0] == BRIDGE_PATH:
            body = _bridge()
            client_out.write(
                _join_head(
                    "HTTP/1.1 200 OK",
                    [
                        ("Content-Type", "text/javascript; charset=utf-8"),
                        ("Content-Length", str(len(body))),
                        ("Cache-Control", "no-store"),
                        ("Connection", "close"),
                    ],
                )
                + body
            )
            await client_out.drain()
            return
        try:
            app_in, app_out, self._host = await connect(self.target_port, self._host)
        except OSError:
            client_out.write(
                _join_head(
                    "HTTP/1.1 502 Bad Gateway",
                    [
                        ("Content-Type", "text/html; charset=utf-8"),
                        ("Content-Length", str(len(_NOT_RUNNING))),
                        ("Cache-Control", "no-store"),
                        ("Connection", "close"),
                    ],
                )
                + _NOT_RUNNING
            )
            await client_out.drain()
            return
        if _header(headers, "upgrade").lower() == "websocket":
            # Hot reload: hand the bytes over as they are, both ways, until either side closes.
            app_out.write(head)
            await app_out.drain()
            await asyncio.gather(_pipe(client_in, app_out), _pipe(app_in, client_out))
            return
        app_out.write(
            _join_head(
                first, _without(headers, "connection", "accept-encoding", "keep-alive") + [("Connection", "close")]
            )
        )
        await app_out.drain()
        # The request's body, if any, goes on while the answer comes back.
        upload = (
            asyncio.create_task(_pipe(client_in, app_out))
            if _header(headers, "content-length") or _header(headers, "transfer-encoding")
            else None
        )
        try:
            answer = await app_in.readuntil(b"\r\n\r\n")
            status, answer_headers = _split_head(answer)
            html = "text/html" in _header(answer_headers, "content-type").lower()
            encoded = _header(answer_headers, "content-encoding").lower() not in ("", "identity")
            if not html or encoded or " 200" not in status[:13]:
                client_out.write(
                    _join_head(status, _without(answer_headers, "connection", "keep-alive") + [("Connection", "close")])
                )
                await client_out.drain()
                await _pipe(app_in, client_out)
                return
            body = await app_in.read(_PAGE_LIMIT + 1)
            while len(body) <= _PAGE_LIMIT and (chunk := await app_in.read(65536)):
                body += chunk
            if len(body) > _PAGE_LIMIT:
                client_out.write(
                    _join_head(status, _without(answer_headers, "connection", "keep-alive") + [("Connection", "close")])
                    + body
                )
                await client_out.drain()
                await _pipe(app_in, client_out)
                return
            if "chunked" in _header(answer_headers, "transfer-encoding").lower():
                body = _unchunk(body)
            page = inject(body)
            kept = _without(answer_headers, "connection", "keep-alive", "content-length", "transfer-encoding")
            client_out.write(
                _join_head(status, kept + [("Content-Length", str(len(page))), ("Connection", "close")]) + page
            )
            await client_out.drain()
        finally:
            if upload is not None:
                upload.cancel()
            with contextlib.suppress(Exception):
                app_out.close()
