import { describe, expect, mock, test } from 'claude-code/testing'

import { shortPath } from './register'

type Git = { dirty: string; switched: string[]; behind?: number }

const fakeGit = (on: any, git: Git) =>
  on('process.run', ($: unknown, e: { argv: readonly string[] }) => {
    const args = e.argv.slice(1).join(' ')
    const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '' } })
    if (args === 'rev-parse --abbrev-ref HEAD') return out(git.switched.at(-1) ?? 'main')
    if (args === 'rev-parse --short HEAD') return out('abc1234')
    if (args.startsWith('for-each-ref')) return out('main\nfeat/login-form\n')
    if (args.startsWith('status')) return out(git.dirty)
    if (args === 'symbolic-ref --short refs/remotes/origin/HEAD') return out('origin/main')
    if (args === 'rev-list --count HEAD..origin/main') return out(String(git.behind ?? 0))
    if (e.argv[1] === 'fetch') return out('')
    if (e.argv[1] === 'switch') {
      git.switched.push(String(e.argv[2]))
      return out('')
    }
    return out('', 1)
  })

const setup = async ($: any, on: any, surface: 'terminal' | 'desktop', git: Git, isWorking = false) => {
  const toasts: string[] = []
  const copied: string[] = []
  mock.clock(on)
  on('ui.copy', ($: unknown, e: { text: string }) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  fakeGit(on, git)
  on('session.cwd', () => ({ value: '/Users/someone/work/repo' }))
  on('session.start', ($: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('ui.toast', ($: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await $.session.start({ surface, isInteractive: true, cwd: '/Users/someone/work/repo' })
  const render = () =>
    $.ui.render({
      plugin: 'session-path',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking, maxRows: 10 },
    })

  return { toasts, copied, render }
}

describe('register', () => {
  test('shortPath drops the home prefix', () => {
    expect(shortPath('/Users/jane/projects/acme/app')).toBe('projects/acme/app')
    expect(shortPath('/home/dev/repo')).toBe('repo')
    expect(shortPath('/Users/jane')).toBe('~')
    expect(shortPath('/opt/work')).toBe('/opt/work')
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`shows the short path and the branch on ${surface}`, async ($, on) => {
      const { render } = await setup($, on, surface, { dirty: '', switched: [] })
      const tree = JSON.stringify(await render())

      expect(tree).toContain('"work/repo"')
      expect(tree).not.toContain('/Users/someone')
      expect(tree).toContain('feat/login-form')
    })

    test(`switches branch when the tree is clean on ${surface}`, async ($, on) => {
      const git = { dirty: '', switched: [] as string[] }
      const { toasts, render } = await setup($, on, surface, git)
      await render()
      await $.ui.select({ plugin: 'session-path', key: 'branch', value: 'feat/login-form' })

      expect(git.switched).toEqual(['feat/login-form'])
      expect(toasts).toContain('On feat/login-form')
    })

    test(`refuses to switch with uncommitted changes on ${surface}`, async ($, on) => {
      const git = { dirty: ' M src/a.ts\n', switched: [] as string[] }
      const { toasts, render } = await setup($, on, surface, git)
      await render()
      await $.ui.select({ plugin: 'session-path', key: 'branch', value: 'feat/login-form' })

      expect(git.switched).toEqual([])
      expect(toasts.join()).toContain('1 uncommitted change')
    })

    test(`shows how far behind main the branch is on ${surface}`, async ($, on) => {
      const git = { dirty: '', switched: ['feat/login-form'], behind: 12 }
      const { render } = await setup($, on, surface, git)

      expect(JSON.stringify(await render())).toContain('12 behind main')
    })

    test(`copies the branch name on ${surface}`, async ($, on) => {
      const git = { dirty: '', switched: ['feat/login-form'] }
      const { copied, toasts, render } = await setup($, on, surface, git)
      await render()
      await $.ui.press({ plugin: 'session-path', key: 'copy-branch' })

      expect(copied).toEqual(['feat/login-form'])
      expect(toasts).toContain('Branch copied')
    })

    test(`refuses to switch while Claude works on ${surface}`, async ($, on) => {
      const git = { dirty: '', switched: [] as string[] }
      const { toasts, render } = await setup($, on, surface, git, true)
      await render()
      await $.ui.select({ plugin: 'session-path', key: 'branch', value: 'feat/login-form' })

      expect(git.switched).toEqual([])
      expect(toasts.join()).toContain('Claude is working')
    })
  }
})
