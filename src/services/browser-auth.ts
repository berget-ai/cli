import * as crypto from "node:crypto";
import * as http from "node:http";
import * as net from "node:net";

export interface BrowserAuthOptions {
  callbackPort: number;
  clientId: string;
  debug?: boolean;
  keycloakUrl: string;
  realm: string;
}

export interface BrowserAuthResult {
  accessToken?: string;
  error?: string;
  expiresIn?: number;
  refreshToken?: string;
  success: boolean;
}

export class BrowserAuth {
  constructor(private readonly options: BrowserAuthOptions) {}

  async start(): Promise<BrowserAuthResult> {
    const { callbackPort, clientId, debug, keycloakUrl, realm } = this.options;

    // Generate PKCE code verifier and challenge
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString("hex");

    const redirectUri = `http://localhost:${callbackPort}/callback`;

    // Build authorization URL
    const authUrl = new URL(`${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth`);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    // Create a promise that resolves when we receive the callback
    const authResult = await new Promise<{
      code?: string;
      error?: string;
      success: boolean;
    }>(resolve => {
      let resolved = false;
      const sockets = new Set<net.Socket>();

      const safeResolve = (result: { code?: string; error?: string; success: boolean }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutHandle);
        server.close();
        // Force-close all active sockets so the server stops immediately
        for (const socket of sockets) {
          socket.destroy();
        }
        sockets.clear();
        resolve(result);
      };

      const server = http.createServer((request, res) => {
        const requestUrl = new URL(request.url || "", `http://localhost:${callbackPort}`);

        if (requestUrl.pathname === "/callback") {
          const receivedState = requestUrl.searchParams.get("state") || "";
          const code = requestUrl.searchParams.get("code") || "";
          const error = requestUrl.searchParams.get("error") || "";

          const errorPage = (title: string, message: string) => `
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Berget - Authentication Failed</title>
                <style>
                  * { margin: 0; padding: 0; box-sizing: border-box; }
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
                    color: #fff;
                  }
                  .container {
                    text-align: center;
                    padding: 3rem;
                    max-width: 400px;
                  }
                  .icon {
                    width: 80px;
                    height: 80px;
                    background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 1.5rem;
                    box-shadow: 0 4px 20px rgba(248, 113, 113, 0.3);
                  }
                  .icon svg { width: 40px; height: 40px; stroke: #fff; stroke-width: 3; }
                  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.75rem; color: #fff; }
                  p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
                  .brand { margin-top: 2rem; opacity: 0.5; font-size: 0.8rem; letter-spacing: 0.05em; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </div>
                  <h1>${title}</h1>
                  <p>${message}</p>
                  <div class="brand">BERGET</div>
                </div>
              </body>
            </html>
          `;

          // Set Connection: close so the browser doesn't keep the socket alive
          // after we respond, and force-end the connection
          if (error) {
            res.writeHead(200, { Connection: "close", "Content-Type": "text/html; charset=utf-8" });
            res.end(
              errorPage(
                "Authentication Failed",
                requestUrl.searchParams.get("error_description") || error
              )
            );
            safeResolve({ error, success: false });
            return;
          }

          if (receivedState !== state) {
            res.writeHead(200, { Connection: "close", "Content-Type": "text/html; charset=utf-8" });
            res.end(
              errorPage("Authentication Failed", "Invalid state parameter. Please try again.")
            );
            safeResolve({ error: "Invalid state parameter", success: false });
            return;
          }

          res.writeHead(200, { Connection: "close", "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Berget - Authentication Successful</title>
                <style>
                  * { margin: 0; padding: 0; box-sizing: border-box; }
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
                    color: #fff;
                  }
                  .container {
                    text-align: center;
                    padding: 3rem;
                    max-width: 400px;
                  }
                  .icon {
                    width: 80px;
                    height: 80px;
                    background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 1.5rem;
                    box-shadow: 0 4px 20px rgba(74, 222, 128, 0.3);
                  }
                  .icon svg { width: 40px; height: 40px; stroke: #fff; stroke-width: 3; }
                  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.75rem; color: #fff; }
                  p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
                  .brand { margin-top: 2rem; opacity: 0.5; font-size: 0.8rem; letter-spacing: 0.05em; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                  <h1>Authentication Successful</h1>
                  <p>You can close this window and return to your terminal.</p>
                  <div class="brand">BERGET</div>
                </div>
              </body>
            </html>
          `);
          safeResolve({ code, success: true });
        }
      });

      // Track sockets so we can destroy them on shutdown
      server.on("connection", (socket: net.Socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
      });

      server.listen(callbackPort, () => {
        if (debug) {
          console.log(`Callback server listening on port ${callbackPort}`);
        }
      });

      // Set timeout for the server
      const timeoutHandle = setTimeout(
        () => {
          safeResolve({ error: "Authentication timed out", success: false });
        },
        5 * 60 * 1000
      ); // 5 minute timeout

      // Open browser
      (async () => {
        try {
          const open = await import("open").then(m => m.default);
          await open(authUrl.toString());
        } catch {
          // Browser failed to open - user must open URL manually
        }
      })();
    });

    if (!authResult.success || !authResult.code) {
      return {
        error: authResult.error || "Unknown error",
        success: false,
      };
    }

    // Exchange authorization code for tokens
    const tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;
    const tokenResponse = await fetch(tokenUrl, {
      body: new URLSearchParams({
        client_id: clientId,
        code: authResult.code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return {
        error: `Failed to exchange code for tokens: ${errorText}`,
        success: false,
      };
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      expires_in: number;
      refresh_expires_in?: number;
      refresh_token: string;
    };

    return {
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in,
      refreshToken: tokenData.refresh_token,
      success: true,
    };
  }

  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash("sha256").update(verifier).digest("base64url");
  }

  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString("base64url");
  }
}
