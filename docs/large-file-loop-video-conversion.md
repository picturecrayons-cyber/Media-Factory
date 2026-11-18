# Large-file video conversion for Crayons Loop

This is a **local Windows workstation utility**, not a Vercel/serverless job. It avoids browser upload limits such as the 4 GB limit shown by 123APPS and does not upload the source or output anywhere.

## Safety contract

- The source master is read-only: input and output paths must differ.
- Existing output files are never overwritten.
- Encoding happens to a uniquely named temporary MP4 in the output directory. The final filename is created only after FFprobe checks pass.
- An interrupted/failed encode may leave a `.partial.mp4` file for diagnosis; it is never treated as a completed deliverable.
- The script does not upload, publish, alter Bridge records, or call Loop/Gateway APIs.
- A technical PASS is not editorial/QC approval. Review playback, picture, audio, subtitles, language, and rights before Bridge approval or Loop publication.

## Prerequisites

Install a trusted Windows FFmpeg build that includes both `ffmpeg.exe` and `ffprobe.exe`, and ensure both are on PATH. Open a new PowerShell window and verify:

```powershell
ffmpeg -version
ffprobe -version
```

Ensure the destination drive has sufficient free space for the output and temporary file. Large-file encoding can take many hours and is CPU/disk intensive.

## Convert

Run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\convert-loop-video.ps1 `
  -InputFile "D:\Media\Original-Master-37GB.mov" `
  -OutputFile "D:\Media\Loop-Deliverables\TITLE_LANGUAGE_H264_AAC.mp4"
```

Optional quality/speed settings:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\convert-loop-video.ps1 `
  -InputFile "D:\Media\Original-Master-37GB.mov" `
  -OutputFile "D:\Media\Loop-Deliverables\TITLE_LANGUAGE_H264_AAC.mp4" `
  -Preset faster -Crf 20 -AudioBitrateKbps 192
```

Defaults: H.264 (libx264), CRF 20, medium preset, yuv420p, AAC 192 kb/s, MP4 fast-start metadata. The first video stream and all audio streams are mapped; source metadata and chapters are retained. Subtitle/data streams are not included and must be handled separately if required for the title.

## Verification and release boundary

The script checks that:
1. FFprobe can read the source and output.
2. The output contains H.264 video.
3. If the source has audio, the output contains AAC audio.
4. Output duration is within one second of source duration.
5. Output is non-empty and the final path did not already exist.

Then perform a full playback/QC review. Record source filename/size, output filename/size, duration, resolution, audio/language checks, operator, and QC result in the Bridge title workflow. Only an independently approved deliverable may proceed through Bridge publication authorization and the Gateway. This script does not certify that a file is rights-cleared or publication-ready.
