import { createFileRoute } from "@tanstack/react-router";
import { RightsReadySubmissionForm } from "@/components/bridge/rights-ready-submission-form";

export const Route = createFileRoute("/submit-film")({
  component: () => <RightsReadySubmissionForm />,
});
