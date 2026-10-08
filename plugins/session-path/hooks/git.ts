import type { GitInfo } from '../types'

export const BRANCH_LIMIT = 30

// Output of `git rev-parse --abbrev-ref HEAD`, `git rev-parse --short HEAD`
// and `git for-each-ref` → what the band draws.
export const parseGit = (head: string, sha: string, refs: string): Omit<GitInfo, 'base' | 'behind'> => {
  const name = head.trim()
  const isDetached = name === 'HEAD'
  const branch = isDetached ? sha.trim() : name
  const listed = refs.split('\n').map(line => line.trim()).filter(Boolean)
  const branches = isDetached || listed.includes(branch) ? listed : [branch, ...listed]

  return { branch, isDetached, branches }
}

// Lines of `git status --porcelain --untracked-files=no`.
export const changedFiles = (porcelain: string): number =>
  porcelain.split('\n').filter(line => line.trim()).length

export const firstLine = (text: string): string =>
  text.split('\n').map(line => line.trim()).find(Boolean) ?? ''

// `git symbolic-ref --short refs/remotes/origin/HEAD` → `origin/main`; a remote
// without that ref falls back to `origin/main`.
export const parseBase = (symbolic: string, exitCode: number): string =>
  exitCode === 0 && symbolic.trim() ? symbolic.trim() : 'origin/main'

// `origin/main` → `main`.
export const baseName = (base: string): string => base.replace(/^[^/]+\//, '')

export const behindLabel = (info: Pick<GitInfo, 'branch' | 'base' | 'behind'>): string | null =>
  info.base && info.behind > 0 && info.branch !== baseName(info.base)
    ? `${info.behind} behind ${baseName(info.base)}`
    : null
