import { existsSync, readFileSync } from "node:fs";

const output = ".vercel/output";
const configPath = `${output}/config.json`;
if (!existsSync(configPath)) throw new Error("Nitro Vercel output is missing");
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (!config.routes?.some((route) => route.dest === "/__server")) {
  throw new Error("Requests are not routed to the TanStack server");
}
if (!existsSync(`${output}/functions/__server.func/index.mjs`)) {
  throw new Error("TanStack server function is missing");
}
for (const path of ["index.html", "404.html"]) {
  if (existsSync(`${output}/static/${path}`)) {
    throw new Error(`Static ${path} would intercept the app routes`);
  }
}
console.log("Vercel output routes application pages to the TanStack server");
