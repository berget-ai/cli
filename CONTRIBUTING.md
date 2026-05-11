# Contributing to Berget CLI

Berget CLI is open source. Contributions are welcome!

- GitHub: [berget-ai/cli](https://github.com/berget-ai/cli)
- Issues: [Report bugs](https://github.com/berget-ai/cli/issues)
- Documentation: [docs.berget.ai](https://docs.berget.ai)

## Development Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/berget-ai/cli.git
cd cli
npm install
```

## Testing Locally

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
