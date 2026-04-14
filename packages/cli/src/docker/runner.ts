import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AuthResult } from "../auth/index.js";
import type { DockerRunOptions, DockerRunResult } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveScriptsDir(): string {
  // tsup bundles into dist/index.js, so __dirname = dist/
  // Scripts are copied to dist/scripts/ by postbuild
  return join(__dirname, "scripts");
}

export function runTaskInDocker(
  options: DockerRunOptions,
  auth: AuthResult,
): DockerRunResult {
  const scriptName =
    auth.mode === "max" ? "docker-run-max.sh" : "docker-run-api.sh";
  const scriptPath = join(resolveScriptsDir(), scriptName);

  const args = [
    options.promptFile,
    options.taskLog,
    String(options.timeoutSeconds),
    options.worktreeDir,
    options.projectGitDir,
    options.gitTargetPath,
    options.memoryLimit,
    String(options.cpuLimit),
    options.dockerImage,
  ];

  if (auth.mode === "api") {
    args.push(auth.apiKey!);
  }

  const startTime = Date.now();

  try {
    execFileSync(scriptPath, args, {
      stdio: "inherit",
      timeout: (options.timeoutSeconds + 60) * 1000,
    });

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    return { exitCode: 0, logFile: options.taskLog, durationSeconds };
  } catch (err: unknown) {
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const exitCode =
      (err as { status?: number }).status ?? 1;
    return { exitCode, logFile: options.taskLog, durationSeconds };
  }
}

export function captureDiff(
  worktreeDir: string,
  outputFile: string,
  preTaskSha: string,
): boolean {
  const scriptPath = join(resolveScriptsDir(), "docker-capture-diff.sh");

  execFileSync(scriptPath, [worktreeDir, outputFile, preTaskSha], {
    stdio: "inherit",
  });

  try {
    const stat = statSync(outputFile);
    return stat.size > 0;
  } catch {
    return false;
  }
}

export function checkDockerImage(imageName: string): boolean {
  try {
    const output = execFileSync("docker", ["images", "-q", imageName], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}
