export type CommandGroup = "supply" | "ops" | "revenue" | "security";

export type CommandCenter = {
  id: string;
  title: string;
  status: string;
  href: string;
  group: CommandGroup;
  kicker: string;
  action: string;
};

export const COMMAND_GROUPS: { id: CommandGroup; label: string }[] = [
  { id: "supply", label: "Content supply chain" },
  { id: "ops", label: "Platform operations" },
  { id: "revenue", label: "Revenue" },
  { id: "security", label: "Platform security" },
];

export const COMMAND_CENTERS: CommandCenter[] = [
  {
    id: "01",
    title: "Digital Titles",
    status: "HEALTHY",
    href: "/admin/titles",
    group: "supply",
    kicker: "Master video records, 2:3 posters, 16:9 backdrops.",
    action: "Manage",
  },
  {
    id: "02",
    title: "Media Processing",
    status: "INGEST READY",
    href: "/owner/workspace",
    group: "supply",
    kicker: "Adaptive HLS · 1080p · 720p · 480p master ladders. AWS S3 media bucket.",
    action: "Open",
  },
  {
    id: "03",
    title: "Rights & Territories",
    status: "ENFORCED",
    href: "/owner/workspace?tab=rights",
    group: "supply",
    kicker: "Worldwide distribution with territory rules (IN, AE, US, GB).",
    action: "Review",
  },
  {
    id: "04",
    title: "Quality Control",
    status: "LUFS -24",
    href: "/owner/workspace?tab=qc",
    group: "ops",
    kicker: "LUFS -24 audio normalization, black frame, and cadence verification.",
    action: "Open QC",
  },
  {
    id: "05",
    title: "AI & Localization",
    status: "READY",
    href: "/owner/supply-chain",
    group: "ops",
    kicker: "Multi-language subtitles, AI metadata translation, and vertical clips.",
    action: "Open Localization",
  },
  {
    id: "06",
    title: "Screeners & Sharing",
    status: "WATERMARKED",
    href: "/owner/sharing",
    group: "ops",
    kicker: "Buyer screeners with dynamic forensic watermarks & time-locks.",
    action: "Generate Link",
  },
  {
    id: "07",
    title: "Content Delivery",
    status: "EDGE",
    href: "/owner/transfers",
    group: "ops",
    kicker: "Edge distribution via stream.crayonsloop.com & cloud transfers.",
    action: "View Transfers",
  },
  {
    id: "08",
    title: "Plans & Monetization",
    status: "ACTIVE",
    href: "/admin/plans",
    group: "revenue",
    kicker: "SVOD + TVOD · ₹149 / ₹999 · ₹79 rent · ₹249 buy.",
    action: "Plans",
  },
  {
    id: "09",
    title: "Revenue & Settlements",
    status: "LEDGER",
    href: "/admin/revenue",
    group: "revenue",
    kicker: "65/35 studio waterfall & transaction audit trail.",
    action: "Ledger",
  },
  {
    id: "10",
    title: "Security & Playback",
    status: "FAIL-CLOSED ACTIVE",
    href: "/admin",
    group: "security",
    kicker: "Cryptographic playback tokens, signed media streams, zero-mock enforcement.",
    action: "Security Console",
  },
];
