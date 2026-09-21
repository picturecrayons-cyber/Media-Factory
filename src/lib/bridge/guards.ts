/** Bridge never treats the preview fallback identity as an authorized actor. */
export const BRIDGE_DEV_USER_ID = "dev-user";
export const DEV_BLOCK = "Mock/dev authorization is disabled for Crayons Bridge";

export function assertNotDevUser(userId: string) {
  if (userId === BRIDGE_DEV_USER_ID) throw new Error(DEV_BLOCK);
}
