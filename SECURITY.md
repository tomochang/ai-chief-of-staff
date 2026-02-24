# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public issue
2. Email the maintainer or use GitHub's private vulnerability reporting feature
3. Include steps to reproduce and potential impact

We will acknowledge receipt within 48 hours and provide a fix timeline.

## Scope

This project is a collection of markdown prompts, shell scripts, and hooks for Claude Code. Security concerns most likely involve:

- Credential exposure in example files
- Shell injection in hook scripts
- Unintended data leakage through Git commits

## Best Practices for Users

- Never commit `.env` files, API tokens, or credentials
- Review hook scripts before enabling them
- Use environment variables for secrets, not config files
