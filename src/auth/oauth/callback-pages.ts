/**
 * HTML callback pages for the OAuth PKCE browser flow.
 * Kept separate from pkce-flow.ts to keep the flow logic focused.
 */

export function getErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
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
</html>`;
}

export function getSuccessPage(): string {
  return `<!DOCTYPE html>
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
</html>`;
}
