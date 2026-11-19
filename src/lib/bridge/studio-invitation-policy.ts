export type StudioInvitationPolicyInput = {
  invite: {
    email: string;
    expiresAt: string | Date;
    acceptedAt: string | Date | null;
    revokedAt: string | Date | null;
  } | null;
  verifiedEmail: string;
  emailVerified: boolean;
  now?: Date;
};

export function assertStudioInvitationAcceptable(input: StudioInvitationPolicyInput): void {
  const invite = input.invite;
  if (!invite || !input.emailVerified) {
    throw new Error("A verified matching account and valid Studio invitation are required");
  }

  const expiry = invite.expiresAt instanceof Date ? invite.expiresAt : new Date(invite.expiresAt);
  const now = input.now ?? new Date();
  if (!Number.isFinite(expiry.getTime()) || !Number.isFinite(now.getTime()) ||
      invite.acceptedAt !== null || invite.revokedAt !== null || expiry <= now) {
    throw new Error("Studio invitation is invalid, expired or already used");
  }

  const invitedEmail = invite.email.trim().toLocaleLowerCase("en-US");
  const accountEmail = input.verifiedEmail.trim().toLocaleLowerCase("en-US");
  if (!invitedEmail || !accountEmail || invitedEmail !== accountEmail) {
    throw new Error("Studio invitation email does not match this verified account");
  }
}
