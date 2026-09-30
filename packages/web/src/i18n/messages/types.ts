import type { PluralForms } from '../plural-forms'
import type { en as shellEn } from '../areas/shell'
import type { en as dialogsEn } from '../areas/dialogs'
import type { en as prefsEn } from '../areas/prefs'
import type { en as forgeEn } from '../areas/forge'
import type { en as gitEn } from '../areas/git'
import type { en as composeEn } from '../areas/compose'
import type { en as threadEn } from '../areas/thread'
import type { en as tasksEn } from '../areas/tasks'
import type { en as planReviewEn } from '../areas/planReview'
import type { en as compareEn } from '../areas/compare'
import type { en as trackerEn } from '../areas/tracker'
import type { en as workflowsEn } from '../areas/workflows'
import type { en as skillsEn } from '../areas/skills'
import type { en as automationsEn } from '../areas/automations'
import type { en as dashboardEn } from '../areas/dashboard'
import type { en as inboxEn } from '../areas/inbox'

/**
 * The one typed shape both `en.ts` and `pl.ts` are written against (`export const en: Messages`
 * / `export const pl: Messages`) — not one derived from the other. That is deliberate: typing
 * Polish as `typeof en` would force every Polish VALUE to satisfy whatever TypeScript inferred
 * for the English literal (fine for plain strings, but it also means the two files can never be
 * reviewed as symmetric peers against a single contract). Typing both against this interface
 * gets the same guarantee the task asks for — a missing, renamed or extra Polish key is a
 * compile error — while keeping `en.ts` and `pl.ts` structurally interchangeable and equally
 * authoritative.
 *
 * Namespaces roughly mirror where the strings render (`nav`, `tasksPage`, `composer`, …) rather
 * than the component tree, so a translator can find "the Tasks page" without knowing which file
 * renders it. Plural-aware entries use `PluralForms` (`one`/`few`/`many`/`other`) and resolve
 * through `tn()`; everything else is a plain string interpolated through `t()`.
 */
export interface Messages {
  common: {
    cancel: string
    save: string
    delete: string
    folderNotFound: string
    nothingMatches: string
  }
  nav: {
    tasks: string
    inbox: string
    git: string
    tracker: string
    automations: string
    skills: string
    workflows: string
    settings: string
    dashboard: string
    allTasks: string
    globalSettings: string
    newTask: string
    addProject: string
    openLocalFolder: string
    cloneFromGithub: string
    searchEllipsis: string
    navigation: string
    openMenu: string
    closeMenu: string
    resizeSidebar: string
    updateCezar: string
    skillsUpdateAvailable: string
    notSaved: string
    notSavedTitle: string
    mainAria: string
    waitingTitle: PluralForms
    more: string
    unreadTasksTitle: PluralForms
  }
  commandPalette: {
    title: string
    description: string
    placeholder: string
    empty: string
    recentlyFinished: string
    views: string
    projects: string
    actions: string
    toggleTheme: string
  }
  tasksPage: {
    active: string
    archived: string
    markAllRead: string
    archiveFinished: string
    searchPlaceholder: string
    searchAriaLabel: string
    compare: string
    renameAria: string
    newTaskFabAria: string
    count: PluralForms
    emptySearchTitle: string
    emptyArchiveTitle: string
    emptyNoTasksTitle: string
    emptyNoTasksSubtitle: string
  }
  settings: {
    sectionsAriaLabel: string
    general: string
    globalSettingsChip: string
    storedInHome: string
    indexTitleGlobal: string
    indexTitleProject: string
    indexSubtitleGlobal: string
    indexSubtitleProject: string
    crossLinkProjectScoped: string
    crossLinkGlobal: string
    sections: {
      tracker: { title: string; description: string }
      agents: { title: string; description: string }
      'agent-config': { title: string; description: string }
      worktrees: { title: string; description: string }
      bookmarklets: { title: string; description: string }
      'prompt-templates': { title: string; description: string }
      appearance: { title: string; description: string }
      notifications: { title: string; description: string }
      resources: { title: string; description: string }
      skills: { title: string; description: string }
      accounts: { title: string; description: string }
      projects: { title: string; description: string }
      keyboard: { title: string; description: string }
    }
  }
  appearance: {
    themeTitle: string
    themeHint: string
    themeSystem: string
    themeLight: string
    themeDark: string
    languageTitle: string
    languageHint: string
    languageEnglish: string
    languagePolish: string
    accentTitle: string
    accentHint: string
    accentLime: string
    accentViolet: string
    densityTitle: string
    densityHint: string
    densityComfortable: string
    densityCompact: string
    densityUltra: string
    widthTitle: string
    widthHint: string
    widthNarrow: string
    widthWide: string
    projectOrderTitle: string
    projectOrderHint: string
    resetOrder: string
  }
  tasks: typeof tasksEn
  thread: typeof threadEn
  compose: typeof composeEn
  git: typeof gitEn
  forge: typeof forgeEn
  prefs: typeof prefsEn
  dialogs: typeof dialogsEn
  shell: typeof shellEn
  inbox: typeof inboxEn
  dashboard: typeof dashboardEn
  automations: typeof automationsEn
  skills: typeof skillsEn
  workflows: typeof workflowsEn
  tracker: typeof trackerEn
  compare: typeof compareEn
  planReview: typeof planReviewEn
}
