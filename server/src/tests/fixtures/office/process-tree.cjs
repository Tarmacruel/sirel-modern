// A real launcher/child pair for testing Windows ownership (no LibreOffice mock).
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const [mode, pidFile] = process.argv.slice(2);
if (mode === "leaf") {
  setInterval(() => {}, 1000);
} else if (mode === "error") {
  process.exit(7);
} else if (mode === "args") {
  writeFileSync(pidFile, JSON.stringify(process.argv.slice(4)));
  process.exit(0);
} else {
  // Node itself kills non-detached Windows children on exit. Detach to exercise
  // the supervisor's outer Job Object when a launcher leaves a descendant behind.
  const child = spawn(process.execPath, [__filename, "leaf"], {
    stdio: "ignore",
    windowsHide: true,
    detached: mode === "orphan",
  });
  child.unref();
  writeFileSync(
    pidFile,
    JSON.stringify({ parent: process.pid, child: child.pid }),
  );
  if (mode === "orphan") process.exit(0);
  setInterval(() => {}, 1000);
}
