const fs = require("fs");
const path = require("path");
const payload = JSON.stringify({ type: "commonjs" });
const dirs = ["dist/worker", "dist/lib"];
dirs.forEach((dir) => {
  const file = path.join(dir, "package.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, payload);
});
