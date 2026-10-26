import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "Crayons Bridge";
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#ffffff" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      {
        name: "description",
        content: "Crayons Bridge. Titles, files, and approvals.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: APP_NAME },
      { property: "og:title", content: APP_NAME },
      {
        property: "og:description",
        content: "Crayons Bridge. Titles, files, and approvals.",
      },
      { property: "og:url", content: "https://crayonspictures.in/" },
      { property: "og:image", content: "https://crayonspictures.in/og.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Crayons Bridge" },
      {
        name: "twitter:description",
        content:
          "Crayons Bridge. Titles, files, and approvals.",
      },
      { name: "twitter:image", content: "https://crayonspictures.in/og.jpg" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
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
            <Toaster
              theme="light"
              position="top-center"
              closeButton
              toastOptions={{
                style: {
                  background: "#ffffff",
                  color: "#0b1220",
                  border: "2px solid #0b1220",
                  borderRadius: "16px",
                  fontSize: "15px",
                  fontWeight: 600,
                },
              }}
            />
          </AuthProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  ),
});
