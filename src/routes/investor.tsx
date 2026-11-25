import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/investor")({ component: InvestorRedirect });

function InvestorRedirect() {
  return <Navigate to="/buyer-loop" />;
}
