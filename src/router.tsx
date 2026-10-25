import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";
 
// Ignore only the known Chrome-extension "disconnected port" noise.
// Do not suppress general unhandled rejections or application errors.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const message =
      event.reason instanceof Error
        ? event.reason.message
        : typeof event.reason === "string"
          ? event.reason
          : "";
    if (
      message.includes("disconnected port object") ||
      message.includes("Extension context invalidated")
    ) {
      event.preventDefault();
    }
  });

  window.addEventListener("error", (event) => {
    if (
      event.filename?.includes("toolbar.js") ||
      event.message.includes("disconnected port object") ||
      event.message.includes("Extension context invalidated")
    ) {
      event.preventDefault();
    }
  });
}


export function getRouter() {
  return createRouter({ routeTree, defaultErrorComponent: AppErrorComponent });
}
