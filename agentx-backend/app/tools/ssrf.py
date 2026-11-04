"""SSRF guard for any URL fetched on behalf of a model. Re-validate on every redirect hop."""
from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit

ALLOWED_PORTS = {80, 443, None}


class BlockedURL(Exception):
    pass


def _ip_ok(ip: str) -> bool:
    a = ipaddress.ip_address(ip)
    return not (a.is_private or a.is_loopback or a.is_link_local or a.is_multicast or a.is_reserved or a.is_unspecified)


async def check_url(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise BlockedURL(f"scheme not allowed: {parts.scheme or 'none'}")
    if not parts.hostname:
        raise BlockedURL("missing host")
    if parts.username or parts.password:
        raise BlockedURL("credentials in URL not allowed")
    if parts.port not in ALLOWED_PORTS:
        raise BlockedURL(f"port not allowed: {parts.port}")
    host = parts.hostname
    try:
        ips = [host] if _is_ip(host) else [i[4][0] for i in await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)]
    except socket.gaierror as e:
        raise BlockedURL(f"cannot resolve {host}") from e
    for ip in ips:
        if not _ip_ok(ip.split("%")[0]):
            raise BlockedURL(f"address not allowed: {ip}")
    return url


def _is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False
