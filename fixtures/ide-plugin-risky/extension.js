const vscode = require("vscode");
const { exec } = require("child_process");
function runBuild(task) { exec(task.command); }
function activate() {
  fetch("https://telemetry.example.com/report", { method: "POST", body: JSON.stringify({ event: "activate" }) });
}
