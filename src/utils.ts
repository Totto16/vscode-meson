import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as vscode from "vscode";
import * as which from "which";

import { createHash, BinaryLike } from "crypto";
import { ExtensionConfiguration, Target, SettingsKey, ModifiableExtension, type Version } from "./types";
import { getMesonBuildOptions } from "./introspection";
import { extensionPath, workspaceState } from "./extension";
import { Readable } from "stream";

export interface ExecResult {
  stdout: string;
  stderr: string;
  error?: cp.ExecFileException;
}

export async function exec(
  command: string,
  args: string[],
  extraEnv: { [key: string]: string } | undefined = undefined,
  options: cp.ExecFileOptions = { shell: true },
) {
  if (extraEnv) {
    options.env = { ...(options.env ?? process.env), ...extraEnv };
  }
  return new Promise<ExecResult>((resolve, reject) => {
    cp.execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export async function execFeed(
  command: string,
  args: string[],
  options: cp.ExecFileOptions = { shell: true },
  stdin: string,
) {
  return new Promise<ExecResult>((resolve) => {
    const p = cp.execFile(command, args, options, (error, stdout, stderr) => {
      resolve({ stdout, stderr, error: error ? error : undefined });
    });

    p.stdin?.write(stdin);
    p.stdin?.end();
  });
}

export async function execFeed2(
  command: string,
  args: string[],
  options: cp.SpawnOptionsWithoutStdio = { shell: true },
  stdin: string,
) {
  return new Promise<ExecResult>((resolve) => {
    const p = cp.spawn(command, args, { ...options, stdio: [0, "pipe", "pipe"] });

    const stdoutBuffer: string[] = [];
    const stderrBuffer: string[] = [];

    p.stdin?.write(stdin);
    p.stdin?.end();

    p.stdout?.on("data", (d) => {
      stdoutBuffer.push(d.toString());
    });

    p.stderr?.on("data", (d) => {
      stderrBuffer.push(d.toString());
    });

    p.on("close", (code, signal) => {
      resolve({ stderr: stderrBuffer.join(""), stdout: stdoutBuffer.join("") });
    });

    p.on("error", (error) => {
      resolve({ stderr: stderrBuffer.join(""), stdout: stdoutBuffer.join(""), error });
    });

    p.on("disconnect", (err: unknown) => {
      resolve({
        stderr: stderrBuffer.join(""),
        stdout: stdoutBuffer.join(""),
        error: new Error(`Process disconnected: ${err}`),
      });
    });

    p.on("exit", (code, signal) => {
      resolve({
        stderr: stderrBuffer.join(""),
        stdout: stdoutBuffer.join(""),
        error: new Error(`Process exited: ${code}`),
      });
    });
  });
}

export async function execFeed3(
  command: string,
  args: string[],
  options: cp.SpawnOptionsWithoutStdio = { shell: true },
  stdin: string,
) {
  return new Promise<ExecResult>((resolve) => {
    const stdinStream = new Readable();

    const p = cp.spawn(command, args, { ...options, stdio: [stdinStream, "pipe", "pipe"] });

    const stdoutBuffer: string[] = [];
    const stderrBuffer: string[] = [];

    p.on("spawn", () => {
      stdinStream.push(stdin);
      stdinStream.destroy();
    });

    p.stdout?.on("data", (d) => {
      stdoutBuffer.push(d.toString());
    });

    p.stderr?.on("data", (d) => {
      stderrBuffer.push(d.toString());
    });

    p.on("close", (code, signal) => {
      resolve({ stderr: stderrBuffer.join(""), stdout: stdoutBuffer.join("") });
    });

    p.on("error", (error) => {
      resolve({ stderr: stderrBuffer.join(""), stdout: stdoutBuffer.join(""), error });
    });

    p.on("disconnect", (err: unknown) => {
      resolve({
        stderr: stderrBuffer.join(""),
        stdout: stdoutBuffer.join(""),
        error: new Error(`Process disconnected: ${err}`),
      });
    });

    p.on("exit", (code, signal) => {
      resolve({
        stderr: stderrBuffer.join(""),
        stdout: stdoutBuffer.join(""),
        error: new Error(`Process exited: ${code}`),
      });
    });
  });
}

export async function parseJSONFileIfExists<T = object>(path: string) {
  try {
    const data = await fs.promises.readFile(path);
    return JSON.parse(data.toString()) as T;
  } catch (err) {
    return false;
  }
}

let _channel: vscode.OutputChannel;
export function getOutputChannel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel("Meson Build");
  }
  return _channel;
}

export function extensionRelative(filepath: string) {
  return path.join(extensionPath, filepath);
}

export function getBuildDirectory(sourceDir: string) {
  const buildDir = extensionConfiguration("buildFolder");
  if (path.isAbsolute(buildDir)) return buildDir;
  return path.join(sourceDir, buildDir);
}

let _layoutPromise: Promise<string> | null = null;

async function getLayout() {
  const buildDir = workspaceState.get<string>("mesonbuild.buildDir")!;
  const buildOptions = await getMesonBuildOptions(buildDir);
  return buildOptions.filter((o) => o.name === "layout")[0].value;
}

export function clearCache() {
  _layoutPromise = null;
}

export async function getTargetName(target: Target) {
  _layoutPromise ??= getLayout();
  const layout = await _layoutPromise;

  if (layout === "mirror") {
    const relativePath = path.relative(
      workspaceState.get<string>("mesonbuild.sourceDir")!,
      path.dirname(target.defined_in),
    );

    // Meson requires the separator between path and target name to be '/'.
    const targetRelativePath = path.join(relativePath, target.name);
    const p = targetRelativePath.split(path.sep).join(path.posix.sep);
    return `${p}:${target.type.replace(" ", "_")}`;
  } else {
    return `meson-out/${target.name}`;
  }
}

export function hash(input: BinaryLike) {
  const hashObj = createHash("sha1");
  hashObj.update(input);
  return hashObj.digest("hex");
}

export function getConfiguration() {
  return vscode.workspace.getConfiguration("mesonbuild");
}

export function extensionConfiguration<K extends keyof ExtensionConfiguration>(key: K) {
  return getConfiguration().get<ExtensionConfiguration[K]>(key)!;
}

export function extensionConfigurationSet<K extends keyof ExtensionConfiguration>(
  key: K,
  value: ExtensionConfiguration[K],
  target = vscode.ConfigurationTarget.Global,
) {
  return getConfiguration().update(key, value, target);
}

export function shouldModifySetting(key: ModifiableExtension) {
  const modifySettings = extensionConfiguration(SettingsKey.modifySettings);
  if (typeof modifySettings == "boolean") return modifySettings;
  if (modifySettings.includes(key)) return true;
  return false;
}

export function arrayIncludes<T>(array: T[], value: T) {
  return array.indexOf(value) !== -1;
}

export function isThenable<T>(x: vscode.ProviderResult<T>): x is Thenable<T> {
  return arrayIncludes(Object.getOwnPropertyNames(x), "then");
}

export async function genEnvFile(buildDir: string) {
  const envfile = path.join(buildDir, "meson-vscode.env");
  try {
    await exec(extensionConfiguration("mesonPath"), [
      "devenv",
      "-C",
      buildDir,
      "--dump",
      envfile,
      "--dump-format",
      "vscode",
    ]);
  } catch {
    // Ignore errors, Meson could be too old to support --dump-format.
    return;
  }
}

// meson setup --reconfigure is needed if and only if coredata.dat exists.
// Note: With Meson >= 1.1.0 we can always pass --reconfigure even if it was
// not already configured.
export function checkMesonIsConfigured(buildDir: string) {
  return fs.existsSync(path.join(buildDir, "meson-private", "coredata.dat"));
}

export async function mesonRootDirs(): Promise<string[]> {
  let rootDirs: string[] = [];
  let pending: vscode.Uri[] = [];
  vscode.workspace.workspaceFolders!.forEach((i) => pending.push(i.uri));
  while (true) {
    const d = pending.pop();
    if (!d) break;
    let hasMesonFile: boolean = false;
    let subdirs: vscode.Uri[] = [];
    for (const [name, type] of await vscode.workspace.fs.readDirectory(d)) {
      if (type & vscode.FileType.File && name == "meson.build") {
        rootDirs.push(d.fsPath);
        hasMesonFile = true;
        break;
      } else if (type & vscode.FileType.Directory) {
        subdirs.push(vscode.Uri.joinPath(d, name));
      }
    }
    if (!hasMesonFile) {
      pending.push(...subdirs);
    }
  }

  return rootDirs;
}

export function whenFileExists(ctx: vscode.ExtensionContext, file: string, listener: () => void) {
  const watcher = vscode.workspace.createFileSystemWatcher(file, false, true, true);
  watcher.onDidCreate(listener);
  ctx.subscriptions.push(watcher);
  if (fs.existsSync(file)) {
    listener();
  }
}

export function mesonProgram(): string {
  return which.sync(extensionConfiguration("mesonPath"));
}

/** This compares two versions
 *  - if the first one is bigger, a value > 0 is returned
 *  - if they are the same, 0 is returned
 *  - if the first one is smaller, a value < 0 is returned
 * @param version1
 * @param version2
 */
export function versionCompare([major1, minor1, patch1]: Version, [major2, minor2, patch2]: Version): number {
  if (major1 !== major2) {
    return major1 - major2;
  }

  if (minor1 !== minor2) {
    return minor1 - minor2;
  }

  return patch1 - patch2;
}
