# Contributing to Git-Pet

Thanks for your interest. Here's how to contribute.

## Before You Start

- Check [open issues](https://github.com/SaadArqam/git-pet/issues) before opening a new one
- For large changes, open an issue first to discuss
- Keep PRs focused — one feature or fix per PR

## Local Setup

See the [README](README.md#getting-started) for environment setup.

## Branch Naming

```
feat/description     # new feature
fix/description      # bug fix
chore/description    # tooling, deps, cleanup
```

## Commit Style

Use conventional commits:

```
feat: add fight health persistence
fix: pet stops moving when menu opens
chore: update three.js to r130
```

## Pull Request Checklist

- [ ] Tested locally
- [ ] No console errors
- [ ] Doesn't break existing movement, multiplayer, or auth
- [ ] PR description explains what changed and why

## What Not to Touch

The following are sensitive — coordinate before changing:

- The RAF loop in `WorldClient.tsx`
- WebSocket message format
- NextAuth session handling
- Upstash key structure

## Questions?

Open a [discussion](https://github.com/SaadArqam/git-pet/discussions) or ping [@SaadArqam](https://github.com/SaadArqam).