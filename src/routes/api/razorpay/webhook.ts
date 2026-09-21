import { createFileRoute } from "@tanstack/react-router";
import { ingestRazorpayWebhook } from "@/lib/bridge/payments";

export const Route = createFileRoute("/api/razorpay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get("x-razorpay-signature");
        try {
          const result = await ingestRazorpayWebhook(raw, signature);
          return Response.json(result);
        } catch {
          return Response.json({ error: "Webhook rejected" }, { status: 401 });
        }
      },
    },
  },
});
