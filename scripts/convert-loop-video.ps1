[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$InputFile,
    [Parameter(Mandatory = $true, Position = 1)]
    [ValidateNotNullOrEmpty()]
    [string]$OutputFile,
    [ValidateSet("ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower")]
    [string]$Preset = "medium",
    [ValidateRange(16, 30)]
    [int]$Crf = 20,
    [ValidateRange(96, 320)]
    [int]$AudioBitrateKbps = 192
)
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
    throw $Message
}

$tempPath = $null
try {
    $ffmpeg = Get-Command "ffmpeg" -ErrorAction SilentlyContinue
    $ffprobe = Get-Command "ffprobe" -ErrorAction SilentlyContinue
    if (-not $ffmpeg -or -not $ffprobe) { Fail "FFmpeg and FFprobe must both be installed and available on PATH." }

    $inputPath = (Resolve-Path -LiteralPath $InputFile -ErrorAction Stop).Path
    $inputItem = Get-Item -LiteralPath $inputPath
    if ($inputItem.PSIsContainer -or $inputItem.Length -le 0) { Fail "InputFile must be a non-empty file." }

    $outputFullPath = [System.IO.Path]::GetFullPath($OutputFile)
    if ([string]::Equals($inputPath, $outputFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        Fail "Input and output paths must differ. The source master is never overwritten."
    }
    if (Test-Path -LiteralPath $outputFullPath) { Fail "Output exists; refusing to overwrite: $outputFullPath" }

    $outputDirectory = [System.IO.Path]::GetDirectoryName($outputFullPath)
    if (-not (Test-Path -LiteralPath $outputDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }

    $inputProbeText = & $ffprobe.Source -v error -show_entries "format=duration:stream=codec_type" -of json $inputPath 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "FFprobe could not inspect the source file." }
    $inputProbe = ($inputProbeText -join [Environment]::NewLine) | ConvertFrom-Json
    $sourceDuration = [double]$inputProbe.format.duration
    if ($sourceDuration -le 0) { Fail "Source duration is missing or invalid." }
    $hasAudio = @($inputProbe.streams | Where-Object { $_.codec_type -eq "audio" }).Count -gt 0

    $tempPath = Join-Path $outputDirectory (".loop-convert-" + [guid]::NewGuid().ToString("N") + ".partial.mp4")
    Write-Host ("Source: {0} ({1:N2} GB)" -f $inputPath, ($inputItem.Length / 1GB))
    Write-Host ("Target: {0}" -f $outputFullPath)
    Write-Host "Encoding to a temporary file; the source master is never modified."

    $ffmpegArgs = @(
        "-hide_banner", "-nostdin", "-y",
        "-i", $inputPath,
        "-map", "0:v:0",
        "-map", "0:a?",
        "-map_metadata", "0",
        "-map_chapters", "0",
        "-c:v", "libx264",
        "-preset", $Preset,
        "-crf", "$Crf",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "$($AudioBitrateKbps)k",
        "-movflags", "+faststart",
        "-max_muxing_queue_size", "2048",
        $tempPath
    )
    & $ffmpeg.Source @ffmpegArgs
    if ($LASTEXITCODE -ne 0) { Fail "FFmpeg conversion failed; final output was not published." }
    if (-not (Test-Path -LiteralPath $tempPath -PathType Leaf)) { Fail "FFmpeg produced no output." }

    $outputProbeText = & $ffprobe.Source -v error -show_entries "format=duration:stream=codec_type,codec_name,width,height" -of json $tempPath 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "Output failed FFprobe validation." }
    $outputProbe = ($outputProbeText -join [Environment]::NewLine) | ConvertFrom-Json
    $outputDuration = [double]$outputProbe.format.duration
    $video = @($outputProbe.streams | Where-Object { $_.codec_type -eq "video" }) | Select-Object -First 1
    $audio = @($outputProbe.streams | Where-Object { $_.codec_type -eq "audio" })

    if (-not $video -or $video.codec_name -ne "h264") { Fail "Validation failed: H.264 video stream missing." }
    if ($hasAudio -and ($audio.Count -eq 0 -or $audio[0].codec_name -ne "aac")) { Fail "Validation failed: expected AAC audio missing." }
    if ([math]::Abs($sourceDuration - $outputDuration) -gt 1.0) {
        Fail ("Duration differs by more than 1 second ({0:N3}s vs {1:N3}s)." -f $sourceDuration, $outputDuration)
    }
    if ((Get-Item -LiteralPath $tempPath).Length -le 0) { Fail "Output file is empty." }
    if (Test-Path -LiteralPath $outputFullPath) { Fail "Output appeared during conversion; refusing to overwrite it." }

    Move-Item -LiteralPath $tempPath -Destination $outputFullPath
    $tempPath = $null
    $finalItem = Get-Item -LiteralPath $outputFullPath
    Write-Host "PASS: conversion and FFprobe technical checks completed."
    Write-Host ("Duration: {0:N3}s (source {1:N3}s)" -f $outputDuration, $sourceDuration)
    Write-Host ("Video: H.264 {0}x{1}" -f $video.width, $video.height)
    Write-Host ("Audio: {0}" -f $(if ($audio.Count -gt 0) { "AAC" } else { "No audio stream in source" }))
    Write-Host ("Output: {0} ({1:N2} GB)" -f $outputFullPath, ($finalItem.Length / 1GB))
    Write-Host "Playback/QC review is still required before Bridge approval or Loop publication."
}
catch {
    Write-Error $_
    exit 1
}
finally {
    if ($tempPath -and (Test-Path -LiteralPath $tempPath)) {
        Write-Warning "Incomplete temporary output retained for diagnosis: $tempPath"
    }
}
