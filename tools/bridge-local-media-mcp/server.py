"""Read-only local media MCP for the Bridge Media Factory.

Run with: python server.py
Transport: stdio. No upload, write, delete, rename, or arbitrary shell tools.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

ROOT = Path(os.environ.get("BRIDGE_MEDIA_ROOT", r"F:\new 17 - june")).resolve(strict=False)
ALLOWED_SUFFIXES = {".mov", ".mp4", ".mxf", ".m4v", ".mkv"}
MAX_LIST_ITEMS = 200
mcp = FastMCP("crayons-bridge-local-media")


def safe_path(relative_path: str = ".") -> Path:
    # Reject traversal and symlinks BEFORE resolving. Resolving first would hide
    # the symlink itself and make a later is_symlink() check ineffective.
    relative = Path(relative_path)
    if relative.is_absolute() or any(part == ".." for part in relative.parts):
        raise ValueError("Only relative paths inside the configured media root are permitted")
    current = ROOT
    for part in relative.parts:
        if part in ("", "."):
            continue
        current = current / part
        if current.is_symlink():
            raise ValueError("Symlinks are not permitted in the media root")
    candidate = current.resolve(strict=True)
    try:
        candidate.relative_to(ROOT)
    except ValueError as exc:
        raise ValueError("Path is outside the configured Bridge media root") from exc
    return candidate


def run_probe(path: Path) -> dict[str, Any]:
    command = ["ffprobe", "-v", "error", "-print_format", "json",
               "-show_format", "-show_streams", str(path)]
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode:
        raise RuntimeError(completed.stderr[-2000:] or "ffprobe failed")
    return json.loads(completed.stdout)


@mcp.tool()
def list_media_files(relative_directory: str = ".", limit: int = 100) -> dict[str, Any]:
    """List supported media files under the allowlisted folder; no recursive traversal."""
    directory = safe_path(relative_directory)
    if not directory.is_dir():
        raise ValueError("Requested path is not a directory")
    limit = max(1, min(int(limit), MAX_LIST_ITEMS))
    items = []
    for item in sorted(directory.iterdir(), key=lambda p: p.name.casefold()):
        if item.is_symlink() or not item.is_file() or item.suffix.lower() not in ALLOWED_SUFFIXES:
            continue
        stat = item.stat()
        items.append({"name": item.name, "relative_path": str(item.relative_to(ROOT)),
                      "size_bytes": stat.st_size, "modified_time": stat.st_mtime})
        if len(items) >= limit:
            break
    return {"root": str(ROOT), "items": items, "limit": limit}


@mcp.tool()
def inspect_media_file(relative_path: str) -> dict[str, Any]:
    """Read technical metadata with ffprobe. Does not change the source file."""
    path = safe_path(relative_path)
    if not path.is_file() or path.suffix.lower() not in ALLOWED_SUFFIXES:
        raise ValueError("Unsupported or missing media file")
    return {"relative_path": str(path.relative_to(ROOT)), "size_bytes": path.stat().st_size,
            "metadata": run_probe(path)}


@mcp.tool()
def checksum_media_file(relative_path: str) -> dict[str, Any]:
    """Calculate SHA-256 using bounded memory; source remains read-only."""
    path = safe_path(relative_path)
    if not path.is_file() or path.suffix.lower() not in ALLOWED_SUFFIXES:
        raise ValueError("Unsupported or missing media file")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return {"relative_path": str(path.relative_to(ROOT)),
            "size_bytes": path.stat().st_size, "sha256": digest.hexdigest()}


if __name__ == "__main__":
    mcp.run(transport="stdio")
