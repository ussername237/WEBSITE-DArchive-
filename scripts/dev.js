import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["server/index.js"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
  }),
];
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on("error", (error) => {
    console.error("Gagal menjalankan server lokal:", error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`Proses lokal berhenti dengan kode ${code ?? "tidak diketahui"}.`);
      stop(code || 1);
    }
  });
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
