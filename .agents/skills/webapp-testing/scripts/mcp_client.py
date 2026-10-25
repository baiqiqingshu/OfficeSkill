"""Small stdlib HTTP MCP client for Lightpanda, with owned sessions and no retries."""
from __future__ import annotations

import asyncio
import http.client
import json
import os
import time
from urllib.parse import urlsplit

MAX_RESPONSE = 4 * 1024 * 1024


class McpTransportError(RuntimeError):
    pass


class McpToolError(AssertionError):
    pass


def result_text(result):
    return "\n".join(item.get("text", "") for item in result.get("content", [])
                     if isinstance(item, dict) and item.get("type") == "text")


def result_json(result):
    """evaluate returns JSON text; some versions also provide structuredContent."""
    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        return structured
    try:
        return json.loads(result_text(result))
    except (TypeError, json.JSONDecodeError) as exc:
        raise McpTransportError("Native MCP returned an invalid structured result") from exc


class McpClient:
    def __init__(self, url, token_env=None):
        self.url = urlsplit(url)
        self.session_id = None
        self.protocol = None
        self.counter = 0
        self.broken = False
        self.tools = {}
        self.token = os.getenv(token_env, "") if token_env else ""
        if token_env and not self.token:
            raise ValueError("MCP service token environment variable is empty: " + token_env)

    def _post(self, payload, timeout, session_id, protocol):
        cls = http.client.HTTPSConnection if self.url.scheme == "https" else http.client.HTTPConnection
        connection = cls(self.url.hostname, self.url.port, timeout=max(0.05, timeout))
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        if session_id:
            headers["Mcp-Session-Id"] = session_id
        if protocol:
            headers["MCP-Protocol-Version"] = protocol
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        path = self.url.path or "/mcp"
        if self.url.query:
            path += "?" + self.url.query
        try:
            connection.request("POST", path, body=json.dumps(payload).encode("utf-8"), headers=headers)
            response = connection.getresponse()
            sid = response.getheader("Mcp-Session-Id")
            if not 200 <= response.status < 300:
                raise McpTransportError(f"Native MCP HTTP {response.status}; verify mcp_url points to /mcp, not a CDP port")
            if "id" not in payload:
                return {}, sid
            if "text/event-stream" in (response.getheader("Content-Type") or ""):
                used, lines = 0, []
                deadline = time.monotonic() + timeout
                while used <= MAX_RESPONSE and time.monotonic() < deadline:
                    raw = response.readline(65537)
                    if not raw:
                        break
                    used += len(raw)
                    if used > MAX_RESPONSE:
                        raise McpTransportError("Native MCP stream exceeded 4 MiB")
                    line = raw.decode("utf-8").rstrip("\r\n")
                    if line.startswith("data:"):
                        lines.append(line[5:].lstrip(" "))
                    elif not line and lines:
                        message = json.loads("\n".join(lines))
                        lines = []
                        if isinstance(message, dict) and message.get("id") == payload["id"]:
                            return message, sid
                raise McpTransportError("Native MCP stream ended or exceeded its response budget")
            raw = response.read(MAX_RESPONSE + 1)
            if len(raw) > MAX_RESPONSE:
                raise McpTransportError("Native MCP response exceeded 4 MiB")
            message = json.loads(raw)
            if not isinstance(message, dict) or message.get("id") != payload["id"]:
                raise McpTransportError("Native MCP response ID did not match the request")
            return message, sid
        finally:
            connection.close()

    async def rpc(self, method, params, timeout, notification=False):
        if self.broken:
            raise McpTransportError("MCP session is uncertain after a transport failure; actions will not be replayed")
        self.counter += 1
        payload = {"jsonrpc": "2.0", "method": method, "params": params}
        if not notification:
            payload["id"] = self.counter
        try:
            response, sid = await asyncio.wait_for(asyncio.to_thread(
                self._post, payload, timeout, self.session_id, self.protocol), timeout)
        except BaseException as exc:
            self.broken = True
            if isinstance(exc, (KeyboardInterrupt, SystemExit, asyncio.CancelledError)):
                raise
            if isinstance(exc, McpTransportError):
                # Our own errors contain protocol/status facts, never peer text.
                raise McpTransportError(str(exc) + "; no retry was performed") from exc
            # Service/proxy errors can contain echoed input and credentials.
            raise McpTransportError("Native MCP request failed (" + type(exc).__name__ + "); no retry was performed") from exc
        if notification:
            return {}
        if method == "initialize":
            if not isinstance(sid, str) or not sid.strip() or sid == "default":
                raise McpTransportError("Native MCP did not allocate an isolated session; upgrade the server or check proxy session headers")
            self.session_id = sid
        if response.get("error"):
            self.broken = True
            raise McpTransportError("Native MCP JSON-RPC error at " + method)
        result = response.get("result")
        if not isinstance(result, dict):
            self.broken = True
            raise McpTransportError("Native MCP returned an invalid result object")
        return result

    async def connect(self, timeout):
        result = await self.rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "webapp-testing", "version": "1"}}, timeout)
        self.protocol = result.get("protocolVersion", "2024-11-05")
        await self.rpc("notifications/initialized", {}, timeout, notification=True)
        cursor = None
        for _ in range(20):
            result = await self.rpc("tools/list", {"cursor": cursor} if cursor else {}, timeout)
            for tool in result.get("tools", []):
                if isinstance(tool, dict) and isinstance(tool.get("name"), str):
                    self.tools[tool["name"]] = tool
            cursor = result.get("nextCursor")
            if not cursor:
                return
        raise McpTransportError("Native MCP tool listing exceeded 20 pages")

    async def tool(self, name, arguments, timeout):
        if name not in self.tools:
            raise McpTransportError("Native MCP tool is unavailable: " + name)
        result = await self.rpc("tools/call", {"name": name, "arguments": arguments}, timeout)
        if not isinstance(result.get("content"), list):
            self.broken = True
            raise McpTransportError("Native MCP tool returned no content array: " + name)
        if result.get("isError"):
            raise McpToolError("Native MCP tool failed: " + name + "; inspect the action and application state before retrying")
        return result

    async def close(self):
        if self.session_id:
            # A timed-out request may still execute server-side. Close the owned
            # session without reusing it or replaying the original action.
            self.broken = False
            try:
                result = await self.rpc("tools/call", {"name": "session_close", "arguments": {"id": self.session_id}}, 3)
                if result.get("isError"):
                    raise McpTransportError("Native MCP could not close its owned session")
            finally:
                self.session_id = None
