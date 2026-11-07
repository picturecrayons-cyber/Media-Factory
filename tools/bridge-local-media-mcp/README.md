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


## Bridge upload-session security boundary

The local MCP remains read-only and never receives OCI credentials. For browser-based
Bridge multipart transfers, the Bridge server now issues a short-lived HMAC-signed
session capability bound to the authenticated actor, asset row, object key, OCI
multipart upload ID, and exact OCI part URL. Commit/abort requests must present
that server-issued capability; callers cannot substitute an arbitrary multipart
URL. Configure `BRIDGE_UPLOAD_SESSION_SECRET` as a server-only secret with at
least 32 random bytes in an isolated non-production environment before exercising
this path. Do not add it to VITE_ variables, the local MCP process, source control,
or public client configuration.

This code change does not create a database table or write schema. Durable job
history, revocation across devices, and session recovery after browser storage loss
still require a separately reviewed persistent-session design and DB approval.
