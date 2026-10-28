"""The map's relay: pages get the bridge, everything else passes through untouched, hot reload passes both ways."""

import asyncio
import urllib.error
import urllib.request

import pytest

from alpine_core.relay import BRIDGE_PATH, Relay, inject

PAGE = b"<!doctype html><html><head><title>t</title></head><body>hi</body></html>"


async def upstream(handler) -> tuple[asyncio.Server, int]:
    server = await asyncio.start_server(handler, "127.0.0.1", 0)
    return server, server.sockets[0].getsockname()[1]


async def answer(writer: asyncio.StreamWriter, head: str, body: bytes) -> None:
    writer.write(head.encode() + b"\r\n\r\n" + body)
    await writer.drain()
    writer.close()


def fetch(url: str) -> tuple[int, dict[str, str], bytes]:
    with urllib.request.urlopen(url, timeout=5) as response:
        return response.status, {k.lower(): v for k, v in response.headers.items()}, response.read()


def test_inject_places_the_tag_before_head_or_first():
    assert inject(PAGE).count(BRIDGE_PATH.encode()) == 1
    assert inject(PAGE).index(BRIDGE_PATH.encode()) < inject(PAGE).index(b"</head>")
    assert inject(b"<p>x</p>").startswith(b"<script")


def test_pages_get_the_bridge_and_other_files_pass_through():
    async def check():
        seen = []

        async def handler(reader, writer):
            head = (await reader.readuntil(b"\r\n\r\n")).decode()
            seen.append(head)
            path = head.split(" ")[1]
            if path == "/app.js":
                await answer(
                    writer, "HTTP/1.1 200 OK\r\nContent-Type: text/javascript\r\nContent-Length: 9", b"let a = 1"
                )
            elif path == "/chunked":
                body = b"%x\r\n%s\r\n0\r\n\r\n" % (len(PAGE), PAGE)
                await answer(writer, "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked", body)
            else:
                await answer(
                    writer,
                    f"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {len(PAGE)}",
                    PAGE,
                )

        app, port = await upstream(handler)
        relay = await Relay(port).start()
        try:
            status, headers, body = await asyncio.to_thread(fetch, relay.url + "/order?alpine-state=empty")
            assert status == 200 and BRIDGE_PATH.encode() in body
            assert int(headers["content-length"]) == len(body)
            assert seen[0].startswith("GET /order?alpine-state=empty HTTP/1.1")
            assert "accept-encoding" not in seen[0].lower()
            _, _, js = await asyncio.to_thread(fetch, relay.url + "/app.js")
            assert js == b"let a = 1"
            _, headers, chunked = await asyncio.to_thread(fetch, relay.url + "/chunked")
            assert BRIDGE_PATH.encode() in chunked and b"<body>hi</body>" in chunked
            assert "transfer-encoding" not in headers
            _, headers, bridge = await asyncio.to_thread(fetch, relay.url + BRIDGE_PATH)
            assert b"data-alpine-to" in bridge and headers["content-type"].startswith("text/javascript")
        finally:
            await relay.close()
            app.close()

    asyncio.run(check())


def test_websocket_upgrades_pass_both_ways():
    async def check():
        async def handler(reader, writer):
            await reader.readuntil(b"\r\n\r\n")
            writer.write(b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
            await writer.drain()
            while data := await reader.read(100):
                writer.write(data.upper())
                await writer.drain()

        app, port = await upstream(handler)
        relay = await Relay(port).start()
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", relay.port)
            writer.write(b"GET /hmr HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
            await writer.drain()
            assert (await reader.readuntil(b"\r\n\r\n")).startswith(b"HTTP/1.1 101")
            writer.write(b"hello")
            await writer.drain()
            assert await asyncio.wait_for(reader.read(5), 3) == b"HELLO"
            writer.close()
        finally:
            await relay.close()
            app.close()

    asyncio.run(check())


def test_a_stopped_app_answers_502():
    async def check():
        relay = await Relay(1).start()
        try:
            try:
                await asyncio.to_thread(fetch, relay.url + "/")
            except urllib.error.HTTPError as error:
                assert error.code == 502
                # A page that asks again by itself, so the map's screens come back when the app does.
                assert b"http-equiv=refresh" in error.read()
            else:
                raise AssertionError("expected 502")
        finally:
            await relay.close()

    asyncio.run(check())


def test_an_app_listening_on_ipv6_only_is_reached():
    """Vite on Node 17+ takes ``localhost`` as ``::1``: the relay still reaches it."""

    async def check():
        async def handler(reader, writer):
            await reader.readuntil(b"\r\n\r\n")
            await answer(writer, f"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {len(PAGE)}", PAGE)

        try:
            app = await asyncio.start_server(handler, "::1", 0)
        except OSError:
            pytest.skip("no IPv6 loopback here")
        relay = await Relay(app.sockets[0].getsockname()[1]).start()
        try:
            status, _, body = await asyncio.to_thread(fetch, relay.url + "/")
            assert status == 200 and BRIDGE_PATH.encode() in body
        finally:
            await relay.close()
            app.close()

    asyncio.run(check())
