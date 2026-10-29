import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import appCss from "../styles.css?url";

const APP_NAME = "Crayons Bridge";
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#0b0a09" },
      {
        name: "description",
        content:
          "Crayons Bridge — title record, rights, and licensing OS. StreamVista OPC Pvt Ltd.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Crayons Bridge" },
      { property: "og:title", content: "Crayons Bridge" },
      {
        property: "og:description",
        content:
          "Upload, prepare, license, deliver, and earn with Crayons Bridge — the media supply chain, rights, and licensing OS from StreamVista OPC Pvt Ltd.",
      },
      { property: "og:url", content: "https://crayonspictures.in/" },
      { property: "og:image", content: "https://crayonspictures.in/og.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Crayons Bridge" },
      {
        name: "twitter:description",
        content:
          "Upload, prepare, license, deliver, and earn with Crayons Bridge.",
      },
      { name: "twitter:image", content: "https://crayonspictures.in/og.jpg" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg antialiased">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Outlet />
            <Toaster theme="dark" position="bottom-center" />
          </AuthProvider>
        </QueryClientProvider>
        <Analytics />
        <Scripts />
      </body>
    </html>
  ),
});
