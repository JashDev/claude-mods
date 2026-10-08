import { describe, expect, test } from 'claude-code/testing'

import { baseName, behindLabel, changedFiles, firstLine, parseBase, parseGit } from './git'

describe('git', () => {
  test('parseGit keeps the current branch in the list', () => {
    expect(parseGit('main\n', 'abc1234\n', 'feat/a\nmain\n')).toEqual({
      branch: 'main',
      isDetached: false,
      branches: ['feat/a', 'main'],
    })
    expect(parseGit('old\n', 'abc1234\n', 'feat/a\n').branches).toEqual(['old', 'feat/a'])
  })

  test('parseGit shows the sha when detached', () => {
    expect(parseGit('HEAD\n', 'abc1234\n', 'main\n')).toEqual({
      branch: 'abc1234',
      isDetached: true,
      branches: ['main'],
    })
  })

  test('changedFiles counts porcelain lines', () => {
    expect(changedFiles('')).toBe(0)
    expect(changedFiles(' M src/a.ts\nM  src/b.ts\n')).toBe(2)
  })

  test('firstLine skips blank lines', () => {
    expect(firstLine('\nerror: pathspec x\nhint')).toBe('error: pathspec x')
  })

  test('parseBase falls back to origin/main', () => {
    expect(parseBase('origin/develop\n', 0)).toBe('origin/develop')
    expect(parseBase('', 128)).toBe('origin/main')
    expect(baseName('origin/main')).toBe('main')
  })

  test('behindLabel hides when up to date or on the base itself', () => {
    expect(behindLabel({ branch: 'feat/a', base: 'origin/main', behind: 12 })).toBe('12 behind main')
    expect(behindLabel({ branch: 'feat/a', base: 'origin/main', behind: 0 })).toBe(null)
    expect(behindLabel({ branch: 'main', base: 'origin/main', behind: 3 })).toBe(null)
    expect(behindLabel({ branch: 'feat/a', base: null, behind: 3 })).toBe(null)
  })
})
