const { spawn } = require("child_process");
const path = require("path");

let restartCount = 0;
let child = null;

function startServer() {
  console.log(`[Supervisor] Launching EviChain API server (instance #${++restartCount})...`);
  
  child = spawn(process.execPath, [path.join(__dirname, "dist", "index.js")], {
    cwd: __dirname,
    stdio: "inherit",
    env: { ...process.env, PORT: "4000", NODE_ENV: "development" }
  });

  child.on("error", (err) => {
    console.error("[Supervisor] Failed to spawn server process:", err);
  });

  child.on("exit", (code, signal) => {
    console.warn(`[Supervisor] Server process exited (code=${code}, signal=${signal}). Restarting in 1000ms...`);
    setTimeout(startServer, 1000);
  });
}

process.on("SIGINT", () => {
  console.log("[Supervisor] SIGINT received, stopping child...");
  if (child) child.kill("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[Supervisor] SIGTERM received, stopping child...");
  if (child) child.kill("SIGTERM");
  process.exit(0);
});

startServer();
