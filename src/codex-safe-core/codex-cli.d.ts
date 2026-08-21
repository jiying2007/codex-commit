export interface ResolvedCodex {
  executable: string;
  version: string;
}

export interface TextProcessResult {
  stdout: string;
  stderr: string;
}

export interface SafeCodexCli {
  findWindowsCodexCandidates(codexPath: string): Promise<string[]>;
  resolveCodexExecutable(codexPath: string): Promise<ResolvedCodex>;
  probeCodexCapabilities(resolved: string | ResolvedCodex, model?: string): Promise<unknown>;
  buildCodexArgs(schemaPath: string, model?: string): string[];
  withTemporaryDirectory<T>(fn: (tempDir: string) => Promise<T>): Promise<T>;
  runStructuredCodex(request: unknown): Promise<{
    parsed: unknown;
    resolved: ResolvedCodex;
    processResult: TextProcessResult;
  }>;
}

export function createCodexCli(options: {
  runPreparedProcess: (
    command: string,
    args: string[],
    options?: unknown,
    stdinText?: string,
    token?: unknown
  ) => Promise<TextProcessResult>;
  tempPrefix?: string;
  capabilityCache?: Map<string, unknown>;
}): SafeCodexCli;

export function parseCodexJsonl(stdout: string): string;
