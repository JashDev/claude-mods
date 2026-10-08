import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitInfo } from '../types'
import { BRANCH_LIMIT, baseName, behindLabel, changedFiles, firstLine, parseBase, parseGit } from './git'

const REFRESH_MS = 10_000
// Keeps the remote's default branch current so the behind count means something.
const FETCH_MS = 5 * 60_000
const git = atom({ plugin: 'session-path', key: 'git' } as const, null)

const REASON: Record<string, string> = {
  'no-surface': 'no screen is attached',
  'no-clipboard': 'this surface has no clipboard',
  refused: 'the system refused it',
}

// `/Users/<name>/a/b` → `a/b`; home itself → `~`. The copy keeps the full path.
export const shortPath = (path: string): string =>
  path.replace(/^\/(Users|home)\/[^/]+(\/|$)/, (_, _root, slash) => (slash ? '' : '~'))

// Work left running after a hook returns: a reload or unload may cut it off.
const background = (work: Promise<unknown>) => void work.catch(() => undefined)

const run = async ($: EngineInterface, argv: string[]) => $.process.run(['git', ...argv])

const loadGit = async ($: EngineInterface): Promise<GitInfo | null> => {
  try {
    const head = await run($, ['rev-parse', '--abbrev-ref', 'HEAD'])
    if (head.exitCode !== 0) return null
    const sha = await run($, ['rev-parse', '--short', 'HEAD'])
    const refs = await run($, [
      'for-each-ref',
      '--sort=-committerdate',
      `--count=${BRANCH_LIMIT}`,
      '--format=%(refname:short)',
      'refs/heads',
    ])

    const symbolic = await run($, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    const base = parseBase(symbolic.stdout, symbolic.exitCode)
    const count = await run($, ['rev-list', '--count', `HEAD..${base}`])
    const hasBase = count.exitCode === 0

    return {
      ...parseGit(head.stdout, sha.stdout, refs.stdout),
      base: hasBase ? base : null,
      behind: hasBase ? Number.parseInt(count.stdout.trim(), 10) || 0 : 0,
    }
  } catch {
    return null
  }
}

const refreshGit = async ($: EngineInterface) => {
  const next = await loadGit($)
  await update($, git, prev =>
    prev &&
    next &&
    prev.branch === next.branch &&
    prev.behind === next.behind &&
    prev.base === next.base &&
    prev.branches.join() === next.branches.join()
      ? prev
      : next,
  )
}

// Updates only the remote's default branch; never asks for credentials.
const fetchBase = async ($: EngineInterface) => {
  const info = await read($, git)
  if (!info?.base) return
  try {
    await $.process.run(['git', 'fetch', '--quiet', '--no-tags', 'origin', baseName(info.base)], {
      env: { GIT_TERMINAL_PROMPT: '0' },
      timeoutMs: 20_000,
    })
  } catch {
    // Offline or no access: the count stays as of the last fetch.
  }
  await refreshGit($)
}

type Surface = Parameters<EngineInterface['ui']['copy']>[0]['surface']

const copy = async ($: EngineInterface, text: string, what: string, surface: Surface) => {
  const copied = await $.ui.copy({ text, surface })
  $.ui.toast(copied.isCopied ? `${what} copied` : `Could not copy: ${REASON[copied.reason] ?? copied.reason}`)
}

const switchTo = async ($: EngineInterface, target: string, isWorking: boolean) => {
  const current = (await read($, git)) ?? (await loadGit($))
  if (!current || target === current.branch) return

  if (isWorking) {
    $.ui.toast('Claude is working: wait for the turn to finish before switching branches')
    return
  }

  const status = await run($, ['status', '--porcelain', '--untracked-files=no'])
  const changed = changedFiles(status.stdout)
  if (changed > 0) {
    $.ui.toast(
      `${changed} uncommitted ${changed === 1 ? 'change' : 'changes'}. Commit or stash before switching branches.`,
    )
    return
  }

  const result = await run($, ['switch', target])
  if (result.exitCode !== 0) {
    $.ui.toast(`Could not switch to ${target}: ${firstLine(result.stderr) || 'git switch failed'}`)
    return
  }

  $.ui.toast(`On ${target}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    background(refreshGit($).then(() => fetchBase($)))
    $.clock.every(REFRESH_MS, () => background(refreshGit($)))
    $.clock.every(FETCH_MS, () => background(fetchBase($)))

    return started
  })

  on('turn.complete', async ($, e, next) => {
    background(refreshGit($))
    return next(e)
  })

  // A checkout run by Claude or by hand shows right away.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    background(refreshGit($))
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // Mobile draws no Select yet: there the branch is shown, not switched.
    const Select = 'Select' in ui ? ui.Select : undefined
    const cwd = await $.session.cwd()
    // The first draw can come before session.start's read has landed; drawing
    // is pure, so read git here without storing it.
    const info = (await read($, git)) ?? (await loadGit($))

    return (
      <Box justifyContent="space-between" gap={1}>
        <Box gap={1} flexShrink={1} minWidth={0}>
          <Text dimColor>📁</Text>
          <Text wrap="truncate-start">{shortPath(cwd)}</Text>
        </Box>
        <Box gap={1} flexShrink={0}>
          {info && behindLabel(info) && <Text color="warning">{behindLabel(info)}</Text>}
          {info && !Select && <Text dimColor>⎇ {info.branch}</Text>}
          {info && Select && (
            <Select
              key="branch"
              label="⎇"
              value={info.branch}
              options={(info.isDetached ? [info.branch, ...info.branches] : info.branches).map(name => ({
                value: name,
                label: info.isDetached && name === info.branch ? `${name} (detached)` : name,
              }))}
              onSelect={async (value: string) => {
                await switchTo($, value, e.props.isWorking)
                await refreshGit($)
                $.ui.invalidate('ui.render')
              }}
            />
          )}
          {info && (
            <Button
              key="copy-branch"
              label="Copy branch"
              onPress={press => copy($, info.branch, 'Branch', press.surface)}
            />
          )}
          <Button key="copy-path" label="Copy path" onPress={press => copy($, cwd, 'Path', press.surface)} />
        </Box>
      </Box>
    )
  })
}
