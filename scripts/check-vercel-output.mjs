import { existsSync, readFileSync } from "node:fs";

const output = ".vercel/output";
const configPath = `${output}/config.json`;
if (!existsSync(configPath)) throw new Error("Vercel output config is missing");

const config = JSON.parse(readFileSync(configPath, "utf8"));
if (!config.routes?.some((route) => route.dest === "/__server")) {
  throw new Error("Vercel output does not route requests to the TanStack server");
}
if (!existsSync(`${output}/functions/__server.func/index.mjs`)) {
  throw new Error("TanStack server function is missing from Vercel output");
}
for (const path of ["index.html", "404.html"]) {
  if (existsSync(`${output}/static/${path}`)) {
    throw new Error(`Static ${path} would intercept Bridge application routes`);
  }
}

console.log("Verified: Vercel output routes Bridge through the TanStack server");
