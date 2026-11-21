import type { TitleStatus } from "./types.ts";

export type CreatorTitleLifecycleSnapshot = {
  status: TitleStatus;
  submissionStatus: "DRAFT" | "SUBMITTED";
  deletedAt?: string | Date | null;
  submissionType?: string | null;
};

export function assertCreatorTitleCanSubmit(
  title: CreatorTitleLifecycleSnapshot,
  metadata: {
    name: string;
    synopsis: string;
    language: string;
    countryOfOrigin: string | null;
    year: number | null;
    runtimeMinutes: number | null;
  },
) {
  if (title.deletedAt) throw new Error("This draft is archived and cannot be submitted.");
  if (title.submissionType === "story_concept") {
    throw new Error("Story / Concept submissions use their separate curation workflow.");
  }
  if (title.status !== "DRAFT") throw new Error("Only a DRAFT title can be submitted to Bridge.");
  if (title.submissionStatus !== "DRAFT") throw new Error("This title has already been submitted to Bridge.");
  if (
    !metadata.name.trim() ||
    metadata.synopsis.trim().length < 20 ||
    metadata.language.trim().length < 2 ||
    !metadata.countryOfOrigin?.trim() ||
    metadata.year === null ||
    metadata.runtimeMinutes === null
  ) {
    throw new Error("Complete title name, synopsis (20+ characters), original language, country, release year and runtime before submitting.");
  }
}

export function assertCreatorTitleCanBeSoftDeleted(
  title: CreatorTitleLifecycleSnapshot,
  hasAssets: boolean,
) {
  if (title.deletedAt) throw new Error("This draft is already archived.");
  if (title.status !== "DRAFT" || title.submissionStatus !== "DRAFT") {
    throw new Error("Only an unsubmitted DRAFT can be archived.");
  }
  if (title.submissionType === "story_concept") {
    throw new Error("Story / Concept records must be managed from Story Concepts.");
  }
  if (hasAssets) {
    throw new Error("This draft has uploaded assets. Contact Bridge support so files can be safely reconciled before archiving.");
  }
}
