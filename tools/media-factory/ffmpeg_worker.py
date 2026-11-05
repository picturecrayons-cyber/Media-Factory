#!/usr/bin/env python3
"""Cost-aware local FFmpeg worker: probe, QC, and VOD HLS package.

The source is never modified. Outputs are written to a new directory.
This worker does not upload, publish, encrypt, or claim DRM compatibility.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {result.stderr[-3000:]}")
    return result


def probe(source: Path) -> dict:
    result = run(["ffprobe", "-v", "error", "-print_format", "json",
                  "-show_format", "-show_streams", str(source)])
    return json.loads(result.stdout)


def qc(source: Path, output: Path) -> dict:
    black = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(source), "-vf",
         "blackdetect=d=2:pix_th=0.10", "-an", "-f", "null", "-"],
        capture_output=True, text=True, check=False)
    silence = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(source), "-vn", "-af",
         "silencedetect=noise=-50dB:d=2", "-f", "null", "-"],
        capture_output=True, text=True, check=False)
    loudness = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(source), "-vn", "-af",
         "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True, check=False)
    report = {
        "blackdetect_log": black.stderr[-12000:],
        "silencedetect_log": silence.stderr[-12000:],
        "loudness_log": loudness.stderr[-6000:],
        "exit_codes": {"blackdetect": black.returncode, "silencedetect": silence.returncode,
                       "loudness": loudness.returncode},
        "note": "Detections are review flags, not automatic editorial rejection.",
    }
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def make_hls(source: Path, output_dir: Path, metadata: dict) -> None:
    video = next((s for s in metadata["streams"] if s.get("codec_type") == "video"), None)
    audio = next((s for s in metadata["streams"] if s.get("codec_type") == "audio"), None)
    if not video or not audio:
        raise ValueError("A video stream and an audio stream are required")
    width = int(video.get("width") or 0)
    height = int(video.get("height") or 0)
    if width < 2 or height < 2:
        raise ValueError("Invalid source dimensions")

    # Only generate renditions no larger than the source. Avoid upscaling and
    # omit duplicate-sized variants for low-resolution masters.
    profiles = [(1920, 1080, 4000), (1280, 720, 2200), (854, 480, 1000)]
    profiles = [(w, h, rate) for w, h, rate in profiles if h <= height]
    if not profiles:
        profiles = [(min(width, 640), min(height, 360), 600)]
    output_dir.mkdir(parents=True, exist_ok=True)

    split_labels = "".join(f"[v{i}]" for i in range(len(profiles)))
    filters = [f"[0:v:0]split={len(profiles)}{split_labels}"]
    for i, (w, h, _) in enumerate(profiles):
        filters.append(
            f"[v{i}]scale=w={w}:h={h}:force_original_aspect_ratio=decrease:"
            f"force_divisible_by=2,setsar=1[vout{i}]"
        )
    cmd = ["ffmpeg", "-hide_banner", "-y", "-i", str(source),
           "-filter_complex", ";".join(filters)]
    var_maps = []
    for i, (_, _, rate) in enumerate(profiles):
        cmd += ["-map", f"[vout{i}]", "-map", "0:a:0",
                f"-c:v:{i}", "libx264", f"-b:v:{i}", f"{rate}k",
                f"-maxrate:v:{i}", f"{int(rate * 1.07)}k",
                f"-bufsize:v:{i}", f"{rate * 2}k",
                f"-preset:v:{i}", "medium",
                f"-profile:v:{i}", "high",
                f"-g:v:{i}", "48", f"-keyint_min:v:{i}", "48",
                f"-sc_threshold:v:{i}", "0",
                f"-c:a:{i}", "aac", f"-b:a:{i}", "128k",
                f"-ac:a:{i}", "2"]
        var_maps.append(f"v:{i},a:{i},name:{profiles[i][1]}p")
    cmd += ["-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
            "-hls_segment_type", "fmp4", "-hls_flags", "independent_segments",
            "-master_pl_name", "master.m3u8", "-var_stream_map", " ".join(var_maps),
            "-hls_segment_filename", str(output_dir / "seg_%v_%05d.m4s"),
            str(output_dir / "v%v.m3u8")]
    run(cmd)

    master = output_dir / "master.m3u8"
    if not master.exists() or "#EXTM3U" not in master.read_text(encoding="utf-8"):
        raise RuntimeError("HLS master playlist missing or invalid")
    for playlist in output_dir.glob("v*.m3u8"):
        text = playlist.read_text(encoding="utf-8")
        if "#EXTM3U" not in text or "#EXTINF" not in text:
            raise RuntimeError(f"Invalid variant playlist: {playlist.name}")
    if not list(output_dir.glob("*.m4s")):
        raise RuntimeError("No fMP4 segments were generated")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    output = args.output.resolve()
    if not source.is_file() or source == output or source in output.parents:
        raise ValueError("Source must be a file and output must be a separate location")
    output.mkdir(parents=True, exist_ok=True)

    metadata = probe(source)
    (output / "probe.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    report = qc(source, output / "technical-qc.json")
    make_hls(source, output / "hls", metadata)
    summary = {
        "source": source.name,
        "source_bytes": source.stat().st_size,
        "duration_seconds": float(metadata.get("format", {}).get("duration") or 0),
        "video_codec": next(s.get("codec_name") for s in metadata["streams"] if s.get("codec_type") == "video"),
        "audio_codec": next(s.get("codec_name") for s in metadata["streams"] if s.get("codec_type") == "audio"),
        "qc_exit_codes": report["exit_codes"],
        "hls_master": "hls/master.m3u8",
        "status": "REQUIRES_HUMAN_QC",
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
