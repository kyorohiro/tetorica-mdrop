import fs from "node:fs";
import path from "node:path";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
const version = pkg.version;

const inputPath = path.join("public_portable", "sw-template.js");
const outputPath = path.join("public_portable", "sw.js");

const source = fs.readFileSync(inputPath, "utf-8");
const output = source.replaceAll("__APP_VERSION__", version);

fs.writeFileSync(outputPath, output);
console.log(`generated public/sw.js with version ${version}`);
