import type { Messages } from './types'
import { pl as shellPl } from '../areas/shell'
import { pl as dialogsPl } from '../areas/dialogs'
import { pl as prefsPl } from '../areas/prefs'
import { pl as forgePl } from '../areas/forge'
import { pl as gitPl } from '../areas/git'
import { pl as composePl } from '../areas/compose'
import { pl as threadPl } from '../areas/thread'
import { pl as tasksPl } from '../areas/tasks'
import { pl as inboxPl } from '../areas/inbox'

/**
 * The Polish dictionary. Typed against `Messages` (see `types.ts`), so a missing, renamed or
 * mistyped key here is a compile error rather than a silently-blank string in production.
 *
 * Established developer terms stay in English, matching how Polish developers actually talk:
 * commit, merge request, pull request, worktree, diff, pipeline. Everything else aims for
 * natural, concise cockpit Polish rather than a literal word-for-word rendering of the English.
 *
 * Plural leaves use Polish's three cardinal categories (`Intl.PluralRules('pl').select`):
 * `one` (1), `few` (2–4, 22–24, …), `many` (0, 5–21, 25–31, …) and `other` (fractional counts,
 * rare in this UI — treated like `few`/genitive singular, since every count here is an integer).
 */
export const pl: Messages = {
  common: {
    cancel: 'Anuluj',
    save: 'Zapisz',
    delete: 'Usuń',
    folderNotFound: 'nie znaleziono folderu',
    nothingMatches: 'Nic nie znaleziono.',
  },
  nav: {
    tasks: 'Zadania',
    inbox: 'Skrzynka',
    git: 'Git',
    tracker: 'Tracker',
    automations: 'Automatyzacje',
    skills: 'Skille',
    workflows: 'Workflow',
    settings: 'Ustawienia',
    dashboard: 'Panel',
    allTasks: 'Wszystkie zadania',
    globalSettings: 'Ustawienia globalne',
    newTask: 'Nowe zadanie',
    addProject: 'Dodaj projekt',
    openLocalFolder: 'Otwórz folder lokalny…',
    cloneFromGithub: 'Klonuj z GitHuba…',
    searchEllipsis: 'Szukaj…',
    navigation: 'Nawigacja',
    openMenu: 'Otwórz menu',
    closeMenu: 'Zamknij menu',
    resizeSidebar: 'Zmień szerokość panelu bocznego',
    updateCezar: 'Zaktualizuj cezara',
    skillsUpdateAvailable: 'Dostępna aktualizacja skilli',
    notSaved: 'niezapisany',
    notSavedTitle: 'cezar obsługuje ten folder — nie ma go na liście zapisanych projektów. Dodaj go w Ustawienia globalne → Projekty.',
    mainAria: 'Główna',
    waitingTitle: {
      one: '{count} zadanie czeka na Ciebie',
      few: '{count} zadania czekają na Ciebie',
      many: '{count} zadań czeka na Ciebie',
      other: '{count} zadania czeka na Ciebie',
    },
    more: 'Więcej…',
    unreadTasksTitle: {
      one: '{count} nieprzeczytane zakończone zadanie',
      few: '{count} nieprzeczytane zakończone zadania',
      many: '{count} nieprzeczytanych zakończonych zadań',
      other: '{count} nieprzeczytanego zakończonego zadania',
    },
  },
  commandPalette: {
    title: 'Paleta poleceń',
    description: 'Szukaj projektów, zadań, widoków, akcji i skilli',
    placeholder: 'Szukaj projektów, zadań, widoków, akcji, skilli…',
    empty: 'Nic nie znaleziono.',
    recentlyFinished: 'Niedawno zakończone',
    views: 'Widoki',
    projects: 'Projekty',
    actions: 'Akcje',
    toggleTheme: 'Zmień motyw',
  },
  tasksPage: {
    active: 'Aktywne',
    archived: 'Zarchiwizowane',
    markAllRead: 'Oznacz wszystkie jako przeczytane',
    archiveFinished: 'Zarchiwizuj zakończone',
    searchPlaceholder: 'Szukaj zadań…',
    searchAriaLabel: 'Szukaj zadań',
    compare: 'Porównaj',
    renameAria: 'Zmień nazwę zadania',
    newTaskFabAria: 'Nowe zadanie',
    count: {
      one: '{count} zadanie',
      few: '{count} zadania',
      many: '{count} zadań',
      other: '{count} zadania',
    },
    emptySearchTitle: 'Brak pasujących zadań',
    emptyArchiveTitle: 'Nic jeszcze nie zarchiwizowano',
    emptyNoTasksTitle: 'Brak zadań',
    emptyNoTasksSubtitle: 'Opisz zadanie, aby zacząć.',
  },
  settings: {
    sectionsAriaLabel: 'Sekcje ustawień',
    general: 'Ogólne',
    globalSettingsChip: 'Ustawienia globalne',
    storedInHome: 'Zapisywane w ~/.cezar',
    indexTitleGlobal: 'Ustawienia globalne',
    indexTitleProject: 'Ustawienia',
    indexSubtitleGlobal: 'Preferencje dla Ciebie i tego komputera, wspólne dla każdego projektu.',
    indexSubtitleProject: 'Skonfiguruj ten projekt i jego agentów.',
    crossLinkProjectScoped: 'Agenci, worktree, bookmarklety i szablony promptów są ustawiane per projekt.',
    crossLinkGlobal: 'Wygląd, powiadomienia, zasoby hosta i rejestr projektów znajdują się w: <link>{title}</link>.',
    sections: {
      tracker: { title: 'Tracker zgłoszeń', description: 'Połącz ten projekt z Jira lub Linear.' },
      agents: { title: 'Agenci', description: 'Domyślny runner, modele i prompt systemowy.' },
      'agent-config': {
        title: 'Konfiguracja agenta',
        description: 'Edytuj własne pliki konfiguracyjne agentów kodujących, dla każdego zakresu.',
      },
      worktrees: {
        title: 'Worktree',
        description: 'Ile worktree zakończonych zadań ten projekt przechowuje na dysku.',
      },
      bookmarklets: { title: 'Bookmarklety', description: 'Uruchamiaj skille z PR-a lub issue na GitHubie.' },
      'prompt-templates': {
        title: 'Szablony promptów',
        description: 'Wielokrotnego użytku fragmenty dla instrukcji uzupełniających.',
      },
      appearance: { title: 'Wygląd', description: 'Motyw, język, akcent i gęstość.' },
      notifications: {
        title: 'Powiadomienia',
        description: 'Powiadomienia w przeglądarce, gdy agent potrzebuje Twojej uwagi.',
      },
      resources: {
        title: 'Zasoby',
        description: 'Równoległe zadania i limit pamięci na zadanie, dla wszystkich projektów.',
      },
      skills: { title: 'Skille', description: 'Aktualizacje skilli zainstalowanych na tym komputerze.' },
      accounts: {
        title: 'Konta agentów',
        description: 'Dodatkowe logowania oraz agent i modele, których projekt używa, gdy nie wybrano żadnych.',
      },
      projects: {
        title: 'Projekty',
        description: 'Rejestr przestrzeni roboczej i miejsce, gdzie trafiają klony z GitHuba.',
      },
      keyboard: { title: 'Klawiatura', description: 'Skróty.' },
    },
  },
  appearance: {
    themeTitle: 'Motyw',
    themeHint: 'System dopasowuje się do ustawień systemu operacyjnego. Dotyczy tej przeglądarki.',
    themeSystem: 'System',
    themeLight: 'Jasny',
    themeDark: 'Ciemny',
    languageTitle: 'Język',
    languageHint: 'Język interfejsu kokpitu. Dotyczy tej przeglądarki.',
    languageEnglish: 'English',
    languagePolish: 'Polski',
    accentTitle: 'Akcent',
    accentHint: 'Kolor głównej akcji. Zapisywany ze stanem kokpitu tego repozytorium.',
    accentLime: 'Limonkowy',
    accentViolet: 'Fioletowy',
    densityTitle: 'Gęstość',
    densityHint: 'Kompaktowa zmniejsza odstępy w całym kokpicie — tekst zachowuje ten sam rozmiar.',
    densityComfortable: 'Komfortowa',
    densityCompact: 'Kompaktowa',
    densityUltra: 'Naprawdę kompaktowa',
    widthTitle: 'Szerokość czytania',
    widthHint:
      'Szeroki układ pozwala sesji zadania i commitom zająć więcej ekranu. Wąski zachowuje komfortową kolumnę do czytania. Karta Zmiany jest zawsze pełnej szerokości.',
    widthNarrow: 'Wąska',
    widthWide: 'Szeroka',
    projectOrderTitle: 'Kolejność projektów',
    projectOrderHint:
      'Panel boczny ma kolejność, w jakiej go przeciągnięto. Reset przywraca kolejność od ostatnio otwieranych. Wspólne dla każdej przeglądarki zalogowanej do tego cezara.',
    resetOrder: 'Przywróć kolejność',
  },
  tasks: tasksPl,
  thread: threadPl,
  compose: composePl,
  git: gitPl,
  forge: forgePl,
  prefs: prefsPl,
  dialogs: dialogsPl,
  shell: shellPl,
  inbox: inboxPl,
}
