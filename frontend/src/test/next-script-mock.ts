import type { ScriptProps } from 'next/script'
import { vi } from 'vitest'

// One cached spy identity even when setupFiles rerun with --no-isolate.
// Never loads a real script or sends analytics traffic.
export const nextScriptMock = vi.fn((_props: ScriptProps) => null)
