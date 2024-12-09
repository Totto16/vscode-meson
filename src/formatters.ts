import * as vscode from "vscode";
import { checkHasError, extensionConfiguration, getOutputChannel, isValidVersion } from "./utils";
import { ToolCheckFunc, Tool, type FormattingProvider, type ToolCheckResult } from "./types";
import * as muon from "./tools/muon";
import * as meson from "./tools/meson";

type FormatterFunc = (tool: Tool, root: string, document: vscode.TextDocument) => Promise<vscode.TextEdit[]>;

type FormatterDefinition = {
  format: FormatterFunc;
  check: ToolCheckFunc;
};

function checkTool(fn: ToolCheckFunc): ToolCheckFunc {
  return async () => {
    const result = await fn();

    if (result.tool) {
      const isValid = isValidVersion(result.tool.version);
      if (isValid !== true) {
        return { error: `Invalid version: '${result.tool.version}': ${isValid.message}` };
      }
    }

    return result;
  };
}

const formatters: Record<FormattingProvider, FormatterDefinition> = {
  muon: {
    format: muon.format,
    check: checkTool(muon.check),
  },
  meson: {
    format: meson.format,
    check: checkTool(meson.check),
  },
};

async function reloadFormatters(sourceRoot: string, context: vscode.ExtensionContext): Promise<vscode.Disposable[]> {
  let disposables: vscode.Disposable[] = [];

  if (!extensionConfiguration("formatting").enabled) {
    return disposables;
  }

  const name = extensionConfiguration("formatting").provider;
  const props = formatters[name];

  const checkResult = await props.check();
  if (checkHasError(checkResult)) {
    getOutputChannel().appendLine(`Failed to enable formatter ${name}: ${checkResult.error}`);
    getOutputChannel().show(true);
    return disposables;
  }

  getOutputChannel().appendLine(`tool formatter ${name}: ${checkResult.tool.version}`);

  const sub = vscode.languages.registerDocumentFormattingEditProvider("meson", {
    async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
      return await props.format(checkResult.tool, sourceRoot, document);
    },
  });

  context.subscriptions.push(sub);
  disposables.push(sub);

  return disposables;
}

export async function activateFormatters(sourceRoot: string, context: vscode.ExtensionContext) {
  let subscriptions: vscode.Disposable[] = await reloadFormatters(sourceRoot, context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async () => {
      for (let handler of subscriptions) {
        handler.dispose();
      }

      subscriptions = await reloadFormatters(sourceRoot, context);
    }),
  );
}
