import { InstagramHandler } from "./instagram/instagram.js";

const API_BASE_URL = "http://127.0.0.1:8000";
let CLIENT_ID = null;

/**
 * Register all supported platforms here.
 */
const PLATFORM_HANDLERS = {
    instagram: InstagramHandler,
};

/**
 * Shared Context passed to handlers.
 */
const getContext = () => ({
    clientID: CLIENT_ID,
    apiBase: API_BASE_URL,
    broadcastFn: broadcastStateUpdate,
});

// ==========================================
// Global Utility Functions
// ==========================================

/**
 * Notify all UI components that the state has changed.
 */
async function broadcastStateUpdate() {
    console.log("[Background] Broadcasting state update to UI scripts.");
    try {
        await chrome.runtime.sendMessage({ action: "stateUpdated" });
    } catch (error) {
        // This might error if the side panel isn't open, which is fine.
    }
}

// ==========================================
// Initialization & Lifecycle
// ==========================================
async function initializeAllPlatforms() {
    const data = await chrome.storage.local.get("clientID");
    CLIENT_ID = data.clientID || null;

    if (CLIENT_ID) {
        for (const p in PLATFORM_HANDLERS) {
            await PLATFORM_HANDLERS[p].init(getContext());
        }
    }
}

// ==========================================
// Auth & Startup
// ==========================================
async function handleUserAuth(mode, payload) {
    const endpoint = mode === "login" ? "/login" : "/register";
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (response.ok) {
            CLIENT_ID = data.id;
            await chrome.storage.local.set({
                clientID: data.id,
                username: data.username,
            });
            await initializeAllPlatforms();
            return { status: "success", data: data };
        }
        return { status: "error", message: data.detail || "Auth failed" };
    } catch (e) {
        console.error(`[Background] Auth error (${mode}):`, e);
        return { status: "error", message: "Server connection failed" };
    }
}

// ==========================================
// Global Dispatcher
// ==========================================

/**
 * Global Message Dispatcher.
 * Routes actions like "instagram:recordAction" to the correct handler.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const [platform, action] = request.action.includes(":")
        ? request.action.split(":")
        : [null, request.action];

    // Handle Global Actions
    if (action === "login" || action === "register") {
        handleUserAuth(action, request.payload).then(sendResponse);
        return true;
    }

    if (action === "logout") {
        chrome.storage.local.clear(() => {
            CLIENT_ID = null;
            chrome.alarms.clearAll();
            sendResponse({ status: "success" });
            // Re-initialize to clear memory state
            initializeAllPlatforms();
        });
        return true;
    }

    (async () => {
        try {
            if (!CLIENT_ID) {
                const storage = await chrome.storage.local.get("clientID");
                CLIENT_ID = storage.clientID || null;
            }

            if (!CLIENT_ID) {
                sendResponse({
                    status: "error",
                    message: "Client ID not found. Please login.",
                });
                return;
            }

            // Delegation: Forward to the specific platform handler
            const handler = PLATFORM_HANDLERS[platform];
            if (handler) {
                const response = await handler.handleAction(
                    action,
                    request,
                    getContext(),
                );
                sendResponse(response);
            } else {
                sendResponse({
                    status: "error",
                    message: `Handler for platform "${platform}" not found.`,
                });
            }
        } catch (err) {
            console.error(
                `[Background] Action error (${request.action}):`,
                err,
            );
            sendResponse({ status: "error", message: err.message });
        }
    })();

    return true;
});

/**
 * Global Alarm Dispatcher.
 * Forwards alarms to the correct platform based on the alarm name prefix.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    // Expect alarm names like "instagram:periodic-sync"
    const [platform] = alarm.name.split(":");
    const handler = PLATFORM_HANDLERS[platform];

    if (handler && handler.onAlarm) {
        handler.onAlarm(alarm, getContext());
    }
});

// Open Side Panel on Action Click
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ windowId: tab.windowId });
});

// Service Worker startup logic
chrome.runtime.onStartup.addListener(initializeAllPlatforms);
// Initialize on first install
chrome.runtime.onInstalled.addListener(initializeAllPlatforms);
// Initial load when the script starts
initializeAllPlatforms();
