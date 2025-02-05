import type { HandlerDetails } from 'electron';
import {
  app, BrowserWindow, ipcMain, shell, systemPreferences,
} from 'electron';
import path from 'path';

import type { TrafficLightPosition } from '../types/electron';
import { ElectronAction, ElectronEvent } from '../types/electron';

import setupAutoUpdates, { AUTO_UPDATE_SETTING_KEY, getIsAutoUpdateEnabled } from './autoUpdates';
import { processDeeplink } from './deeplink';
import { captureLocalStorage, restoreLocalStorage } from './localStorage';
import tray from './tray';
import {
  checkIsWebContentsUrlAllowed, forceQuit, getAppTitle, getCurrentWindow, getLastWindow,
  hasExtraWindows, IS_FIRST_RUN, IS_MAC_OS, IS_PREVIEW, IS_PRODUCTION, IS_WINDOWS,
  reloadWindows, store, TRAFFIC_LIGHT_POSITION, windows,
} from './utils';
import windowStateKeeper from './windowState';

const ALLOWED_DEVICE_ORIGINS = ['http://localhost:1234', 'file://'];

function updateWindowTransparency(isTransparent: boolean) {
  const currentWindow = BrowserWindow.getFocusedWindow();
  if (currentWindow) {
    // eslint-disable-next-line no-null/no-null
    currentWindow.setVibrancy(isTransparent ? 'sidebar' : null);
  }
}

export function createWindow(url?: string) {
  const windowState = windowStateKeeper({
    defaultWidth: 1088,
    defaultHeight: 700,
  });

  let x;
  let y;

  const currentWindow = getCurrentWindow();
  if (currentWindow) {
    const [currentWindowX, currentWindowY] = currentWindow.getPosition();
    x = currentWindowX + 24;
    y = currentWindowY + 24;
  } else {
    x = windowState.x;
    y = windowState.y;
  }

  let width;
  let height;

  if (currentWindow) {
    const bounds = currentWindow.getBounds();

    width = bounds.width;
    height = bounds.height;
  } else {
    width = windowState.width;
    height = windowState.height;
  }

  const splash = new BrowserWindow({
    width,
    height,
    x,
    y,
    transparent: true,
    vibrancy: 'sidebar',
    titleBarStyle: 'hidden',
  });

  splash.loadFile(path.join(__dirname, 'components', 'splash.html'));

  const window = new BrowserWindow({
    show: false,
    x,
    y,
    minWidth: 360,
    width,
    height,
    title: getAppTitle(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: !IS_PRODUCTION,
    },
    ...(IS_WINDOWS && {
      material: 'acrylic',
      /* transparent: true, */
    }),
    ...(IS_MAC_OS && {
      titleBarStyle: 'hidden',
      trafficLightPosition: TRAFFIC_LIGHT_POSITION.standard,
      /* transparent: true, */
      vibrancy: 'sidebar',
    }),
  });

  windowState.manage(window);

  window.on('enter-full-screen', () => {
    updateWindowTransparency(false); // Сделать фон непрозрачным в полноэкранном режиме
  });

  window.on('leave-full-screen', () => {
    updateWindowTransparency(true); // Вернуть прозрачность при выходе из полноэкранного режима
  });

  window.webContents.setWindowOpenHandler((details: HandlerDetails) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  window.webContents.session.setDevicePermissionHandler(({ deviceType, origin }) => {
    return deviceType === 'hid' && ALLOWED_DEVICE_ORIGINS.includes(origin);
  });

  window.webContents.on('will-navigate', (event, newUrl) => {
    if (!checkIsWebContentsUrlAllowed(newUrl)) {
      event.preventDefault();
    }
  });

  window.on('page-title-updated', (event: Event) => {
    event.preventDefault();
  });

  window.on('enter-full-screen', () => {
    window.webContents.send(ElectronEvent.FULLSCREEN_CHANGE, true);
  });

  window.on('leave-full-screen', () => {
    window.webContents.send(ElectronEvent.FULLSCREEN_CHANGE, false);
  });

  window.webContents.on('did-navigate', () => {
    window.webContents.send(
      ElectronEvent.NAVIGATION_CHANGED, window.webContents.canGoBack(), window.webContents.canGoForward(),
    );
  });

  window.on('close', (event) => {
    const focusedWindow = getCurrentWindow();
    if (forceQuit.isEnabled) {
      app.exit(0);
      return;
    }

    if (focusedWindow && focusedWindow.isFullScreen()) {
      event.preventDefault();
      focusedWindow.once('leave-full-screen', () => {
        focusedWindow.close();
      });
      focusedWindow.setFullScreen(false);
    } else if (IS_MAC_OS || (IS_WINDOWS && tray.isEnabled)) {
      // Обычная логика закрытия
      if (hasExtraWindows()) {
        windows.delete(window);
        windowState.unmanage();
      } else {
        event.preventDefault();
        window.hide();
      }
    }
  });

  windowState.clearLastUrlHash();

  if (!IS_MAC_OS) {
    window.removeMenu();
  }

  if ((IS_MAC_OS || IS_WINDOWS) && tray.isEnabled) {
    tray.setupListeners(window);
    tray.create();
  }

  window.webContents.once('dom-ready', async () => {
    processDeeplink();

    if (IS_PRODUCTION) {
      setupAutoUpdates(windowState);
    }

    if (!IS_FIRST_RUN && getIsAutoUpdateEnabled() === undefined) {
      store.set(AUTO_UPDATE_SETTING_KEY, true);
      await captureLocalStorage();
      reloadWindows();
    }
  });

  window.once('ready-to-show', () => {
    splash.close(); // Закрыть сплеш-скрин
    window.show(); // Показать основное окно
  });

  windows.add(window);
  loadWindowUrl(window, url, windowState.urlHash);
}

function loadWindowUrl(window: BrowserWindow, url?: string, hash?: string): void {
  if (url && checkIsWebContentsUrlAllowed(url)) {
    window.loadURL(url);
  } else if (!app.isPackaged) {
    window.loadURL(`http://localhost:1234${hash}`);
  } else if (getIsAutoUpdateEnabled()) {
    window.loadURL(`${process.env.BASE_URL}${hash}`);
  } else if (getIsAutoUpdateEnabled() === undefined && IS_FIRST_RUN) {
    store.set(AUTO_UPDATE_SETTING_KEY, true);
    window.loadURL(`${process.env.BASE_URL}${hash}`);
  } else {
    window.loadURL(`file://${__dirname}/index.html${hash}`);
  }
}

export function setupElectronActionHandlers() {
  ipcMain.handle(ElectronAction.OPEN_NEW_WINDOW, (_, url: string) => {
    createWindow(url);
  });

  ipcMain.handle(ElectronAction.SET_WINDOW_TITLE, (_, newTitle?: string) => {
    getCurrentWindow()?.setTitle(getAppTitle(newTitle));
  });

  ipcMain.handle(ElectronAction.GET_IS_FULLSCREEN, () => {
    getCurrentWindow()?.isFullScreen();
  });

  ipcMain.handle(ElectronAction.HANDLE_DOUBLE_CLICK, () => {
    const currentWindow = getCurrentWindow();
    const doubleClickAction = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string');

    if (doubleClickAction === 'Minimize') {
      currentWindow?.minimize();
    } else if (doubleClickAction === 'Maximize') {
      if (!currentWindow?.isMaximized()) {
        currentWindow?.maximize();
      } else {
        currentWindow?.unmaximize();
      }
    }
  });

  ipcMain.handle(ElectronAction.SET_TRAFFIC_LIGHT_POSITION, (_, position: TrafficLightPosition) => {
    if (!IS_MAC_OS) {
      return;
    }

    getCurrentWindow()?.setTrafficLightPosition(TRAFFIC_LIGHT_POSITION[position]);
  });

  ipcMain.handle(ElectronAction.SET_IS_AUTO_UPDATE_ENABLED, async (_, isAutoUpdateEnabled: boolean) => {
    if (IS_PREVIEW) {
      return;
    }

    store.set(AUTO_UPDATE_SETTING_KEY, isAutoUpdateEnabled);
    await captureLocalStorage();
    reloadWindows(isAutoUpdateEnabled);
  });

  ipcMain.handle(ElectronAction.GET_IS_AUTO_UPDATE_ENABLED, () => {
    return getIsAutoUpdateEnabled();
  });

  ipcMain.handle(ElectronAction.UPDATE_TRAY_TITLE, (_, unreadCount: number) => {
    tray.updateTrayTitle(unreadCount);
  });

  ipcMain.handle(ElectronAction.SET_IS_TRAY_ICON_ENABLED, (_, isTrayIconEnabled: boolean) => {
    if (isTrayIconEnabled) {
      tray.enable();
    } else {
      tray.disable();
    }
  });

  ipcMain.handle(ElectronAction.GET_IS_TRAY_ICON_ENABLED, () => tray.isEnabled);

  ipcMain.handle(ElectronAction.RESTORE_LOCAL_STORAGE, () => restoreLocalStorage());
}

export function setupCloseHandlers() {
  app.on('window-all-closed', () => {
    if (!IS_MAC_OS) {
      app.quit();
    }
  });

  app.on('before-quit', (event) => {
    if (IS_MAC_OS && !forceQuit.isEnabled) {
      event.preventDefault();
      forceQuit.enable();
      app.quit();
    }
  });

  app.on('activate', () => {
    const hasActiveWindow = BrowserWindow.getAllWindows().length > 0;

    if (!hasActiveWindow) {
      createWindow();
    } else if (IS_MAC_OS) {
      forceQuit.disable();
      getLastWindow()?.show();
    }
  });
}
