# Berget CLI

A command-line interface for interacting with the Berget AI infrastructure.

## Installation

```bash
npm install -g berget
```

## Authentication

The CLI uses OAuth-based authentication with automatic token refresh.

### Login

```bash
berget auth login
```

This will open a browser window to authenticate with Berget. After successful authentication, your access token and refresh token will be stored securely in `~/.berget/auth.json`.

### Token Refresh

The CLI automatically handles token refresh when:

1. The access token is about to expire (within 10 minutes of expiration)
2. A request returns a 401 Unauthorized error

The refresh mechanism uses the stored refresh token to obtain a new access token without requiring you to log in again. If the refresh token itself is expired or invalid, you'll be prompted to log in again.

## Development

### Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/berget/cli.git
cd cli
npm install
```

### Testing Locally

Use the `start` script to test the CLI locally with the `--local` flag:

```bash
npm start -- <command> [options]
```

For example:

```bash
# Test login
npm start -- auth login

# Test whoami
npm start -- auth whoami

# Test with debug output
npm start -- auth whoami --debug
```

The `--debug` flag provides detailed information about token refresh attempts and API responses.

### Testing Token Refresh

To test the token refresh mechanism:

1. Log in with `npm start -- auth login`
2. Make a request that requires authentication, like `npm start -- auth whoami`
3. To force a token refresh, you can:
   - Wait until the token is close to expiration
   - Manually edit `~/.berget/auth.json` and set `expires_at` to a past timestamp
   - Use the `--debug` flag to see the token refresh process in action

## Commands

- `auth login` - Log in to Berget
- `auth logout` - Log out from Berget
- `auth whoami` - Show current user information
- `api-keys list` - List API keys
- `api-keys create` - Create a new API key
- `models list` - List available AI models
- `chat run` - Start a chat session with an AI model

For a complete list of commands, run:

```bash
berget --help
```
