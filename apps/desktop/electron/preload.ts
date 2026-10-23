// The only door between the window and the app's own process: `window.cad`.
import { contextBridge, ipcRenderer, webUtils } from "electron"

import { CHANNEL, type CadApi } from "../shared/api"

function on<Args extends unknown[]>(
  channel: string,
  listener: (...args: Args) => void
) {
  const wrapped = (_: unknown, ...args: unknown[]) =>
    listener(...(args as Args))
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const api: CadApi = {
  platform: process.platform,
  projects: {
    list: () => ipcRenderer.invoke(CHANNEL.projectsList),
    add: (kind) => ipcRenderer.invoke(CHANNEL.projectsAdd, kind),
    open: (paths) => ipcRenderer.invoke(CHANNEL.projectsOpen, paths),
    create: () => ipcRenderer.invoke(CHANNEL.projectsCreate),
    example: (id) => ipcRenderer.invoke(CHANNEL.projectsExample, id),
    onExampleProgress: (listener) =>
      on(CHANNEL.projectsExampleProgress, listener),
    pathOf: (file) => webUtils.getPathForFile(file),
    remove: (id) => ipcRenderer.invoke(CHANNEL.projectsRemove, id),
    rename: (id, name) => ipcRenderer.invoke(CHANNEL.projectsRename, id, name),
    pin: (id, pinned) => ipcRenderer.invoke(CHANNEL.projectsPin, id, pinned),
    trustSettings: (id, trusted) =>
      ipcRenderer.invoke(CHANNEL.projectsTrustSettings, id, trusted),
    reveal: (id) => ipcRenderer.invoke(CHANNEL.projectsReveal, id),
    onChange: (listener) => on(CHANNEL.projectsChanged, listener),
    onStarted: (listener) => on(CHANNEL.projectsStarted, listener),
  },
  model: {
    read: (projectId) => ipcRenderer.invoke(CHANNEL.modelRead, projectId),
    saveCopy: (projectId, file, name) =>
      ipcRenderer.invoke(CHANNEL.modelSaveCopy, projectId, file, name),
    nameGroup: (projectId, group) =>
      ipcRenderer.invoke(CHANNEL.modelNameGroup, projectId, group),
    saveCopies: (projectId, files, folder) =>
      ipcRenderer.invoke(CHANNEL.modelSaveCopies, projectId, files, folder),
    saveArchive: (projectId, files, name) =>
      ipcRenderer.invoke(CHANNEL.modelSaveArchive, projectId, files, name),
    saveMeshes: (projectId, format, sets, how, called) =>
      ipcRenderer.invoke(
        CHANNEL.modelSaveMeshes,
        projectId,
        format,
        sets,
        how,
        called
      ),
    saveDrawing: (name, svg) =>
      ipcRenderer.invoke(CHANNEL.modelSaveDrawing, name, svg),
    saveDrawings: (folder, drawings) =>
      ipcRenderer.invoke(CHANNEL.modelSaveDrawings, folder, drawings),
  },
  reference: {
    scenes: (projectId) =>
      ipcRenderer.invoke(CHANNEL.referenceScenes, projectId),
  },
  tools: {
    read: (projectId) => ipcRenderer.invoke(CHANNEL.toolsRead, projectId),
  },
  boards: {
    read: (projectId) => ipcRenderer.invoke(CHANNEL.boardsRead, projectId),
    save: (projectId, boardId, what, name) =>
      ipcRenderer.invoke(CHANNEL.boardsSave, projectId, boardId, what, name),
  },
  assembly: {
    read: (projectId) => ipcRenderer.invoke(CHANNEL.assemblyRead, projectId),
    make: (projectId, conversationId, of, manner) =>
      ipcRenderer.invoke(
        CHANNEL.assemblyMake,
        projectId,
        conversationId,
        of,
        manner
      ),
    open: (projectId, guideId, looks) =>
      ipcRenderer.invoke(CHANNEL.assemblyOpen, projectId, guideId, looks),
    save: (projectId, guideId, looks) =>
      ipcRenderer.invoke(CHANNEL.assemblySave, projectId, guideId, looks),
    remove: (projectId, guideId) =>
      ipcRenderer.invoke(CHANNEL.assemblyRemove, projectId, guideId),
  },
  inspiration: {
    read: (projectId, codexModel) =>
      ipcRenderer.invoke(
        CHANNEL.inspirationRead,
        projectId,
        codexModel ?? null
      ),
    add: (projectId, picture) =>
      ipcRenderer.invoke(CHANNEL.inspirationAdd, projectId, picture),
    fetch: (link) => ipcRenderer.invoke(CHANNEL.inspirationFetch, link),
    save: (projectId, board, codexModel) =>
      ipcRenderer.invoke(
        CHANNEL.inspirationSave,
        projectId,
        board,
        codexModel ?? null
      ),
    confirmRemove: (projectId, what) =>
      ipcRenderer.invoke(CHANNEL.inspirationConfirmRemove, projectId, what),
    stop: (projectId) => ipcRenderer.invoke(CHANNEL.inspirationStop, projectId),
    saveArchive: (projectId) =>
      ipcRenderer.invoke(CHANNEL.inspirationSaveArchive, projectId),
    onChange: (listener) => on(CHANNEL.inspirationChanged, listener),
  },
  pictures: {
    add: (projectId, picture) =>
      ipcRenderer.invoke(CHANNEL.picturesAdd, projectId, picture),
    drop: (projectId, id) =>
      ipcRenderer.invoke(CHANNEL.picturesDrop, projectId, id),
  },
  changes: {
    undo: (projectId) => ipcRenderer.invoke(CHANNEL.changesUndo, projectId),
    redo: (projectId) => ipcRenderer.invoke(CHANNEL.changesRedo, projectId),
  },
  versions: {
    show: (projectId, conversationId) =>
      ipcRenderer.send(CHANNEL.versionsShow, projectId, conversationId),
    onTurned: (listener) => on(CHANNEL.versionsTurned, listener),
    onBegun: (listener) => on(CHANNEL.versionsBegun, listener),
  },
  thread: {
    items: (projectId, conversationId) =>
      ipcRenderer.invoke(CHANNEL.threadItems, projectId, conversationId),
    send: (
      projectId,
      conversationId,
      text,
      notes,
      objects,
      manner,
      reference,
      pictures,
      quotes,
      board
    ) =>
      ipcRenderer.invoke(
        CHANNEL.threadSend,
        projectId,
        conversationId,
        text,
        notes,
        objects,
        manner,
        reference ?? null,
        pictures ?? [],
        quotes ?? [],
        board ?? null
      ),
    lookOver: (projectId, seen, manner) =>
      ipcRenderer.invoke(CHANNEL.threadLookOver, projectId, seen, manner),
    stop: (projectId) => ipcRenderer.invoke(CHANNEL.threadStop, projectId),
    stopJob: (projectId) =>
      ipcRenderer.invoke(CHANNEL.threadStopJob, projectId),
    sendNow: (projectId, queuedId) =>
      ipcRenderer.invoke(CHANNEL.threadSendNow, projectId, queuedId),
    unqueue: (projectId, queuedId) =>
      ipcRenderer.invoke(CHANNEL.threadUnqueue, projectId, queuedId),
    rename: (projectId, conversationId, name) =>
      ipcRenderer.invoke(CHANNEL.threadRename, projectId, conversationId, name),
    answer: (projectId, permissionId, answer) =>
      ipcRenderer.invoke(CHANNEL.threadAnswer, projectId, permissionId, answer),
    tell: (projectId, questionId, answers) =>
      ipcRenderer.invoke(CHANNEL.threadTell, projectId, questionId, answers),
    onItem: (listener) => on(CHANNEL.threadItem, listener),
  },
  providers: {
    list: () => ipcRenderer.invoke(CHANNEL.providersList),
    change: (id, patch) =>
      ipcRenderer.invoke(CHANNEL.providersChange, id, patch),
    check: () => ipcRenderer.invoke(CHANNEL.providersCheck),
    update: (id) => ipcRenderer.invoke(CHANNEL.providersUpdate, id),
    onChange: (listener) => on(CHANNEL.providersChanged, listener),
  },
  claude: {
    commands: (projectId) =>
      ipcRenderer.invoke(CHANNEL.claudeCommands, projectId),
  },
  settings: {
    get: () => ipcRenderer.invoke(CHANNEL.settingsGet),
    chooseProjectsFolder: () =>
      ipcRenderer.invoke(CHANNEL.settingsChooseProjectsFolder),
    revealProjectsFolder: () =>
      ipcRenderer.invoke(CHANNEL.settingsRevealProjectsFolder),
    openLicenses: () => ipcRenderer.invoke(CHANNEL.settingsOpenLicenses),
    projectsFolderSize: () =>
      ipcRenderer.invoke(CHANNEL.settingsProjectsFolderSize),
    setLookOver: (on) => ipcRenderer.invoke(CHANNEL.settingsSetLookOver, on),
    setAnalytics: (on) => ipcRenderer.invoke(CHANNEL.settingsSetAnalytics, on),
    setVersions: (on) => ipcRenderer.invoke(CHANNEL.settingsSetVersions, on),
  },
  analytics: {
    used: (feature) => ipcRenderer.send(CHANNEL.analyticsUsed, feature),
  },
  colours: {
    save: (projectId, parts) =>
      ipcRenderer.invoke(CHANNEL.coloursSave, projectId, parts),
    adopt: (kept) => ipcRenderer.invoke(CHANNEL.coloursAdopt, kept),
  },
  themes: {
    list: () => ipcRenderer.invoke(CHANNEL.themesList),
    save: (theme, replacing) =>
      ipcRenderer.invoke(CHANNEL.themesSave, theme, replacing),
    remove: (id) => ipcRenderer.invoke(CHANNEL.themesRemove, id),
    defaults: () => ipcRenderer.invoke(CHANNEL.themesDefaults),
    saveDefaults: (defaults) =>
      ipcRenderer.invoke(CHANNEL.themesSaveDefaults, defaults),
  },
  github: {
    get: () => ipcRenderer.invoke(CHANNEL.githubGet),
    connect: () => ipcRenderer.invoke(CHANNEL.githubConnect),
    openCode: () => ipcRenderer.invoke(CHANNEL.githubOpenCode),
    openInstall: () => ipcRenderer.invoke(CHANNEL.githubOpenInstall),
    cancel: () => ipcRenderer.invoke(CHANNEL.githubCancel),
    disconnect: () => ipcRenderer.invoke(CHANNEL.githubDisconnect),
    onChange: (listener) => on(CHANNEL.githubChanged, listener),
  },
  update: {
    get: () => ipcRenderer.invoke(CHANNEL.updateGet),
    download: () => ipcRenderer.invoke(CHANNEL.updateDownload),
    restart: () => ipcRenderer.invoke(CHANNEL.updateRestart),
    onChange: (listener) => on(CHANNEL.updateChanged, listener),
  },
  viewport: {
    onRequest: (listener) => on(CHANNEL.viewportRequest, listener),
    respond: (response) => ipcRenderer.send(CHANNEL.viewportResponse, response),
  },
}

contextBridge.exposeInMainWorld("cad", api)
