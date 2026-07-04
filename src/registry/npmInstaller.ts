import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

import type { BuiltInServerMetadata } from "./builtins.js";
import type { InstalledCommand } from "./installer.js";

export interface NpmInstallOptions {
  installDir: string;
  runCommand?: typeof spawn;
}

const maxInstallOutputLength = 8_000;

function appendBoundedOutput(current: string, chunk: Buffer | string): string {
  if (current.length >= maxInstallOutputLength) {
    return current;
  }
  const next = `${current}${chunk.toString()}`;
  if (next.length <= maxInstallOutputLength) {
    return next;
  }
  return `${next.slice(0, maxInstallOutputLength)}...`;
}

function compactInstallOutput(output: string): string {
  return output.trim().replace(/\s+/g, " ");
}

export async function installNpmServer(
  metadata: BuiltInServerMetadata,
  options: NpmInstallOptions,
): Promise<InstalledCommand> {
  if (metadata.installStrategy.type !== "npm") {
    throw new Error(`${metadata.id} does not use npm install strategy`);
  }

  await mkdir(options.installDir, { recursive: true });
  const runner = options.runCommand ?? spawn;
  const spec = `${metadata.installStrategy.package}@${metadata.version}`;
  const userConfigPath = join(options.installDir, ".lsp-mcp-npmrc");
  await writeFile(userConfigPath, "", { flag: "a" });

  await new Promise<void>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = runner(
      "npm",
      [
        "--userconfig",
        userConfigPath,
        "install",
        "--ignore-scripts",
        "--prefix",
        options.installDir,
        spec,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout = appendBoundedOutput(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr = appendBoundedOutput(stderr, chunk);
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      if (code === 0) {
        resolve();
        return;
      }
      const detail = compactInstallOutput(stderr) || compactInstallOutput(stdout);
      reject(
        new Error(
          `npm install failed for ${metadata.id} with exit code ${code ?? "unknown"}${
            detail ? `: ${detail}` : ""
          }`,
        ),
      );
    });
  });

  const binName = process.platform === "win32" ? `${metadata.command}.cmd` : metadata.command;
  return {
    command: join(options.installDir, "node_modules", ".bin", binName),
    args: metadata.args,
  };
}
