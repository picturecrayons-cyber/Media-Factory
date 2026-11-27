export type VendorJobsActor = {
  emailVerified: boolean;
  internalRole: string | null;
};

export function assertVendorJobsSuperAdmin(actor: VendorJobsActor): void {
  if (!actor.emailVerified || actor.internalRole !== "super_admin") {
    throw new Error("Only the verified Bridge Super Admin may access Vendor Jobs");
  }
}
