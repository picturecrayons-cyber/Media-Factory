export type LoopAccessTier = "FREE" | "SVOD" | "TVOD";

export type LoopTitle = {
  id: string;
  bridgeTitleId: string | null;
  slug: string;
  title: string;
  synopsis: string;
  description: string;
  contentType: string;
  language: string;
  year: number | null;
  durationMinutes: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  playbackPath: string | null;
  maturityRating: string;
  genres: string[];
  accessTier: LoopAccessTier;
  tvodRentalPrice: number;
  tvodPurchasePrice: number;
  featured: boolean;
  published: boolean;
  authorizationStatus?: string;
  windowStart?: string | null;
  windowEnd?: string | null;
};

export type LoopProfile = {
  id: string;
  userId: string;
  name: string;
  kind: "adult" | "kids";
  isActive: boolean;
  pin: string;
  avatar: string;
  createdAt: string;
};

export type LoopWatchProgress = {
  loopTitleId: string;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: string;
};

export type LoopSubscription = {
  planKey: string;
  name: string;
  status: "active" | "expired" | "none";
  priceInr: number;
  startedAt: string | null;
  expiresAt: string | null;
};

export type ConsumerEntitlement = {
  loopTitleId: string;
  accessType: "SVOD_SUBSCRIPTION" | "TVOD_RENTAL" | "TVOD_PURCHASE" | "FREE";
  expiresAt: string | null;
  canPlay: boolean;
};
