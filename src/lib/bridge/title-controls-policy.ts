export type TitleControlState = "CLEAR" | "HOLD" | "BLOCK";

export function assertTitleControlClear(state: TitleControlState | null | undefined): void {
  if (state === "HOLD") throw new Error("TITLE_ON_HOLD: Super Admin must release the operational hold before proceeding.");
  if (state === "BLOCK") throw new Error("TITLE_BLOCKED: Super Admin must unblock this title before proceeding.");
}
