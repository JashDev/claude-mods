export type GitInfo = {
  /** Current branch, or a short sha when detached. */
  branch: string
  isDetached: boolean
  /** Local branches, most recently committed first. */
  branches: string[]
  /** The remote's default branch (`origin/main`), when it has one. */
  base: string | null
  /** Commits on `base` that HEAD does not have yet. */
  behind: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-path': { git: GitInfo | null }
  }
}
