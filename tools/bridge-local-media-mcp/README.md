# Bridge Local Media MCP (Windows)

This is a **local workstation helper**, not a Vercel/serverless component.
It exposes three read-only MCP tools: `list_media_files`,
`inspect_media_file`, and `checksum_media_file`.

## Safety boundary

- Default root: `F:\\new 17 - june\\`; configure only with
  `BRIDGE_MEDIA_ROOT` if the owner deliberately changes the allowlisted root.
- Relative paths are resolved and checked to remain inside that root.
- Symlinks are rejected. Only known video extensions are exposed.
- No arbitrary shell tool, file write/delete, upload, network listener, or OCI key.
- The only subprocess is a fixed-argument `ffprobe` invocation (no shell).
- Run over MCP stdio from a trusted local desktop host.

## Windows setup

1. Install FFmpeg and ensure `ffprobe.exe` is on PATH.
2. Create a virtual environment in this folder:
   `py -m venv .venv`
3. Activate it and install:
   `pip install -r requirements.txt`
4. Configure the MCP host to launch `python <absolute-path>\\server.py`
   with working directory set to this folder.
5. Test with the sample MOV. Confirm listing, metadata and SHA-256 only.

Do not put source masters in Git, Linear, or the deployed web app. Do not
start a bulk transfer until Bridge issues an authenticated, short-lived upload
session and the owner approves the transfer.

## Current limitation

This initial connector is read-only. Bridge upload-session integration is a
separate server-side feature: the local process must never receive OCI private
keys or long-lived Bridge credentials.
