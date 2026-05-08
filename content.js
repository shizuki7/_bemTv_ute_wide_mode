const DEBUG = false; // デバッグログ出力。本番時は false に

const DEBUG_PREFIX = "[ABEMA-AUTO-WIDE]";
const STYLE_ID = "abema-auto-wide-injected-style";
const PLAYER_SELECTOR = ".com-vod-VODResponsiveMainContent";

const MAX_RETRIES = 10;
const RETRY_INTERVAL = 500;
const BUTTON_WATCHER_TIMEOUT_MS = 180000;

let settings = { enabled: true, mode: "wide" };
let buttonWatcher = null;
let playerStateWatcher = null;
let retryTimeoutId = null;
let watcherTimeoutId = null;

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
  const player = document.querySelector(PLAYER_SELECTOR);
  if (!player) return null;
  for (const use of player.querySelectorAll("use")) {
    const href =
      use.getAttribute("xlink:href") || use.getAttribute("href") || "";
    if (href.includes(svgFile)) {
      const btn = use.closest('button, [role="button"]');
      if (btn) return btn;
    }
  }
  return null;
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
      isVideoPage: isVideoPage(),
    });

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
  chrome.storage.local.get({ enabled: true, mode: "wide" }, (result) => {
    if (chrome.runtime.lastError) {
      errorLog("設定読み込み失敗:", chrome.runtime.lastError);
      return;
    }
    settings = result;
    debugLog("起動 ✓", location.href, settings);
    activateWideMode();
  });
} catch (err) {
  errorLog("初期化失敗:", err);
}

chrome.storage.onChanged.addListener((changes) => {
  try {
    if (changes.enabled) settings.enabled = changes.enabled.newValue;
    if (changes.mode) settings.mode = changes.mode.newValue;
    if (changes.enabled || changes.mode) activateWideMode();
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
