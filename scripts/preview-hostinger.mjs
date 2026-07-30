import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const root = path.join(process.cwd(), "hostinger-ready");
const port = Number(process.env.PORT || 3111);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

async function existingFile(candidate) {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  const decodedPath = decodeURIComponent(url.pathname);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const directPath = path.join(root, safePath);
  const htmlPath = `${directPath.replace(/\/$/, "")}.html`;
  const selectedPath = (await existingFile(directPath))
    ? directPath
    : (await existingFile(htmlPath))
      ? htmlPath
      : path.join(root, "404.html");

  response.statusCode = selectedPath.endsWith("404.html") ? 404 : 200;
  response.setHeader(
    "Content-Type",
    contentTypes[path.extname(selectedPath)] || "application/octet-stream",
  );
  createReadStream(selectedPath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Hostinger preview: http://127.0.0.1:${port}`);
});
