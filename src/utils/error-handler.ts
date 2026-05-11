import chalk from "chalk";

/**
 * Formats and prints error messages in a consistent way
 */
export function handleError(message: string, error: any): void {
  console.error(chalk.red(`❌ Error: ${message}`));

  let errorDetails = "";
  let errorCode = "";
  let errorType = "";

  // If the error is a string (like JSON.stringify(error))
  if (typeof error === "string") {
    try {
      // Try to parse it as JSON
      const parsedError = JSON.parse(error);
      if (parsedError.error) {
        errorDetails = parsedError.error.message || parsedError.error;
        errorCode = parsedError.error.code || parsedError.code;
        errorType = parsedError.error.type || "";
      } else {
        errorDetails = error;
      }
    } catch {
      // If it's not valid JSON, just print the string
      errorDetails = error;
    }
  } else if (error && error.message) {
    // If it's an Error object
    errorDetails = error.message;
    errorCode = error.code;
    errorType = error.type;
  }

  // Print error details
  if (errorDetails) {
    console.error(chalk.dim(`📝 Details: ${errorDetails}`));
  }
  if (errorCode) {
    console.error(chalk.dim(`🔢 Code: ${errorCode}`));
  }

  // Provide helpful troubleshooting based on error type
  provideTroubleshootingTips(errorType, errorCode, errorDetails);
}

/**
 * Provides helpful troubleshooting tips based on error type
 */
function provideTroubleshootingTips(
  errorType: string,
  errorCode: string,
  errorDetails: string
): void {
  console.error(chalk.blue("\n💡 Troubleshooting tips:"));

  // Authentication errors
  if (
    errorType === "authentication_error" ||
    errorCode === "AUTH_FAILED" ||
    errorDetails?.includes("Unauthorized") ||
    errorDetails?.includes("Authentication failed")
  ) {
    console.error(chalk.yellow("   🔐 Authentication issue detected:"));
    console.error(chalk.white("   • Run `berget auth login` to log in"));
    console.error(chalk.white("   • Check if your session has expired"));
    console.error(chalk.white("   • Verify you have the correct permissions"));
  }

  // Network/connection errors
  if (
    errorDetails?.includes("fetch failed") ||
    errorDetails?.includes("ECONNREFUSED") ||
    errorDetails?.includes("ENOTFOUND") ||
    errorDetails?.includes("network")
  ) {
    console.error(chalk.yellow("   🌐 Network issue detected:"));
    console.error(chalk.white("   • Check your internet connection"));
    console.error(chalk.white("   • Verify you can reach api.berget.ai"));
    console.error(chalk.white("   • Try again in a few minutes"));
    console.error(chalk.white("   • Check if any firewall is blocking the request"));
  }

  // API key errors
  if (
    errorCode?.includes("API_KEY") ||
    errorDetails?.includes("API key") ||
    errorType === "invalid_request_error"
  ) {
    console.error(chalk.yellow("   🔑 API key issue detected:"));
    console.error(chalk.white("   • Run `berget api-keys list` to check your keys"));
    console.error(
      chalk.white('   • Create a new key with `berget api-keys create --name "My Key"`')
    );
    console.error(chalk.white("   • Set a default key with `berget api-keys set-default <id>`"));
    console.error(chalk.white("   • Check if your API key has expired"));
  }

  // Rate limiting
  if (
    errorCode === "RATE_LIMIT_EXCEEDED" ||
    errorDetails?.includes("rate limit") ||
    errorDetails?.includes("too many requests")
  ) {
    console.error(chalk.yellow("   ⏱️  Rate limit exceeded:"));
    console.error(chalk.white("   • Wait a few minutes before trying again"));
    console.error(chalk.white("   • Consider upgrading your plan for higher limits"));
    console.error(chalk.white("   • Use `berget billing get-usage` to check your usage"));
  }

  // Server errors
  if (
    errorCode?.includes("SERVER_ERROR") ||
    errorType === "server_error" ||
    (errorCode && Number.parseInt(errorCode) >= 500)
  ) {
    console.error(chalk.yellow("   🖥️  Server issue detected:"));
    console.error(chalk.white("   • This is a temporary problem on our end"));
    console.error(chalk.white("   • Try again in a few minutes"));
    console.error(chalk.white("   • Check status.berget.ai for service status"));
    console.error(chalk.white("   • Contact support if the problem persists"));
  }

  // Cluster errors
  if (errorCode?.includes("CLUSTERS") || errorDetails?.includes("cluster")) {
    console.error(chalk.yellow("   🏗️  Cluster issue detected:"));
    console.error(chalk.white("   • Clusters may be temporarily unavailable"));
    console.error(chalk.white("   • Try again later or contact support"));
    console.error(chalk.white("   • Check your cluster permissions"));
  }

  // Generic fallback
  if (
    !errorType?.includes("authentication") &&
    !errorDetails?.includes("fetch failed") &&
    !errorCode?.includes("API_KEY") &&
    !errorCode?.includes("RATE_LIMIT") &&
    !errorCode?.includes("SERVER_ERROR") &&
    !errorCode?.includes("CLUSTERS")
  ) {
    console.error(chalk.yellow("   ❓ General issue:"));
    console.error(chalk.white("   • Try running the command with --debug for more info"));
    console.error(chalk.white("   • Check your configuration with `berget auth whoami`"));
    console.error(chalk.white("   • Contact support if the problem persists"));
  }

  console.error(
    chalk.dim("\nNeed more help? Visit https://docs.berget.ai or contact support@berget.ai")
  );
}
