import type { Messages } from './types'
import { en as shellEn } from '../areas/shell'
import { en as dialogsEn } from '../areas/dialogs'
import { en as prefsEn } from '../areas/prefs'
import { en as forgeEn } from '../areas/forge'
import { en as gitEn } from '../areas/git'
import { en as composeEn } from '../areas/compose'
import { en as threadEn } from '../areas/thread'
import { en as tasksEn } from '../areas/tasks'
import { en as dashboardEn } from '../areas/dashboard'
import { en as inboxEn } from '../areas/inbox'

/**
 * The English dictionary — also the reference translators work from. See `types.ts` for why
 * this and `pl.ts` are both typed against `Messages` directly rather than one deriving from the
 * other.
 *
 * English has no grammatical plural beyond one/other, so every `PluralForms` leaf below repeats
 * its `other` text under `few`/`many` — see `plural-forms.ts`.
 */
export const en: Messages = {
  common: {
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    folderNotFound: 'folder not found',
    nothingMatches: 'Nothing matches.',
  },
  nav: {
    tasks: 'Tasks',
    inbox: 'Inbox',
    git: 'Git',
    tracker: 'Tracker',
    automations: 'Automations',
    skills: 'Skills',
    workflows: 'Workflows',
    settings: 'Settings',
    dashboard: 'Dashboard',
    allTasks: 'All tasks',
    globalSettings: 'Global settings',
    newTask: 'New task',
    addProject: 'Add project',
    openLocalFolder: 'Open local folder…',
    cloneFromGithub: 'Clone from GitHub…',
    searchEllipsis: 'Search…',
    navigation: 'Navigation',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    resizeSidebar: 'Resize the sidebar',
    updateCezar: 'Update cezar',
    skillsUpdateAvailable: 'Skills update available',
    notSaved: 'not saved',
    notSavedTitle: 'cezar is serving this folder — it is not in your saved projects. Add it in Global settings → Projects.',
    mainAria: 'Main',
    waitingTitle: {
      one: '{count} task needs you',
      few: '{count} tasks need you',
      many: '{count} tasks need you',
      other: '{count} tasks need you',
    },
    more: 'More…',
    unreadTasksTitle: {
      one: '{count} unread finished task',
      few: '{count} unread finished tasks',
      many: '{count} unread finished tasks',
      other: '{count} unread finished tasks',
    },
  },
  commandPalette: {
    title: 'Command palette',
    description: 'Search projects, tasks, views, actions, and skills',
    placeholder: 'Search projects, tasks, views, actions, skills…',
    empty: 'Nothing matches.',
    recentlyFinished: 'Recently finished',
    views: 'Views',
    projects: 'Projects',
    actions: 'Actions',
    toggleTheme: 'Toggle theme',
  },
  tasksPage: {
    active: 'Active',
    archived: 'Archived',
    markAllRead: 'Mark all read',
    archiveFinished: 'Archive finished',
    searchPlaceholder: 'Search tasks…',
    searchAriaLabel: 'Search tasks',
    compare: 'Compare',
    renameAria: 'Rename task',
    newTaskFabAria: 'New task',
    count: {
      one: '{count} task',
      few: '{count} tasks',
      many: '{count} tasks',
      other: '{count} tasks',
    },
    emptySearchTitle: 'No matching tasks',
    emptyArchiveTitle: 'Nothing archived yet',
    emptyNoTasksTitle: 'No tasks yet',
    emptyNoTasksSubtitle: 'Describe a task to get started.',
  },
  settings: {
    sectionsAriaLabel: 'Settings sections',
    general: 'General',
    globalSettingsChip: 'Global settings',
    storedInHome: 'Stored in ~/.cezar',
    indexTitleGlobal: 'Global settings',
    indexTitleProject: 'Settings',
    indexSubtitleGlobal: 'Preferences for you and this machine, shared by every project.',
    indexSubtitleProject: 'Configure this project and its agents.',
    crossLinkProjectScoped: 'Agents, worktrees, bookmarklets and prompt templates are per project.',
    crossLinkGlobal: 'Appearance, notifications, host resources and the project registry live in <link>{title}</link>.',
    sections: {
      tracker: { title: 'Issue tracker', description: 'Connect this project to Jira or Linear.' },
      agents: { title: 'Agents', description: 'Default runner, models and system prompt.' },
      'agent-config': {
        title: 'Agent config',
        description: 'Edit the coding agents’ own config files, per scope.',
      },
      worktrees: {
        title: 'Worktrees',
        description: 'How many finished task worktrees this project keeps on disk.',
      },
      bookmarklets: { title: 'Bookmarklets', description: 'Launch skills from a GitHub PR or issue.' },
      'prompt-templates': {
        title: 'Prompt templates',
        description: 'Reusable snippets for follow-up instructions.',
      },
      appearance: { title: 'Appearance', description: 'Theme, language, accent and density.' },
      notifications: {
        title: 'Notifications',
        description: 'Browser notifications when an agent needs you.',
      },
      resources: {
        title: 'Resources',
        description: 'Parallel tasks and per-task memory limit, across every project.',
      },
      skills: { title: 'Skills', description: 'Updates for skills installed on this machine.' },
      accounts: {
        title: 'Agent accounts',
        description: 'Second logins, and the agent and models a project uses when it has chosen none.',
      },
      projects: {
        title: 'Projects',
        description: 'The workspace registry and where GitHub checkouts land.',
      },
      keyboard: { title: 'Keyboard', description: 'Shortcuts.' },
    },
  },
  appearance: {
    themeTitle: 'Theme',
    themeHint: 'System follows your OS preference. Applies to this browser.',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    languageTitle: 'Language',
    languageHint: 'The cockpit’s interface language. Applies to this browser.',
    languageEnglish: 'English',
    languagePolish: 'Polski',
    accentTitle: 'Accent',
    accentHint: "The primary action color. Saved with this repo's cockpit state.",
    accentLime: 'Lime',
    accentViolet: 'Violet',
    densityTitle: 'Density',
    densityHint: 'Compact tightens spacing across the cockpit — text stays the same size.',
    densityComfortable: 'Comfortable',
    densityCompact: 'Compact',
    densityUltra: 'Compact for real',
    widthTitle: 'Reading width',
    widthHint:
      "Wide lets a task's session and commits use more of the screen. Narrow keeps a comfortable reading column. The Changes tab is always full-width.",
    widthNarrow: 'Narrow',
    widthWide: 'Wide',
    projectOrderTitle: 'Project order',
    projectOrderHint:
      'The sidebar is in the order you dragged it into. Reset puts it back to most-recently-opened first. Shared with every browser signed in to this cezar.',
    resetOrder: 'Reset order',
  },
  tasks: tasksEn,
  thread: threadEn,
  compose: composeEn,
  git: gitEn,
  forge: forgeEn,
  prefs: prefsEn,
  dialogs: dialogsEn,
  shell: shellEn,
  inbox: inboxEn,
  dashboard: dashboardEn,
}
