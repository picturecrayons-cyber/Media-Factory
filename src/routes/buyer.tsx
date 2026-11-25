import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/buyer")({ component: BuyerRedirect });

function BuyerRedirect() {
  return <Navigate to="/buyer-loop" />;
}
