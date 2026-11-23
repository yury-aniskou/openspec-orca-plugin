// The panel <-> worker contract, declared once: src/panel.tsx and src/worker.ts both read it.
export {}

declare module 'orca' {
  interface PluginRequests {
    /** OpenSpec state of the focused workspace. */
    'openspec.state': { output: OpenSpecState }
    /** Same as `openspec.state`; the Refresh button. */
    'openspec.refresh': { output: OpenSpecState }
    /** Launches an agent in the focused workspace and types the OpenSpec command for `step`. */
    'openspec.launch': {
      input: { step: OpsxStep; change?: string; description?: string; agent?: string; model?: string }
      output: { terminalId: string }
    }
    /** The agent kinds the pickers offer, the default first, and suggested models per agent.
     *  Without `agent`/`model` a launch uses the saved choice (storage `launchAgent`, `launchModel`), then settings. */
    'openspec.agents': { output: { agents: string[]; defaultAgent: string; models: Record<string, string[]> } }
    /** The agent and model the launch dialog shows for `step`. */
    'openspec.stageChoice': { input: { step: OpsxStep }; output: { agent: string; model: string; ask: boolean } }
    /** Saves the agent and model as the default for `step`. */
    'openspec.saveStageChoice': {
      input: { step: OpsxStep; agent: string; model: string; ask?: boolean }
      output: { saved: boolean } }
    /** Models for an agent matching `query` (every word in the id or name), at most `limit`; `total` counts all matches.
     *  `catalog` is `fallback` when models.dev could not be loaded and only built-in suggestions are listed. */
    'openspec.models': {
      input: { agent: string; query?: string; limit?: number }
      output: { items: { id: string; name: string }[]; total: number; catalog: 'ready' | 'fallback' }
    }
    /** Reloads the models.dev catalog now. */
    'openspec.refreshModels': { output: { catalog: 'ready' | 'fallback' } }
    /** Opens a terminal running `openspec init` in the focused workspace. */
    'openspec.init': { output: { terminalId: string } }
    /** Creates openspec/board.openspec if missing and opens it in an editor tab. */
    'openspec.openBoard': { output: { opened: boolean; message?: string } }
    /** Opens the board on the page of an active change. */
    'openspec.openChangeOnBoard': { input: { change: string }; output: { opened: boolean; message?: string } }
    /** Opens the board on the page of `spec`. */
    'openspec.openSpecOnBoard': { input: { spec: string }; output: { opened: boolean; message?: string } }
    /** The spec the board should show right after it opens, once; null when none is waiting. */
    'openspec.takeBoardTarget': { output: { spec: string | null; change: string | null; archived: boolean } }
    /** The command line an agent would be sent for `step`, as the board shows it in dialogs. */
    'openspec.promptFor': { input: { step: OpsxStep; change: string }; output: { prompt: string } }
    /** Archived changes, newest first; `filter` matches names and summaries. */
    'openspec.archived': {
      input: { offset: number; limit: number; filter?: string }
      output: { total: number; items: ChangeInfo[] }
    }
    /** Markdown files of a change, the specs it has deltas for, and related changes. */
    'openspec.changeFiles': {
      input: { change: string; archived?: boolean }
      output: { files: ChangeFileInfo[]; specs: string[]; related: SpecUseInfo[] }
    }
    /** The spec.md path of a spec and the changes that carry a delta for it. */
    'openspec.specInfo': { input: { spec: string }; output: { path: string; changedBy: SpecUseInfo[] } }
    /** Reads a markdown file under openspec/; `path` is relative to openspec/. */
    'openspec.readFile': { input: { path: string }; output: { text: string } }
    /** Opens a markdown file under openspec/ in an editor tab. */
    'openspec.openFile': { input: { path: string }; output: { opened: boolean } }
  }
  interface PluginPanelEvents {
    /** Fresh state after a workspace switch, a launched agent finishing, or a refresh. */
    'openspec.changed': OpenSpecState
    /** Asks open panels to show the New change form (from the palette command). */
    'openspec.showForm': Record<string, never>
    /** Asks an already open board to show a spec page. */
    'openspec.showSpec': { spec: string }
    /** Asks an already open board to show an active change's page. */
    'openspec.showChange': { change: string; archived: boolean }
  }
}

export type OpsxStep = 'explore' | 'propose' | 'apply' | 'verify' | 'archive'

export type ChangeInfo = {
  name: string
  done: number
  /** null when the change has no tasks.md. */
  total: number | null
  /** First unchecked task. */
  next?: string
  /** First sentence of the proposal's Why section. */
  summary?: string
  /** `created` from .openspec.yaml, or the date prefix of an archived folder. */
  created?: string
}

export type ChangeFileInfo = {
  /** Relative to openspec/. */
  path: string
  label: string
  group: 'docs' | 'other' | 'delta'
}

export type SpecUseInfo = { name: string; archived: boolean }

/** Alias: archived changes use `name` = folder name. */
export type ArchivedInfo = ChangeInfo

export type OpenSpecState = {
  status: 'no-workspace' | 'no-openspec' | 'remote' | 'ok' | 'error'
  workspace?: string
  changes: ChangeInfo[]
  specs: string[]
  error?: string
}
