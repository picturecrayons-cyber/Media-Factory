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
        } catch (error) {
          // A valid signed event with a transient persistence failure must get a retry.
          const invalidSignature = error instanceof Error && error.message === "Invalid webhook signature";
          return Response.json(
            { error: invalidSignature ? "Invalid webhook signature" : "Webhook processing failed" },
            { status: invalidSignature ? 401 : 503 },
          );
        }
      },
    },
  },
});
