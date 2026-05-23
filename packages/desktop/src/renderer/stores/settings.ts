import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { EditorThemeId } from '../constants/editorTheme'

export interface XmlEditorSettings {
  validationFeatureEnabled: boolean
  validateOnOpen: boolean
  revalidateShortcut: string
  editorTheme: EditorThemeId
}

export interface GeneralSettings {
  startupTool: 'home'
  downloadFolders: string[]
}

export interface BatchValidatorSettings {
  autoExpandResults: boolean
}

export interface PluginsSettings {
  enabled: Record<string, boolean>
}

export interface SettingsData {
  general: GeneralSettings
  xmlEditor: XmlEditorSettings
  batchValidator: BatchValidatorSettings
  plugins: PluginsSettings
}

interface LegacyGeneralSettings {
  startupTool?: 'home'
  downloadFolder?: string | null
  downloadFolders?: string[]
}

export interface PersistedSettingsData {
  general?: LegacyGeneralSettings
  xmlEditor?: Partial<XmlEditorSettings>
  batchValidator?: Partial<BatchValidatorSettings>
  plugins?: { enabled?: Record<string, boolean> }
}

interface SettingsState extends SettingsData {
  previewEditorTheme: EditorThemeId | null
  effectiveEditorTheme: EditorThemeId
  updateGeneralSettings: (updates: Partial<GeneralSettings>) => void
  updateXmlEditorSettings: (updates: Partial<XmlEditorSettings>) => void
  setPreviewEditorTheme: (theme: EditorThemeId | null) => void
  clearPreviewEditorTheme: () => void
  updatePluginEnabled: (id: string, enabled: boolean) => void
  resetSettings: () => void
}

const defaultSettings: SettingsData = {
  general: {
    startupTool: 'home',
    downloadFolders: [],
  },
  xmlEditor: {
    validationFeatureEnabled: false,
    validateOnOpen: false,
    revalidateShortcut: 'CmdOrCtrl+Shift+V',
    editorTheme: 'vs-dark',
  },
  batchValidator: {
    autoExpandResults: true,
  },
  plugins: {
    enabled: {
      'odf-chart-style-resolver': true,
    },
  },
}

function dedupeFolderPaths(paths: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const path of paths) {
    if (typeof path !== 'string') continue
    const trimmed = path.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

function migrateDownloadFolders(persistedGeneral: LegacyGeneralSettings | undefined): string[] {
  if (!persistedGeneral) return []

  const candidates: Array<string | null | undefined> = []
  if (Array.isArray(persistedGeneral.downloadFolders)) {
    candidates.push(...persistedGeneral.downloadFolders)
  }
  if (typeof persistedGeneral.downloadFolder === 'string') {
    candidates.push(persistedGeneral.downloadFolder)
  }
  return dedupeFolderPaths(candidates)
}

export function mergeSettingsData(
  persistedState: PersistedSettingsData | undefined,
  currentState: SettingsState
) {
  const persisted = persistedState ?? {}
  const xmlEditor = {
    ...currentState.xmlEditor,
    ...persisted.xmlEditor,
  }

  const general: GeneralSettings = {
    startupTool: persisted.general?.startupTool ?? currentState.general.startupTool,
    downloadFolders: migrateDownloadFolders(persisted.general),
  }

  return {
    ...currentState,
    ...persisted,
    general,
    xmlEditor,
    batchValidator: {
      ...currentState.batchValidator,
      ...persisted.batchValidator,
    },
    plugins: {
      enabled: {
        ...currentState.plugins.enabled,
        ...(persisted.plugins?.enabled ?? {}),
      },
    },
    effectiveEditorTheme: currentState.previewEditorTheme ?? xmlEditor.editorTheme,
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      previewEditorTheme: null,
      effectiveEditorTheme: defaultSettings.xmlEditor.editorTheme,

      updateGeneralSettings: (updates) =>
        set((state) => ({
          general: {
            ...state.general,
            ...updates,
          },
        })),

      updateXmlEditorSettings: (updates) =>
        set((state) => {
          const xmlEditor = {
            ...state.xmlEditor,
            ...updates,
          }

          return {
            xmlEditor,
            effectiveEditorTheme: state.previewEditorTheme ?? xmlEditor.editorTheme,
          }
        }),

      setPreviewEditorTheme: (theme) =>
        set((state) => ({
          previewEditorTheme: theme,
          effectiveEditorTheme: theme ?? state.xmlEditor.editorTheme,
        })),

      clearPreviewEditorTheme: () =>
        set((state) => ({
          previewEditorTheme: null,
          effectiveEditorTheme: state.xmlEditor.editorTheme,
        })),

      updatePluginEnabled: (id, enabled) =>
        set((state) => ({
          plugins: {
            enabled: {
              ...state.plugins.enabled,
              [id]: enabled,
            },
          },
        })),

      resetSettings: () =>
        set({
          ...defaultSettings,
          previewEditorTheme: null,
          effectiveEditorTheme: defaultSettings.xmlEditor.editorTheme,
        }),
    }),
    {
      name: 'ooxml-validator-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        general: state.general,
        xmlEditor: state.xmlEditor,
        batchValidator: state.batchValidator,
        plugins: state.plugins,
      }),
      merge: (persistedState, currentState) =>
        mergeSettingsData(persistedState as PersistedSettingsData | undefined, currentState),
    }
  )
)
