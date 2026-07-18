# Contributing

Contributions are welcome. This is a small, deliberately simple project, and the
goal is to keep it that way: clear code, real tests, and changes that a person
can read and understand quickly.

If you want to contribute, please open an issue first for anything beyond a
one-line fix, so we can agree on the shape before you spend time on it.

## The bar for a change

Every pull request should:

- **Do one thing.** Small and focused beats large and sweeping. If your change
  touches many files for unrelated reasons, split it.
- **Come with tests.** New behavior needs a test that fails without your change
  and passes with it. Bug fixes need a test that reproduces the bug first.
- **Pass the suite.** Run `npm test` (31+ tests across the service, client, and
  widget) and make sure it is green.
- **Explain the why.** The PR description should say what problem this solves and
  why this approach, not just what the diff does. The diff already says what.
- **Read like the code around it.** Match the existing style, naming, and comment
  density. Comments explain why, not what.

## Style

- Plain ASCII. No emoji, and no fancy typography (no em-dash, curly quotes, or
  the ellipsis character). Use `--`, straight quotes, and `...`.
- Conventional Commits for commit messages and PR titles:
  `type(scope): description` (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`).

## A note on AI-generated pull requests

Using an AI assistant to help write a change is fine. Opening a large,
machine-generated PR that you have not read, run, or tested is not. Those get
closed.

Before you open a PR, you should be able to answer, in your own words:

- What does this change do, and why is it needed?
- How did you test it? What did you actually run?
- What did you consider and decide against?

If you cannot answer those, the change is not ready. A reviewer's time is the
scarce resource here; respect it by doing the thinking first.

## Local setup

```bash
npm install
npx convex dev --once   # generate the API / deploy locally
npm test
```

See [`docs/TESTING.md`](docs/TESTING.md) for the full local walkthrough.
