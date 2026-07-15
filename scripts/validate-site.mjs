import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");
const mode = process.argv[2] || "build";
const errors = [];

const requiredRoutes = ["privacy", "terms", "support", "account-deletion"];
const allowedExternalPrefixes = [
  "#",
  "http://",
  "https://",
  "mailto:",
  "tel:",
  "data:",
  "javascript:",
];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if ([".git", "node_modules"].includes(entry.name)) {
        return [];
      }
      return walk(path);
    }
    return [path];
  });
}

function existsLocal(target) {
  try {
    statSync(target);
    return true;
  } catch {
    return false;
  }
}

function resolveLocalReference(file, value) {
  const clean = value.split("#")[0].split("?")[0];
  if (!clean || allowedExternalPrefixes.some((prefix) => clean.startsWith(prefix))) {
    return null;
  }

  const candidate = clean.startsWith("/")
    ? join(root, clean)
    : normalize(join(dirname(file), clean));

  if (existsLocal(candidate)) {
    return null;
  }

  if (existsLocal(join(candidate, "index.html"))) {
    return null;
  }

  return candidate;
}

for (const route of requiredRoutes) {
  const routeIndex = join(root, route, "index.html");
  if (!existsLocal(routeIndex)) {
    errors.push(`Missing required route: /${route}/`);
  }
}

const files = walk(root);
const htmlFiles = files.filter((file) => extname(file) === ".html");
const cssFiles = files.filter((file) => extname(file) === ".css");

for (const file of htmlFiles) {
  const rel = relative(root, file);
  const body = readFileSync(file, "utf8");

  if (!body.includes('<meta name="viewport"')) {
    errors.push(`${rel}: missing responsive viewport meta tag`);
  }

  if (body.includes("support@oneway.mn")) {
    errors.push(`${rel}: use munkhjargalbs12@gmail.com instead of support@oneway.mn`);
  }

  const attrPattern = /\b(?:href|src)="([^"]+)"/g;
  for (const match of body.matchAll(attrPattern)) {
    const missing = resolveLocalReference(file, match[1]);
    if (missing) {
      errors.push(`${rel}: missing local reference ${match[1]} -> ${relative(root, missing)}`);
    }
  }
}

for (const file of cssFiles) {
  const rel = relative(root, file);
  const body = readFileSync(file, "utf8");
  const open = (body.match(/{/g) || []).length;
  const close = (body.match(/}/g) || []).length;

  if (body.includes("`")) {
    errors.push(`${rel}: unexpected backtick in CSS`);
  }

  if (open !== close) {
    errors.push(`${rel}: unbalanced CSS braces (${open} open, ${close} close)`);
  }
}

if (mode === "typecheck") {
  const tsFiles = files.filter((file) => [".ts", ".tsx"].includes(extname(file)));
  if (tsFiles.length > 0) {
    errors.push(`Static website typecheck expected no TypeScript files, found ${tsFiles.length}`);
  }
}

if (errors.length > 0) {
  console.error(`${mode} failed:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`${mode} passed for ${htmlFiles.length} HTML files and ${cssFiles.length} CSS files.`);
