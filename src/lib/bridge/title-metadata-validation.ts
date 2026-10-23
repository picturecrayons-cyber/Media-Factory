import { z } from "zod";

/**
 * Validation contract for the metadata-first draft creation path.
 * This schema is enforced by the server function, not only by HTML form controls.
 * Rights, legal approval, QC and publication authorization are intentionally excluded.
 */
export const metadataFirstTitleSchema = z.object({
  name: z.string().trim().min(1).max(160),
  nameMl: z.string().trim().max(160).optional(),
  synopsis: z.string().trim().min(20).max(4000),
  language: z.string().trim().min(2).max(40),
  year: z.number().int().min(1895).max(2100),
  runtimeMinutes: z.number().int().min(1).max(600),
  director: z.string().trim().min(1).max(160),
  producer: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(80),
  countryOfOrigin: z.string().trim().max(80).optional(),
  releaseDate: z.string().max(40).optional(),
  licensingFeePaise: z.number().int().min(0).max(2_000_000_000).optional(),
  cast: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
});

export type MetadataFirstTitleInput = z.infer<typeof metadataFirstTitleSchema>;
