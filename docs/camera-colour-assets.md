# Camera & Colour Asset Integration

This inventory covers the nine camera and colour files supplied for the Loop and Bridge workflows. The files are catalogued here; the original binary assets are intentionally not committed to the application repository.

## Inventory

| File | Type | Group | Intended use |
|---|---|---|---|
| `-1_PrintFilmLUT.cube` | 3D LUT | Creative look | Film-print-style preview or grading |
| `D4019_ARRI LOG-REC709.cube` | 3D LUT | Display transform | ARRI Log to Rec.709 monitoring |
| `D4020_ARRI LOG-REC709_33x.cube` | 3D LUT | Display/look transform | Compatible ARRI Log / Rec.709 workflow |
| `D4020_ARRI_-1.aml` | ARRI look file | Camera look | Compatible ARRI look workflow; variation -1 |
| `D4020_ARRI_+0.aml` | ARRI look file | Camera look | Compatible ARRI look workflow; variation +0 |
| `ALF_LF-OG_4.5K_1.0.xml` | XML | Frame lines | ALEXA LF Open Gate framing configuration |
| `ALF_LF-OG_4.5K_1.0-JSJ-50.xml` | XML | Frame lines | Same framing family, 50% outside-frame shading |
| `ALF_LF-OG_4.5K_1.0-JSJ-75.xml` | XML | Frame lines | Same framing family, 75% outside-frame shading |
| `ALF_LF-OG_4.5K_1.0-JSJ-100.xml` | XML | Frame lines | Same framing family, 100% outside-frame shading |

## Integration rules

- Treat these as a reusable camera/colour asset library, not as footage or media masters.
- Keep original files in private, access-controlled object storage or an approved asset repository. Do not expose licensed or proprietary look files through a public static folder.
- Store metadata separately: original filename, checksum, format, camera/model compatibility, colour-space assumptions, owner/licence, and storage object key.
- Validate file signatures and parse formats server-side before accepting user uploads.
- For LUT previews, apply the transform to a review proxy or preview stream; preserve the original source media.
- Treat ARRI `.aml` files as vendor-specific. Do not claim support until compatibility is verified against the intended ARRI tools/camera firmware.
- Treat frame-line XML as monitoring/framing metadata. Do not use it to crop or alter the source recording automatically.
- Keep LUT preview transforms distinct from delivery/mastering colour-management settings.

## Release boundary

This branch contains integration documentation only. It does not activate the assets in the UI, modify Supabase, change Vercel settings, or deploy to production. Those steps require implementation against the existing application components and verified private asset storage.
