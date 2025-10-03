#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const binDir = path.join(projectRoot, "node_modules", ".bin");
const shimTarget = path.join(__dirname, "tsx-shim.cjs");
const shimPath = path.join(binDir, "tsx");

fs.mkdirSync(binDir, { recursive: true });

const relative = path.relative(binDir, shimTarget) || "./scripts/tsx-shim.cjs";
const requirePath = relative.startsWith(".") ? relative : `./${relative}`;
const contents = `#!/usr/bin/env node\nrequire(${JSON.stringify(requirePath)});\n`;
fs.writeFileSync(shimPath, contents, "utf8");
fs.chmodSync(shimPath, 0o755);
