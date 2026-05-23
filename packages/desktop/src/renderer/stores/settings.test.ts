import { describe, expect, it } from 'vitest'
import { mergeSettingsData } from './settings'

function buildCurrentState() {
  return {
    general: {
      startupTool: 'home' as const,
      downloadFolders: [] as string[],
    },
    xmlEditor: {
      validationFeatureEnabled: false,
      validateOnOpen: false,
      revalidateShortcut: 'CmdOrCtrl+Shift+V',
      editorTheme: 'vs-dark' as const,
    },
    batchValidator: {
      autoExpandResults: true,
    },
    plugins: {
      enabled: {
        'odf-chart-style-resolver': true,
      },
    },
    previewEditorTheme: null,
    effectiveEditorTheme: 'vs-dark' as const,
    updateGeneralSettings: () => undefined,
    updateXmlEditorSettings: () => undefined,
    setPreviewEditorTheme: () => undefined,
    clearPreviewEditorTheme: () => undefined,
    updatePluginEnabled: () => undefined,
    resetSettings: () => undefined,
  }
}

describe('mergeSettingsData', () => {
  it('keeps the default editor theme when older persisted settings do not include it', () => {
    const merged = mergeSettingsData(
      {
        xmlEditor: {
          validateOnOpen: false,
          revalidateShortcut: 'CmdOrCtrl+R',
        },
      },
      buildCurrentState()
    )

    expect(merged.xmlEditor.validateOnOpen).toBe(false)
    expect(merged.xmlEditor.validationFeatureEnabled).toBe(false)
    expect(merged.xmlEditor.revalidateShortcut).toBe('CmdOrCtrl+R')
    expect(merged.xmlEditor.editorTheme).toBe('vs-dark')
    expect(merged.effectiveEditorTheme).toBe('vs-dark')
  })

  it('migrates legacy downloadFolder string into downloadFolders array', () => {
    const merged = mergeSettingsData(
      {
        general: {
          downloadFolder: 'C:/Users/test/Downloads',
        },
      },
      buildCurrentState()
    )

    expect(merged.general.downloadFolders).toEqual(['C:/Users/test/Downloads'])
  })

  it('keeps existing downloadFolders array as-is and dedupes legacy duplicate', () => {
    const merged = mergeSettingsData(
      {
        general: {
          downloadFolders: ['C:/A', 'C:/B'],
          downloadFolder: 'C:/A',
        },
      },
      buildCurrentState()
    )

    expect(merged.general.downloadFolders).toEqual(['C:/A', 'C:/B'])
  })

  it('returns empty downloadFolders when nothing is persisted', () => {
    const merged = mergeSettingsData({}, buildCurrentState())
    expect(merged.general.downloadFolders).toEqual([])
  })
})
