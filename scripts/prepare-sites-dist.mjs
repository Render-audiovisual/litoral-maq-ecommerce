import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const serverDirectory = path.join(dist, "server");
const hostingDirectory = path.join(dist, ".openai");

await mkdir(serverDirectory, { recursive: true });
await mkdir(hostingDirectory, { recursive: true });
await copyFile(
  path.join(root, ".openai", "hosting.json"),
  path.join(hostingDirectory, "hosting.json"),
);

const worker = `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    const url = new URL(request.url);
    if (
      request.method === "GET" &&
      !url.pathname.endsWith("/") &&
      !url.pathname.split("/").at(-1)?.includes(".")
    ) {
      url.pathname += ".html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    return response;
  },
};
`;

await writeFile(path.join(serverDirectory, "index.js"), worker);
console.log("Sites artifact prepared in dist/.");
