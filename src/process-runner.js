'use strict';

const { spawn } = require('child_process');
const path = require('path');

/** @typedef {(zh: string, en: string) => string} Translate */
/** @typedef {{dispose: () => void}} DisposableLike */
/**
 * @typedef {Object} CancellationTokenLike
 * @property {boolean} isCancellationRequested
 * @property {(listener: () => void) => DisposableLike} onCancellationRequested
 */
/**
 * @typedef {Object} ProcessOptions
 * @property {string} [cwd]
 * @property {NodeJS.ProcessEnv} [env]
 * @property {boolean} [shell]
 * @property {boolean} [windowsVerbatimArguments]
 * @property {number} [timeoutMs]
 * @property {number} [maxStdoutBytes]
 * @property {number} [maxStderrBytes]
 */
/** @typedef {{stdout: string, stderr: string}} TextProcessResult */
/** @typedef {{stdout: Buffer, stderr: Buffer}} BufferProcessResult */
/** @typedef {Error & {code?: string|number, stdout?: string|Buffer, stderr?: string|Buffer}} ProcessError */

/**
 * @param {Translate} ui
 */
function createProcessRunner(ui) {
  /**
   * @param {string} command
   * @returns {boolean}
   */
  function isWindowsScript(command) {
    return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function quoteWindowsCmdArg(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  /**
   * @param {string} command
   * @param {string[]} args
   * @returns {{command: string, args: string[], shell: false, windowsVerbatimArguments?: true}}
   */
  function prepareCommand(command, args) {
    if (!isWindowsScript(command)) {
      return { command, args, shell: false };
    }
    const commandLine = '"' + [quoteWindowsCmdArg(command), ...args.map(quoteWindowsCmdArg)].join(' ') + '"';
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/v:off', '/s', '/c', commandLine],
      shell: false,
      windowsVerbatimArguments: true
    };
  }

  /**
   * @param {string} command
   * @param {string[]} args
   * @param {ProcessOptions} [options]
   * @param {string} [stdinText]
   * @param {CancellationTokenLike} [cancellationToken]
   * @returns {Promise<TextProcessResult>}
   */
  function runPreparedProcess(command, args, options = {}, stdinText = '', cancellationToken) {
    const prepared = prepareCommand(command, args);
    return runProcess(
      prepared.command,
      prepared.args,
      {
        ...options,
        shell: false,
        windowsVerbatimArguments: prepared.windowsVerbatimArguments === true
      },
      stdinText,
      cancellationToken
    );
  }

  /**
   * @param {string} command
   * @param {string[]} args
   * @param {ProcessOptions} [options]
   * @param {string} [stdinText]
   * @param {CancellationTokenLike} [cancellationToken]
   * @returns {Promise<TextProcessResult>}
   */
  function runProcess(command, args, options = {}, stdinText = '', cancellationToken) {
    return new Promise((resolve, reject) => {
      /** @type {import('child_process').ChildProcessWithoutNullStreams | undefined} */
      let child;
      let settled = false;
      /** @type {NodeJS.Timeout | undefined} */
      let timeoutHandle;
      /** @type {NodeJS.Timeout | undefined} */
      let forceKillHandle;
      /** @type {DisposableLike | undefined} */
      let cancellationDisposable;
      /** @type {ProcessError | undefined} */
      let terminationError;
      let terminating = false;

      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (forceKillHandle) clearTimeout(forceKillHandle);
        cancellationDisposable?.dispose();
      };

      /** @param {(value: any) => void} fn @param {any} value */
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };

      /** @param {ProcessError} error */
      const terminate = (error) => {
        if (terminating) return;
        terminating = true;
        terminationError = error;
        if (!child || child.killed) {
          settle(reject, error);
          return;
        }

        if (process.platform === 'win32' && child.pid) {
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            shell: false,
            stdio: 'ignore'
          });
          killer.once('close', () => settle(reject, error));
          killer.once('error', () => {
            try { child?.kill(); } catch {}
            settle(reject, error);
          });
          return;
        }

        try {
          if (child.pid) process.kill(-child.pid, 'SIGTERM');
          else child.kill('SIGTERM');
        } catch {
          try { child.kill('SIGTERM'); } catch {}
        }
        forceKillHandle = setTimeout(() => {
          try {
            if (child?.pid) process.kill(-child.pid, 'SIGKILL');
            else child?.kill('SIGKILL');
          } catch {
            try { child?.kill('SIGKILL'); } catch {}
          }
          settle(reject, error);
        }, 1500);
      };

      try {
        child = spawn(command, args, {
          cwd: options.cwd,
          env: options.env || process.env,
          windowsHide: true,
          shell: options.shell === true,
          windowsVerbatimArguments: options.windowsVerbatimArguments === true,
          detached: process.platform !== 'win32'
        });
      } catch (rawError) {
        settle(reject, rawError);
        return;
      }

      let stdout = '';
      let stderr = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      const maxStdoutBytes = options.maxStdoutBytes ?? (4 * 1024 * 1024);
      const maxStderrBytes = options.maxStderrBytes ?? (1 * 1024 * 1024);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        const text = String(chunk);
        stdoutBytes += Buffer.byteLength(text, 'utf8');
        if (stdoutBytes > maxStdoutBytes) {
          const error = /** @type {ProcessError} */ (new Error(ui(
            `子进程 stdout 超过限制（${maxStdoutBytes} bytes）`,
            `Child process stdout exceeded the limit (${maxStdoutBytes} bytes)`
          )));
          error.code = 'EOUTPUTLIMIT';
          terminate(error);
          return;
        }
        stdout += text;
      });
      child.stderr.on('data', (chunk) => {
        const text = String(chunk);
        stderrBytes += Buffer.byteLength(text, 'utf8');
        if (stderrBytes > maxStderrBytes) {
          const error = /** @type {ProcessError} */ (new Error(ui(
            `子进程 stderr 超过限制（${maxStderrBytes} bytes）`,
            `Child process stderr exceeded the limit (${maxStderrBytes} bytes)`
          )));
          error.code = 'EOUTPUTLIMIT';
          terminate(error);
          return;
        }
        stderr += text;
      });

      child.once('error', error => settle(reject, error));
      child.once('close', code => {
        if (settled) return;
        if (terminationError) {
          if (process.platform === 'win32') settle(reject, terminationError);
          return;
        }
        if (code === 0) {
          settle(resolve, { stdout, stderr });
        } else {
          const error = /** @type {ProcessError} */ (new Error(
            `${path.basename(command)} exited with code ${code}\n${stderr || stdout}`.trim()
          ));
          error.code = code ?? -1;
          error.stdout = stdout;
          error.stderr = stderr;
          settle(reject, error);
        }
      });

      if ((options.timeoutMs || 0) > 0) {
        timeoutHandle = setTimeout(() => {
          const seconds = Math.round((options.timeoutMs || 0) / 1000);
          const error = /** @type {ProcessError} */ (new Error(ui(
            `进程执行超时（${seconds} 秒）`,
            `Process timed out after ${seconds} seconds`
          )));
          error.code = 'ETIMEDOUT';
          terminate(error);
        }, options.timeoutMs);
      }

      if (cancellationToken) {
        if (cancellationToken.isCancellationRequested) {
          const error = /** @type {ProcessError} */ (new Error(ui('操作已取消。', 'Operation cancelled.')));
          error.code = 'ECANCELLED';
          terminate(error);
          return;
        }
        cancellationDisposable = cancellationToken.onCancellationRequested(() => {
          const error = /** @type {ProcessError} */ (new Error(ui('操作已取消。', 'Operation cancelled.')));
          error.code = 'ECANCELLED';
          terminate(error);
        });
      }

      if (stdinText) child.stdin.write(stdinText, 'utf8');
      child.stdin.end();
    });
  }

  /**
   * @param {string} command
   * @param {string[]} args
   * @param {ProcessOptions} [options]
   * @param {CancellationTokenLike} [cancellationToken]
   * @returns {Promise<BufferProcessResult>}
   */
  function runProcessBuffer(command, args, options = {}, cancellationToken) {
    return new Promise((resolve, reject) => {
      /** @type {import('child_process').ChildProcessWithoutNullStreams | undefined} */
      let child;
      let settled = false;
      /** @type {NodeJS.Timeout | undefined} */
      let timeoutHandle;
      /** @type {DisposableLike | undefined} */
      let cancellationDisposable;
      /** @type {Buffer[]} */
      const stdout = [];
      /** @type {Buffer[]} */
      const stderr = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      const maxStdoutBytes = options.maxStdoutBytes ?? (16 * 1024 * 1024);
      const maxStderrBytes = options.maxStderrBytes ?? (256 * 1024);

      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        cancellationDisposable?.dispose();
      };
      /** @param {(value: any) => void} fn @param {any} value */
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };
      /** @param {ProcessError} error */
      const terminate = (error) => {
        try { child?.kill('SIGKILL'); } catch {}
        settle(reject, error);
      };

      try {
        child = spawn(command, args, {
          cwd: options.cwd,
          env: options.env || process.env,
          windowsHide: true,
          shell: false
        });
      } catch (rawError) {
        settle(reject, rawError);
        return;
      }

      child.stdout.on('data', (chunk) => {
        const buffer = Buffer.from(chunk);
        stdoutBytes += buffer.length;
        if (stdoutBytes > maxStdoutBytes) {
          const error = /** @type {ProcessError} */ (new Error(ui(
            `子进程 stdout 超过限制（${maxStdoutBytes} bytes）`,
            `Child process stdout exceeded the limit (${maxStdoutBytes} bytes)`
          )));
          error.code = 'EOUTPUTLIMIT';
          terminate(error);
          return;
        }
        stdout.push(buffer);
      });
      child.stderr.on('data', (chunk) => {
        const buffer = Buffer.from(chunk);
        stderrBytes += buffer.length;
        if (stderrBytes > maxStderrBytes) {
          const error = /** @type {ProcessError} */ (new Error(ui(
            `子进程 stderr 超过限制（${maxStderrBytes} bytes）`,
            `Child process stderr exceeded the limit (${maxStderrBytes} bytes)`
          )));
          error.code = 'EOUTPUTLIMIT';
          terminate(error);
          return;
        }
        stderr.push(buffer);
      });

      child.once('error', error => settle(reject, error));
      child.once('close', code => {
        if (settled) return;
        const out = Buffer.concat(stdout);
        const err = Buffer.concat(stderr);
        if (code === 0) {
          settle(resolve, { stdout: out, stderr: err });
        } else {
          const error = /** @type {ProcessError} */ (new Error(
            `${path.basename(command)} exited with code ${code}\n${err.toString('utf8') || out.toString('utf8')}`.trim()
          ));
          error.code = code ?? -1;
          error.stdout = out;
          error.stderr = err;
          settle(reject, error);
        }
      });

      if ((options.timeoutMs || 0) > 0) {
        timeoutHandle = setTimeout(() => {
          const seconds = Math.round((options.timeoutMs || 0) / 1000);
          const error = /** @type {ProcessError} */ (new Error(ui(
            `进程执行超时（${seconds} 秒）`,
            `Process timed out after ${seconds} seconds`
          )));
          error.code = 'ETIMEDOUT';
          terminate(error);
        }, options.timeoutMs);
      }

      if (cancellationToken) {
        if (cancellationToken.isCancellationRequested) {
          const error = /** @type {ProcessError} */ (new Error(ui('操作已取消。', 'Operation cancelled.')));
          error.code = 'ECANCELLED';
          terminate(error);
          return;
        }
        cancellationDisposable = cancellationToken.onCancellationRequested(() => {
          const error = /** @type {ProcessError} */ (new Error(ui('操作已取消。', 'Operation cancelled.')));
          error.code = 'ECANCELLED';
          terminate(error);
        });
      }
    });
  }

  return {
    isWindowsScript,
    quoteWindowsCmdArg,
    prepareCommand,
    runPreparedProcess,
    runProcess,
    runProcessBuffer
  };
}

module.exports = {
  createProcessRunner
};
