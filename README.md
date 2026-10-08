# claude-mods

Small [Claude Code](https://claude.com/claude-code) mods by JashDev. Each one is a plugin with a hooks module, and works in the terminal and in the Code tab of Claude Desktop.

## Install

Add the marketplace once:

```bash
claude plugin marketplace add JashDev/claude-mods
```

Then install the mods you want:

```bash
claude plugin install session-path@jashdev-mods
```

New sessions pick it up. Sessions that were already open need a restart.

## Mods

### session-path

A row above the prompt with where the session is and which branch it is on.

```
📁 projects/acme/app            12 behind main  ⎇ feat/login-form [▾]  [Copy branch]  [Copy path]
```

- **Path**: the session folder, without `/Users/<you>/` (or `/home/<you>/`). **Copy path** copies the full path.
- **Branch picker**: your 30 most recent local branches. Picking one runs `git switch`. It refuses, and tells you why, when there are uncommitted changes, while Claude is in the middle of a turn, or when `git switch` fails. A detached HEAD shows its short sha.
- **Copy branch**: copies the branch name (or the sha when detached).
- **Behind main**: how many commits of the remote's default branch (`origin/HEAD`, else `origin/main`) your branch does not have yet. Hidden when you are up to date or on that branch.

The row refreshes after every turn, after every Bash command and every 10 seconds, so a checkout made by Claude or in another terminal shows up on its own. On Claude's mobile app, which has no picker yet, the branch is shown as text.

#### What it runs

Everything happens in the session folder, through `git`:

| When | Command |
| --- | --- |
| Every refresh | `git rev-parse`, `git for-each-ref`, `git symbolic-ref`, `git rev-list --count` (read only) |
| At session start and every 5 minutes | `git fetch --quiet --no-tags origin <default branch>`, with `GIT_TERMINAL_PROMPT=0` so it never asks for credentials. It only updates that one remote-tracking ref |
| When you pick a branch | `git status --porcelain --untracked-files=no`, then `git switch <branch>` |

It never stashes, commits, pushes or deletes anything.

`claude plugin validate plugins/session-path` prints the same list: the events it hooks and every call it makes.

#### Develop

```bash
claude plugin test plugins/session-path
```

```bash
claude --plugin-dir plugins/session-path
```

## License

MIT
