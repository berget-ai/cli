import chalk from 'chalk';

/**
 * Log levels in order of increasing verbosity
 */
export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

const REDACTION = '[REDACTED]';

/**
 * Logger class for centralized logging with configurable log levels
 */
export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO; // Default log level

  private constructor() {
    // Set log level from environment variable or command line argument
    if (process.env.LOG_LEVEL) {
      this.setLogLevelFromString(process.env.LOG_LEVEL);
    } else if (process.argv.includes('--debug')) {
      this.logLevel = LogLevel.DEBUG;
    } else if (process.argv.includes('--quiet')) {
      this.logLevel = LogLevel.ERROR;
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Log a debug message (only shown at DEBUG level).
   * Automatically redacts known secrets from string arguments.
   */
  public debug(message: string, ...arguments_: any[]): void {
    if (this.logLevel >= LogLevel.DEBUG) {
      const redactedMessage = redactSecrets(message);
      const redactedArgs = arguments_.map((arg) =>
        typeof arg === 'string' ? redactSecrets(arg) : arg,
      );
      if (redactedArgs.length > 0) {
        console.log(chalk.yellow(`DEBUG: ${redactedMessage}`), ...redactedArgs);
      } else {
        console.log(chalk.yellow(`DEBUG: ${redactedMessage}`));
      }
    }
  }

  /**
   * Log an error message (shown at ERROR level and above)
   */
  public error(message: string, ...arguments_: any[]): void {
    if (this.logLevel >= LogLevel.ERROR) {
      if (arguments_.length > 0) {
        console.error(chalk.red(message), ...arguments_);
      } else {
        console.error(chalk.red(message));
      }
    }
  }

  /**
   * Get the current log level
   */
  public getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Log an info message (shown at INFO level and above)
   */
  public info(message: string, ...arguments_: any[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      if (arguments_.length > 0) {
        console.log(chalk.blue(message), ...arguments_);
      } else {
        console.log(chalk.blue(message));
      }
    }
  }

  /**
   * Log a plain message without color (shown at INFO level and above)
   */
  public log(message: string, ...arguments_: any[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      if (arguments_.length > 0) {
        console.log(message, ...arguments_);
      } else {
        console.log(message);
      }
    }
  }

  /**
   * Set the log level
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Log a success message (shown at INFO level and above)
   */
  public success(message: string, ...arguments_: any[]): void {
    if (this.logLevel >= LogLevel.INFO) {
      if (arguments_.length > 0) {
        console.log(chalk.green(message), ...arguments_);
      } else {
        console.log(chalk.green(message));
      }
    }
  }

  /**
   * Log a warning message (shown at WARN level and above)
   */
  public warn(message: string, ...arguments_: any[]): void {
    if (this.logLevel >= LogLevel.WARN) {
      if (arguments_.length > 0) {
        console.log(chalk.yellow(message), ...arguments_);
      } else {
        console.log(chalk.yellow(message));
      }
    }
  }

  /**
   * Set the log level from a string
   */
  private setLogLevelFromString(level: string): void {
    switch (level.toLowerCase()) {
      case 'debug': {
        this.logLevel = LogLevel.DEBUG;
        break;
      }
      case 'error': {
        this.logLevel = LogLevel.ERROR;
        break;
      }
      case 'info': {
        this.logLevel = LogLevel.INFO;
        break;
      }
      case 'none': {
        this.logLevel = LogLevel.NONE;
        break;
      }
      case 'warn': {
        this.logLevel = LogLevel.WARN;
        break;
      }
      default: {
        // Invalid log level, keep default
        console.warn(`Invalid log level: ${level}. Using default (INFO).`);
      }
    }
  }
}

/**
 * Redact known secret patterns from log strings.
 * Handles Bearer tokens, URL query parameters (code, access_token,
 * refresh_token), Berget API keys, and JWT-like strings.
 */
function redactSecrets(value: string): string {
  let result = value;

  // Bearer tokens
  result = result.replace(/Bearer\s+\S+/gi, `Bearer ${REDACTION}`);

  // URL query parameters: code=..., access_token=..., refresh_token=...
  result = result.replace(/\b(code|access_token|refresh_token)=[^&\s]*/gi, `$1=${REDACTION}`);

  // Berget API keys (sk_ber_*)
  result = result.replace(/sk_ber_\w+/g, REDACTION);

  // JWT-like strings (3 base64url segments separated by dots)
  result = result.replace(/ey[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]*){2,}/g, REDACTION);

  return result;
}

// Export a singleton instance for easy import
export const logger = Logger.getInstance();
