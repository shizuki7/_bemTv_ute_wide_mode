const DEBUG = false; // デバッグログ出力。本番時は false に
const DEBUG_PREFIX = "[Abema-Player-Plus]";

function debugLog(...args) {
  if (DEBUG) console.log(DEBUG_PREFIX, ...args);
}
function warnLog(...args) {
  console.warn(DEBUG_PREFIX, ...args);
}
function errorLog(...args) {
  console.error(DEBUG_PREFIX, ...args);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SET_BROWSER_FULLSCREEN") return false;

  try {
    const tabUrl = sender.tab?.url || "";
    const url = new URL(tabUrl);
    const isAbemaHost =
      url.hostname === "abema.tv" || url.hostname.endsWith(".abema.tv");
    const isAbemaVideoPage =
      url.protocol === "https:" &&
      isAbemaHost &&
      /\/(video\/episode|channels)\//.test(url.pathname);

    debugLog("background message:", {
      message,
      sender,
      tabId: sender.tab?.id,
      windowId: sender.tab?.windowId,
      tabUrl,
      isAbemaVideoPage,
    });

    if (!isAbemaVideoPage) {
      sendResponse({
        ok: false,
        message: "ABEMA の対象動画ページではありません",
      });
      return false;
    }

    const windowId = sender.tab?.windowId;
    if (windowId === undefined) {
      sendResponse({ ok: false, message: "windowId が取得できません" });
      return false;
    }

    chrome.windows.update(
      windowId,
      { state: message.state },
      (updatedWindow) => {
        const updateError = chrome.runtime.lastError;
        if (updateError) {
          warnLog("background fullscreen error:", {
            windowId,
            requestedState: message.state,
            message: updateError.message,
          });
          sendResponse({ ok: false, message: updateError.message });
          return;
        }

        const response = {
          ok: true,
          windowId,
          requestedState: message.state,
          actualState: updatedWindow?.state,
        };

        debugLog("background fullscreen response:", response);
        sendResponse(response);
      },
    );

    return true;
  } catch (err) {
    errorLog("background exception:", err);
    sendResponse({
      ok: false,
      message: err?.message || String(err),
    });
    return false;
  }
});
