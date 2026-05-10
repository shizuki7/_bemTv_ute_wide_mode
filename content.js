const DEBUG = false; // デバッグログ出力。本番時は false に

const DEBUG_PREFIX = "[Abema-Player-Plus]";
const STYLE_ID = "abema-auto-wide-injected-style";
const PSEUDO_FULLSCREEN_STYLE_ID = "abema-auto-wide-pseudo-fullscreen-style";
const PSEUDO_FULLSCREEN_BUTTON_CLASS = "abema-auto-wide-fullscreen-button";
const ORIGINAL_FULLSCREEN_BUTTON_CLASS =
  "abema-auto-wide-original-fullscreen-button";
const HIDDEN_DURING_PSEUDO_FULLSCREEN_CLASS =
  "abema-auto-wide-hidden-during-pseudo-fullscreen";
const PSEUDO_FULLSCREEN_ROOT_CLASS = "abema-auto-wide-pseudo-fullscreen-root";
const PLAYER_SELECTOR = ".com-vod-VODResponsiveMainContent";

const MAX_RETRIES = 10;
const RETRY_INTERVAL = 500;
const BUTTON_WATCHER_TIMEOUT_MS = 180000;

let settings = {
  enabled: true,
  mode: "wide",
  pseudoFullscreenEnabled: false,
};
let buttonWatcher = null;
let playerStateWatcher = null;
let pseudoFullscreenWatcher = null;
let retryTimeoutId = null;
let watcherTimeoutId = null;
let pseudoFullscreenActive = false;

function debugLog(...args) {
  if (DEBUG) console.log(DEBUG_PREFIX, ...args);
}
function warnLog(...args) {
  console.warn(DEBUG_PREFIX, ...args);
}
function errorLog(...args) {
  console.error(DEBUG_PREFIX, ...args);
}

function isVideoPage() {
  return /\/(video\/episode|channels)\//.test(location.pathname);
}

function findPlayerButtonBySvg(svgFile) {
  return findPlayerButtonsBySvg(svgFile)[0] || null;
}

function findPlayerButtonsBySvg(svgFile) {
  const player = document.querySelector(PLAYER_SELECTOR);
  const buttons = [];
  if (!player) return buttons;
  for (const use of player.querySelectorAll("use")) {
    const href =
      use.getAttribute("xlink:href") || use.getAttribute("href") || "";
    if (href.includes(svgFile)) {
      const btn = use.closest('button, [role="button"]');
      if (btn && !buttons.includes(btn)) buttons.push(btn);
    }
  }
  return buttons;
}

function findWideButton() {
  return findPlayerButtonBySvg("wide.svg");
}

function isPlayerLoaded() {
  const player = document.querySelector(PLAYER_SELECTOR);
  return !!player?.querySelector("use");
}

function isAlreadyWide() {
  const byClass = !!document.querySelector(
    ".com-vod-VODResponsiveMainContent--wide-mode",
  );
  const byButton = isPlayerLoaded() && !findWideButton();
  debugLog("isAlreadyWide:", { byClass, byButton });
  return byClass && byButton;
}

function applyWideTheaterStyle() {
  if (!document.head) return;
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `
    .com-application-SideNavigation { display: none !important; }
    .c-common-HeaderContainer-header { opacity: 0 !important; display: none !important; }
    .com-vod-VODResponsiveMainContent__inner { width: 100% !important; max-width: calc(100vh * 16 / 9) !important; }
    .com-vod-VODResponsiveMainContent { margin-top: 0 !important; }
    .c-video-EpisodeContainerView-breadcrumb { display: none !important; }
    .c-tv-TimeshiftSlotContainerView-breadcrumb { display: none !important; }
    body:has(.com-vod-VODMiniPlayerWrapper__player--bg-mini) .com-application-SideNavigation { display: block !important; }
    body:has(.com-vod-VODMiniPlayerWrapper__player--bg-mini) .c-common-HeaderContainer-header { opacity: 1 !important; display: revert !important; }
  `;
  debugLog("ワイドシアターCSS 適用");
}

function removeWideTheaterStyle() {
  const style = document.getElementById(STYLE_ID);
  if (style) {
    style.remove();
    debugLog("ワイドシアターCSS 除去");
  }
}

function applyPseudoFullscreenStyle() {
  if (!document.head) return;
  let style = document.getElementById(PSEUDO_FULLSCREEN_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = PSEUDO_FULLSCREEN_STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = `
    html,
    body {
      width: 100vw !important;
      height: 100vh !important;
      overflow: hidden !important;
      background: #000 !important;
    }
    #main,
    #main > div,
    .c-application-DesktopAppContainer__content-container,
    .c-application-DesktopAppContainer__content,
    .c-application-DesktopAppContainer__main {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: #000 !important;
    }
    .c-common-HeaderContainer-header,
    .com-application-SideNavigation,
    .c-video-EpisodeContainerView-breadcrumb,
    .c-tv-TimeshiftSlotContainerView-breadcrumb,
    .com-vod-VODRecommendedContentsContainerViewEpisode__details-and-episode-list,
    .com-vod-VODRecommendedContentsContainerViewEpisode__module-sections,
    .c-application-FooterContainer {
      display: none !important;
    }
    .com-vod-VODResponsiveMainContent,
    .com-vod-VODResponsiveMainContent__container,
    .com-vod-VODResponsiveMainContent__inner,
    .com-vod-VODResponsiveMainContent__inner > div,
    .com-vod-VODRecommendedContentsContainerViewEpisode,
    .com-vod-VODRecommendedContentsContainerViewEpisode__above,
    .com-vod-VODRecommendedContentsContainerViewEpisode__player,
    .com-vod-VODMiniPlayerWrapper,
    .com-vod-VODMiniPlayerWrapper__player,
    .c-vod-EpisodePlayerContainer-container,
    .c-vod-EpisodePlayerContainer-wrapper,
    .c-vod-EpisodePlayerContainer-screen,
    .com-vod-VODScreen-container,
    .com-vod-VODScreen__player,
    #fluffy-video-view,
    video {
      width: 100% !important;
      height: 100% !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      aspect-ratio: auto !important;
      flex: none !important;
    }
    .com-vod-VODResponsiveMainContent {
      position: fixed !important;
      inset: 0 !important;
      z-index: 999999999 !important;
      background: #000 !important;
    }
    .c-vod-EpisodePlayerContainer-wrapper {
      position: fixed !important;
      inset: 0 !important;
      z-index: 1000000000 !important;
      background: #000 !important;
    }
    .${PSEUDO_FULLSCREEN_ROOT_CLASS} {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      z-index: 1000000000 !important;
      background: #000 !important;
      overflow: hidden !important;
      aspect-ratio: auto !important;
    }
    .${PSEUDO_FULLSCREEN_ROOT_CLASS} [class*="PlayerContainer"],
    .${PSEUDO_FULLSCREEN_ROOT_CLASS} [class*="PlayerWrapper"],
    .${PSEUDO_FULLSCREEN_ROOT_CLASS} .c-vod-EpisodePlayerContainer-screen,
    .${PSEUDO_FULLSCREEN_ROOT_CLASS} .com-vod-VODScreen-container,
    .${PSEUDO_FULLSCREEN_ROOT_CLASS} .com-vod-VODScreen__player,
    .${PSEUDO_FULLSCREEN_ROOT_CLASS} #fluffy-video-view,
    .${PSEUDO_FULLSCREEN_ROOT_CLASS} video {
      width: 100% !important;
      height: 100% !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      aspect-ratio: auto !important;
    }
    .${PSEUDO_FULLSCREEN_ROOT_CLASS} .c-tv-TimeshiftPlayerContainerView__comment-wrapper {
      display: none !important;
    }
    video {
      object-fit: contain !important;
    }
    .c-vod-EpisodePlayerContainer-wrapper button:has(use[xlink\\:href*="wide.svg"]),
    .c-vod-EpisodePlayerContainer-wrapper button:has(use[href*="wide.svg"]),
    .c-vod-EpisodePlayerContainer-wrapper button:has(use[xlink\\:href*="default.svg"]),
    .c-vod-EpisodePlayerContainer-wrapper button:has(use[href*="default.svg"]) {
      display: none !important;
    }
    .${HIDDEN_DURING_PSEUDO_FULLSCREEN_CLASS} {
      display: none !important;
    }
  `;
  debugLog("疑似全画面CSS 適用");
}

function removePseudoFullscreenStyle() {
  const style = document.getElementById(PSEUDO_FULLSCREEN_STYLE_ID);
  if (style) {
    style.remove();
    debugLog("疑似全画面CSS 除去");
  }
}

function findPseudoFullscreenRoot(source) {
  return (
    source?.closest?.(
      [
        ".c-vod-EpisodePlayerContainer-wrapper",
        '[class*="PlayerContainer-wrapper"]',
        '[class*="PlayerWrapper"]',
        '[class*="Screen-container"]',
        '[class*="MiniPlayerWrapper"]',
        PLAYER_SELECTOR,
      ].join(","),
    ) ||
    document.querySelector(".c-vod-EpisodePlayerContainer-wrapper") ||
    document.querySelector('[class*="PlayerContainer-wrapper"]') ||
    document.querySelector('[class*="PlayerWrapper"]') ||
    document.querySelector('[class*="Screen-container"]') ||
    document.querySelector(PLAYER_SELECTOR)
  );
}

function setPseudoFullscreenRoot(source) {
  for (const root of document.querySelectorAll(
    `.${PSEUDO_FULLSCREEN_ROOT_CLASS}`,
  )) {
    root.classList.remove(PSEUDO_FULLSCREEN_ROOT_CLASS);
  }

  const root = findPseudoFullscreenRoot(source);
  if (root) {
    root.classList.add(PSEUDO_FULLSCREEN_ROOT_CLASS);
    debugLog("疑似全画面 root 設定", root);
  } else {
    warnLog("疑似全画面 root が見つかりません");
  }
}

function clearPseudoFullscreenRoot() {
  for (const root of document.querySelectorAll(
    `.${PSEUDO_FULLSCREEN_ROOT_CLASS}`,
  )) {
    root.classList.remove(PSEUDO_FULLSCREEN_ROOT_CLASS);
  }
}

function requestBrowserWindowState(state) {
  debugLog("ブラウザウィンドウ状態変更メッセージ送信", state);
  chrome.runtime.sendMessage(
    { type: "SET_BROWSER_FULLSCREEN", state },
    (response) => {
      const sendError = chrome.runtime.lastError;
      if (sendError) {
        warnLog(
          "ブラウザウィンドウ状態変更メッセージ送信失敗:",
          sendError.message,
        );
        return;
      }
      debugLog("ブラウザウィンドウ状態変更レスポンス:", response);
    },
  );
}

function updatePseudoFullscreenButtonIcons() {
  for (const button of document.querySelectorAll(
    `.${PSEUDO_FULLSCREEN_BUTTON_CLASS}`,
  )) {
    button.setAttribute(
      "aria-label",
      pseudoFullscreenActive ? "デフォルト表示にする" : "フルスクリーンにする",
    );
    button.setAttribute(
      "title",
      pseudoFullscreenActive ? "デフォルト表示にする" : "フルスクリーンにする",
    );

    for (const use of button.querySelectorAll("use")) {
      const xlinkHref = use.getAttribute("xlink:href");
      const href = use.getAttribute("href");
      const nextIcon = pseudoFullscreenActive
        ? "fullscreen_exit.svg"
        : "fullscreen.svg";

      if (xlinkHref) {
        use.setAttribute(
          "xlink:href",
          xlinkHref.replace(
            /[^/?#]*fullscreen\.svg|[^/?#]*fullscreen_exit\.svg/,
            nextIcon,
          ),
        );
      }
      if (href) {
        use.setAttribute(
          "href",
          href.replace(
            /[^/?#]*fullscreen\.svg|[^/?#]*fullscreen_exit\.svg/,
            nextIcon,
          ),
        );
      }
    }
  }
}

function syncWideToggleButtonVisibility() {
  const buttons = [
    ...findPlayerButtonsBySvg("wide.svg"),
    ...findPlayerButtonsBySvg("default.svg"),
  ];

  for (const button of buttons) {
    if (button.classList.contains(PSEUDO_FULLSCREEN_BUTTON_CLASS)) continue;
    button.classList.toggle(
      HIDDEN_DURING_PSEUDO_FULLSCREEN_CLASS,
      pseudoFullscreenActive,
    );
  }
}

function activatePseudoFullscreen(source) {
  debugLog("疑似全画面 起動");
  pseudoFullscreenActive = true;
  requestBrowserWindowState("fullscreen");
  setPseudoFullscreenRoot(source);
  applyPseudoFullscreenStyle();
  syncWideToggleButtonVisibility();
  updatePseudoFullscreenButtonIcons();
}

function deactivatePseudoFullscreen() {
  debugLog("疑似全画面 解除");
  pseudoFullscreenActive = false;
  requestBrowserWindowState("normal");
  syncWideToggleButtonVisibility();
  clearPseudoFullscreenRoot();
  removePseudoFullscreenStyle();
  updatePseudoFullscreenButtonIcons();
}

function togglePseudoFullscreen(source) {
  if (pseudoFullscreenActive) {
    deactivatePseudoFullscreen();
  } else {
    activatePseudoFullscreen(source);
  }
}

function shouldIgnorePseudoFullscreenShortcut(event) {
  if (!settings.pseudoFullscreenEnabled || !isVideoPage()) return true;
  if (event.key?.toLowerCase() !== "f") return true;
  if (event.metaKey || event.ctrlKey || event.altKey) return true;

  const target = event.target;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable
  );
}

document.addEventListener(
  "keydown",
  (event) => {
    if (shouldIgnorePseudoFullscreenShortcut(event)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    debugLog("f キーで疑似全画面を切り替え");
    togglePseudoFullscreen(event.target);
  },
  true,
);

function removePseudoFullscreenButtons() {
  if (pseudoFullscreenActive) {
    deactivatePseudoFullscreen();
  }

  for (const btn of document.querySelectorAll(
    `.${PSEUDO_FULLSCREEN_BUTTON_CLASS}`,
  )) {
    btn.remove();
  }
  for (const btn of document.querySelectorAll(
    `.${ORIGINAL_FULLSCREEN_BUTTON_CLASS}`,
  )) {
    btn.classList.remove(ORIGINAL_FULLSCREEN_BUTTON_CLASS);
    delete btn.dataset.abemaAutoWideReplaced;
    btn.style.removeProperty("display");
  }
}

function syncPseudoFullscreenButtons() {
  if (!settings.pseudoFullscreenEnabled || !isVideoPage()) {
    removePseudoFullscreenButtons();
    removePseudoFullscreenStyle();
    return;
  }

  for (const original of findPlayerButtonsBySvg("fullscreen.svg")) {
    if (original.classList.contains(PSEUDO_FULLSCREEN_BUTTON_CLASS)) continue;
    if (original.dataset.abemaAutoWideReplaced === "true") continue;

    const replacement = original.cloneNode(true);
    replacement.classList.add(PSEUDO_FULLSCREEN_BUTTON_CLASS);
    replacement.dataset.abemaAutoWideReplacement = "true";
    replacement.type = original.type || "button";
    replacement.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        togglePseudoFullscreen(replacement);
      },
      true,
    );

    original.dataset.abemaAutoWideReplaced = "true";
    original.classList.add(ORIGINAL_FULLSCREEN_BUTTON_CLASS);
    original.style.setProperty("display", "none", "important");
    original.insertAdjacentElement("afterend", replacement);
    syncWideToggleButtonVisibility();
    updatePseudoFullscreenButtonIcons();
    debugLog("fullscreen ボタン差し替え完了");
  }
}

function stopPseudoFullscreenWatcher() {
  if (pseudoFullscreenWatcher) {
    pseudoFullscreenWatcher.disconnect();
    pseudoFullscreenWatcher = null;
  }
}

function startPseudoFullscreenWatcher() {
  stopPseudoFullscreenWatcher();
  if (!settings.pseudoFullscreenEnabled || !isVideoPage()) return;

  pseudoFullscreenWatcher = new MutationObserver(() => {
    syncPseudoFullscreenButtons();
    if (pseudoFullscreenActive) syncWideToggleButtonVisibility();
  });
  pseudoFullscreenWatcher.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["xlink:href", "href"],
  });
  syncPseudoFullscreenButtons();
}

function stopPlayerStateWatcher() {
  if (playerStateWatcher) {
    playerStateWatcher.disconnect();
    playerStateWatcher = null;
  }
}

function startPlayerStateWatcher() {
  stopPlayerStateWatcher();
  playerStateWatcher = new MutationObserver(() => {
    if (
      !settings.enabled ||
      !isVideoPage() ||
      settings.mode !== "widetheatre"
    ) {
      if (document.getElementById(STYLE_ID)) {
        debugLog("動画ページ外 / モード変更 → ワイドシアターCSS 即時解除");
        removeWideTheaterStyle();
        stopPlayerStateWatcher();
      }
      return;
    }
    if (!isPlayerLoaded()) return;
    const isWide = !findWideButton();
    const hasStyle = !!document.getElementById(STYLE_ID);
    if (isWide && !hasStyle) {
      debugLog("プレイヤーがワイドに → ワイドシアターCSS 適用");
      applyWideTheaterStyle();
    } else if (!isWide && hasStyle) {
      debugLog("プレイヤーがデフォルトに → ワイドシアターCSS 解除");
      removeWideTheaterStyle();
    }
  });
  playerStateWatcher.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["xlink:href", "href"],
  });
}

function stopRetry() {
  if (retryTimeoutId) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }
}

function stopWatcher() {
  if (watcherTimeoutId) {
    clearTimeout(watcherTimeoutId);
    watcherTimeoutId = null;
  }
  if (buttonWatcher) {
    buttonWatcher.disconnect();
    buttonWatcher = null;
  }
}

function startWatcher() {
  stopWatcher();
  buttonWatcher = new MutationObserver(() => {
    if (isAlreadyWide()) {
      stopWatcher();
      return;
    }
    const btn = findWideButton();
    if (btn) {
      stopWatcher();
      btn.click();
      debugLog("MutationObserver: クリック完了");
    }
  });
  buttonWatcher.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["xlink:href", "href"],
  });
  watcherTimeoutId = setTimeout(() => {
    if (
      buttonWatcher &&
      settings.enabled &&
      isVideoPage() &&
      !isAlreadyWide()
    ) {
      warnLog(
        `ワイドボタンが ${BUTTON_WATCHER_TIMEOUT_MS}ms 待っても見つかりません`,
      );
    }
    stopWatcher();
  }, BUTTON_WATCHER_TIMEOUT_MS);
}

function tryActivateWide(attempt = 0) {
  if (isAlreadyWide()) {
    debugLog("既にワイド表示");
    return;
  }

  const wideBtn = findWideButton();

  if (isPlayerLoaded()) {
    const byClass = !!document.querySelector(
      ".com-vod-VODResponsiveMainContent--wide-mode",
    );
    const byButton = !wideBtn;
    if (byClass !== byButton) {
      const resetBtn = wideBtn || findPlayerButtonBySvg("default.svg");
      if (resetBtn) {
        debugLog("矛盾状態を検出 → リセットしてワイドへ", {
          byClass,
          byButton,
        });
        resetBtn.click();
        retryTimeoutId = setTimeout(
          () => tryActivateWide(attempt),
          RETRY_INTERVAL,
        );
        return;
      }
    }
  }

  if (wideBtn) {
    wideBtn.click();
    debugLog("クリック完了");
    return;
  }

  debugLog(`tryActivateWide attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
  if (attempt < MAX_RETRIES) {
    retryTimeoutId = setTimeout(
      () => tryActivateWide(attempt + 1),
      RETRY_INTERVAL,
    );
  } else {
    startWatcher();
  }
}

function activateWideMode() {
  try {
    debugLog("activateWideMode", {
      enabled: settings.enabled,
      mode: settings.mode,
      pseudoFullscreenEnabled: settings.pseudoFullscreenEnabled,
      isVideoPage: isVideoPage(),
    });

    if (settings.pseudoFullscreenEnabled && isVideoPage()) {
      startPseudoFullscreenWatcher();
    } else {
      removePseudoFullscreenButtons();
      removePseudoFullscreenStyle();
      stopPseudoFullscreenWatcher();
    }

    if (
      !settings.enabled ||
      !isVideoPage() ||
      settings.mode !== "widetheatre"
    ) {
      removeWideTheaterStyle();
      stopPlayerStateWatcher();
    }

    if (!settings.enabled || !isVideoPage()) {
      stopRetry();
      stopWatcher();
      return;
    }

    if (settings.mode === "widetheatre") {
      applyWideTheaterStyle();
      startPlayerStateWatcher();
    }
    stopRetry();
    stopWatcher();
    tryActivateWide();
  } catch (err) {
    errorLog("activateWideMode で例外:", err);
  }
}

try {
  chrome.storage.local.get(
    { enabled: true, mode: "wide", pseudoFullscreenEnabled: false },
    (result) => {
      if (chrome.runtime.lastError) {
        errorLog("設定読み込み失敗:", chrome.runtime.lastError);
        return;
      }
      settings = result;
      debugLog("起動 ✓", location.href, settings);
      activateWideMode();
    },
  );
} catch (err) {
  errorLog("初期化失敗:", err);
}

chrome.storage.onChanged.addListener((changes) => {
  try {
    if (changes.enabled) settings.enabled = changes.enabled.newValue;
    if (changes.mode) settings.mode = changes.mode.newValue;
    if (changes.pseudoFullscreenEnabled) {
      settings.pseudoFullscreenEnabled =
        changes.pseudoFullscreenEnabled.newValue;
    }
    if (changes.enabled || changes.mode || changes.pseudoFullscreenEnabled) {
      activateWideMode();
    }
  } catch (err) {
    errorLog("storage.onChanged で例外:", err);
  }
});

// SPA遷移検知
// pushState/replaceState はcontent scriptのisolated worldの都合で確実に拾えないため使用しない
window.addEventListener("popstate", () => activateWideMode());

let lastTitle = document.title;
const titleEl = document.querySelector("head > title");
if (titleEl) {
  new MutationObserver(() => {
    if (document.title === lastTitle) return;
    lastTitle = document.title;
    activateWideMode();
  }).observe(titleEl, { childList: true });
}

// URLだけ変わってtitleが変わらない遷移を補完するポーリング
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    debugLog("URL変化検知:", location.href);
    activateWideMode();
    return;
  }
}, 1000);
