# Berget CLI

A command-line tool for interacting with [Berget AI](https://berget.ai).

## Installation

```bash
npm install -g berget
# or use directly with npx
npx berget --help
```

## Authentication

Before you can use the CLI, you need to authenticate:

```bash
# Login with OAuth
npx berget auth login

# Create an API key
npx berget api-keys create --name "My CLI Key"

# Or use environment variable
export BERGET_API_KEY=sk_ber_your_api_key_here
```

## Environment Variables

```bash
# API key (recommended)
export BERGET_API_KEY=sk_ber_your_api_key_here

# Debug mode
export LOG_LEVEL=debug

# Custom API base URL (if using your own instance)
export API_BASE_URL=https://your-custom-api.example.com
```

## Command Reference

For a complete list of commands, run:

```bash
npx berget --help
```

## Troubleshooting

```bash
# Enable debug mode
npx berget --debug auth whoami

# Check authentication
npx berget auth whoami

# Check API key status
npx berget api-keys list
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development instructions.
