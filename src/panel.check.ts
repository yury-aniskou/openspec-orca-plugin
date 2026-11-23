// `orca plugin check` renders the panel once per scenario; with no focused workspace the worker
// answers the no-workspace state.
import { defineCheck } from 'orca/testing'

export default defineCheck({
  fresh: {}
})
