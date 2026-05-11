export class CancelledError extends Error {
  constructor() {
    super("Wizard cancelled");
    this.name = "CancelledError";
  }
}

export class CommandFailedError extends Error {
  constructor(
    public readonly command: string,
    public readonly exitCode: number
  ) {
    super(`Command "${command}" failed with exit code ${exitCode}`);
    this.name = "CommandFailedError";
  }
}

export class PrerequisiteError extends Error {
  constructor(public readonly binary: string) {
    super(`Required binary not found: ${binary}`);
    this.name = "PrerequisiteError";
  }
}
