import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { confirmEmailVerification } from "@/lib/bridge/profiles";
import { BrandMark } from "@/components/bridge/shell";

export const Route = createFileRoute("/verify-email")({ component: Verify });

function Verify() {
  const qc = useQueryClient();
  const token =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") ?? "" : "";
  const mut = useMutation({
    mutationFn: () => confirmEmailVerification({ data: { token } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["bridge-session"] });
    },
  });
  useEffect(() => {
    if (token && mut.status === "idle") mut.mutate();
  }, [token, mut]);

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-5 rounded-md border border-line bg-surface p-6">
        <BrandMark />
        <h1 className="font-display text-2xl">Email verification</h1>
        <p className="text-sm leading-relaxed text-muted">
          {mut.isPending && "Confirming…"}
          {mut.isSuccess && "Mailbox confirmed. Your Bridge desk can now open."}
          {mut.isError && (mut.error instanceof Error ? mut.error.message : "Link is invalid or expired.")}
          {!token && "Missing token."}
        </p>
        <Link to={mut.isSuccess ? "/creator" : "/onboarding"} className="text-sm text-accent underline-offset-4 hover:underline">
          {mut.isSuccess ? "Open creator desk" : "Continue"}
        </Link>
      </div>
    </main>
  );
}
