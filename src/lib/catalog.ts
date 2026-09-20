export type AccessTier = "FREE" | "SVOD" | "TVOD";
export type TitleStatus = "PUBLISHED" | "DRAFT";
export type ContentType = "Film" | "Short Film";

export type Title = {
  id: string;
  slug: string;
  title: string;
  director: string | null;
  cast: string | null;
  synopsis: string;
  description: string;
  contentType: ContentType;
  language: string;
  year: number;
  durationMinutes: number;
  maturityRating: string;
  status: TitleStatus;
  accessTier: AccessTier;
  published: boolean;
  featured: boolean;
  isOriginal: boolean;
  isTvodEnabled: boolean;
  tvodRentalPrice: number;
  tvodPurchasePrice: number;
  posterPath: string;
  backdropPath: string;
  hlsReady: boolean;
  genres: string[];
};

export const PLANS = [
  {
    key: "monthly",
    name: "Loop Monthly Pass",
    priceInr: 149,
    period: "mo",
    blurb: "Unlimited access to the curated Malayalam festival catalog & original films.",
    features: [
      "2 concurrent devices",
      "Ad-free cinema experience",
      "Mobile + web",
      "Cancel anytime",
    ],
  },
  {
    key: "annual",
    name: "Loop Annual Pass",
    priceInr: 999,
    period: "yr",
    blurb: "12-month VIP cinema pass with master 4K UHD transfers and early festival premieres.",
    features: [
      "4 concurrent devices",
      "Dolby Atmos where mastered",
      "Priority digital premiere access",
      "Over 44% annual savings",
      "Direct studio partner support",
    ],
    badge: "Best value",
  },
] as const;

export const TVOD = {
  rent: 79,
  buy: 249,
  rentWindowHours: 48,
} as const;

export const CATALOG: Title[] = [
  {
    id: "jananam-1947-pranayam-thudarunnu",
    slug: "jananam-1947-pranayam-thudarunnu",
    title: "Jananam 1947 Pranayam Thudarunnu",
    director: "Abijith Asokan",
    cast: "Kozhikode Jayaraj, Leela Samson",
    synopsis:
      "A poignant Malayalam drama tracing love, aging, dignity, and companionship late in life.",
    description:
      "An acclaimed Crayons Original exploring an elderly couple’s delicate bond, resilience, and unconditional companionship.",
    contentType: "Film",
    language: "Malayalam",
    year: 2024,
    durationMinutes: 115,
    maturityRating: "U",
    status: "PUBLISHED",
    accessTier: "TVOD",
    published: true,
    featured: true,
    isOriginal: true,
    isTvodEnabled: true,
    tvodRentalPrice: 79,
    tvodPurchasePrice: 249,
    posterPath: "/posters/jananam.jpg",
    backdropPath: "/backdrops/jananam.jpg",
    hlsReady: true,
    genres: ["Drama", "Crayons Original", "Festival"],
  },
  {
    id: "pranayam-1947",
    slug: "pranayam-1947",
    title: "PRANAYAM 1947 (Telugu)",
    director: "Abijith Asokan",
    cast: "Kozhikode Jayaraj, Leela Samson",
    synopsis:
      "Telugu master presentation of the same late-life love story, transferred in H.264 cinema grade.",
    description:
      "An elderly couple’s delicate bond and unexpected companionship — Telugu master.",
    contentType: "Film",
    language: "Telugu",
    year: 2024,
    durationMinutes: 106,
    maturityRating: "U",
    status: "PUBLISHED",
    accessTier: "SVOD",
    published: true,
    featured: true,
    isOriginal: true,
    isTvodEnabled: true,
    tvodRentalPrice: 79,
    tvodPurchasePrice: 249,
    posterPath: "/posters/pranayam-1947.jpg",
    backdropPath: "/backdrops/jananam.jpg",
    hlsReady: true,
    genres: ["Drama", "Telugu", "Festival"],
  },
  {
    id: "alis-nature",
    slug: "alis-nature",
    title: "Ali's Nature",
    director: null,
    cast: null,
    synopsis:
      "A deep environmental journey into human instinct, raw nature, and ecological harmony.",
    description:
      "An evocative independent film exploring solitude and the untamed beauty of landscape through Ali’s eyes.",
    contentType: "Film",
    language: "Malayalam",
    year: 2024,
    durationMinutes: 87,
    maturityRating: "U",
    status: "DRAFT",
    accessTier: "SVOD",
    published: false,
    featured: false,
    isOriginal: true,
    isTvodEnabled: true,
    tvodRentalPrice: 79,
    tvodPurchasePrice: 249,
    posterPath: "/posters/alis-nature.jpg",
    backdropPath: "/posters/alis-nature.jpg",
    hlsReady: true,
    genres: ["Nature", "Indie"],
  },
  {
    id: "bahumukham",
    slug: "bahumukham",
    title: "Bahumukham — Good, Bad & The Actor",
    director: null,
    cast: null,
    synopsis:
      "A psychological suspense drama following an actor confronting ambition, identity, and inner demons.",
    description:
      "A layered drama unraveling the fracture of an artist driven to extremes.",
    contentType: "Film",
    language: "Malayalam",
    year: 2024,
    durationMinutes: 87,
    maturityRating: "U/A 16+",
    status: "DRAFT",
    accessTier: "SVOD",
    published: false,
    featured: true,
    isOriginal: true,
    isTvodEnabled: true,
    tvodRentalPrice: 79,
    tvodPurchasePrice: 249,
    posterPath: "/posters/bahumukham.jpg",
    backdropPath: "/posters/bahumukham.jpg",
    hlsReady: true,
    genres: ["Thriller", "Psychological"],
  },
  {
    id: "shri-balaji-photo-studio",
    slug: "shri-balaji-photo-studio",
    title: "Shri Balaji Photo Studio",
    director: null,
    cast: null,
    synopsis:
      "A small-town photo studio capturing generations of untold stories, joy, and memory.",
    description:
      "A nostalgic journey of love and friendship centered on a quaint local studio.",
    contentType: "Film",
    language: "Malayalam",
    year: 2023,
    durationMinutes: 147,
    maturityRating: "U",
    status: "DRAFT",
    accessTier: "SVOD",
    published: false,
    featured: false,
    isOriginal: true,
    isTvodEnabled: true,
    tvodRentalPrice: 79,
    tvodPurchasePrice: 249,
    posterPath: "/posters/shri-balaji-photo-studio.jpg",
    backdropPath: "/posters/shri-balaji-photo-studio.jpg",
    hlsReady: true,
    genres: ["Drama", "Nostalgia"],
  },
  {
    id: "aandaal",
    slug: "aandaal",
    title: "Aandaal",
    director: null,
    cast: null,
    synopsis:
      "Resilience, tradition, and devotion against a changing social landscape.",
    description:
      "Faith, family legacy, and womanhood, crafted with deep cultural resonance.",
    contentType: "Film",
    language: "Malayalam",
    year: 2024,
    durationMinutes: 115,
    maturityRating: "U",
    status: "DRAFT",
    accessTier: "SVOD",
    published: false,
    featured: false,
    isOriginal: true,
    isTvodEnabled: true,
    tvodRentalPrice: 79,
    tvodPurchasePrice: 249,
    posterPath: "/posters/aandaal.jpg",
    backdropPath: "/posters/aandaal.jpg",
    hlsReady: true,
    genres: ["Drama", "Faith"],
  },
  {
    id: "imran-3-185",
    slug: "imran-3-185",
    title: "Imran 3:185",
    director: null,
    cast: null,
    synopsis:
      "A cinematic reflection on fate, destiny, and the impermanence of mortal life.",
    description:
      "A meditative Malayalam film exploring existential themes with stark visual composition.",
    contentType: "Film",
    language: "Malayalam",
    year: 2024,
    durationMinutes: 110,
    maturityRating: "U/A",
    status: "DRAFT",
    accessTier: "SVOD",
    published: false,
    featured: false,
    isOriginal: true,
    isTvodEnabled: true,
    tvodRentalPrice: 79,
    tvodPurchasePrice: 249,
    posterPath: "/posters/imran-3-185.jpg",
    backdropPath: "/posters/imran-3-185.jpg",
    hlsReady: true,
    genres: ["Meditation", "Drama"],
  },
  {
    id: "kombal",
    slug: "kombal",
    title: "Kombal",
    director: null,
    cast: null,
    synopsis:
      "A raw Kerala drama on the wild edge of rural culture, forest lore, and survival.",
    description:
      "Set against the deep woodlands of Kerala — instinct, land, and human will.",
    contentType: "Short Film",
    language: "Malayalam",
    year: 2024,
    durationMinutes: 19,
    maturityRating: "U",
    status: "DRAFT",
    accessTier: "FREE",
    published: false,
    featured: false,
    isOriginal: true,
    isTvodEnabled: false,
    tvodRentalPrice: 79,
    tvodPurchasePrice: 249,
    posterPath: "/posters/kombal.jpg",
    backdropPath: "/posters/kombal.jpg",
    hlsReady: true,
    genres: ["Short", "Rural"],
  },
  {
    id: "jamalinte-punchiri",
    slug: "jamalinte-punchiri",
    title: "Jamalinte Punchiri (Jamal's Smile)",
    director: null,
    cast: null,
    synopsis:
      "Optimism, quirks, and resilience of Jamal in a close-knit coastal hamlet.",
    description:
      "A social comedy-drama celebrating local spirit and unyielding human dignity.",
    contentType: "Film",
    language: "Malayalam",
    year: 2024,
    durationMinutes: 138,
    maturityRating: "U",
    status: "DRAFT",
    accessTier: "SVOD",
    published: false,
    featured: false,
    isOriginal: true,
    isTvodEnabled: true,
    tvodRentalPrice: 79,
    tvodPurchasePrice: 249,
    posterPath: "/posters/jamalinte-punchiri.jpg",
    backdropPath: "/posters/jamalinte-punchiri.jpg",
    hlsReady: true,
    genres: ["Comedy", "Family"],
  },
  {
    id: "the-second-home",
    slug: "the-second-home",
    title: "The Second Home",
    director: null,
    cast: null,
    synopsis:
      "Childhood, school days, and the bittersweet transition of growing up in Kerala.",
    description:
      "A nostalgic short invoking youthful friendships, classrooms, and innocence.",
    contentType: "Short Film",
    language: "Malayalam",
    year: 2024,
    durationMinutes: 8,
    maturityRating: "U",
    status: "DRAFT",
    accessTier: "FREE",
    published: false,
    featured: false,
    isOriginal: true,
    isTvodEnabled: false,
    tvodRentalPrice: 79,
    tvodPurchasePrice: 249,
    posterPath: "/posters/the-second-home.jpg",
    backdropPath: "/posters/the-second-home.jpg",
    hlsReady: true,
    genres: ["Short", "Kids", "Family"],
  },
  {
    id: "ama",
    slug: "ama",
    title: "Ama",
    director: null,
    cast: null,
    synopsis:
      "A poetic tribute to motherhood woven through minimal dialogue and natural light.",
    description:
      "Silent sacrifice, maternal affection, and peace — an independent short.",
    contentType: "Short Film",
    language: "Malayalam",
    year: 2024,
    durationMinutes: 7,
    maturityRating: "U",
    status: "DRAFT",
    accessTier: "FREE",
    published: false,
    featured: false,
    isOriginal: true,
    isTvodEnabled: false,
    tvodRentalPrice: 79,
    tvodPurchasePrice: 249,
    posterPath: "/posters/ama.jpg",
    backdropPath: "/posters/ama.jpg",
    hlsReady: true,
    genres: ["Short", "Kids", "Family"],
  },
];

export function formatRuntime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function isKidsSafe(t: Title) {
  const r = t.maturityRating.toUpperCase();
  return r === "U" || r.startsWith("U ");
}
