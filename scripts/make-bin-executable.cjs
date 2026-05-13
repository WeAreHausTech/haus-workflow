const fs = require("node:fs");
const file = "dist/cli.js";
if (fs.existsSync(file)) fs.chmodSync(file, 0o755);
