// ==========================================
// Listener
// ==========================================
// from the sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // console.log(`[content.js] Message received at ${new Date().toLocaleTimeString()}:`, request);

    if (request.action === "showSavedPosts") {
        showSavedPosts().then(() => {
            // console.log("[content.js] 'showSavedPosts' function finished. Sending response.");
            sendResponse({ status: "modal shown" });
        }).catch(error => {
            // console.error("[content.js] Error inside showSavedPosts:", error);
            sendResponse({ status: "error", message: error.message });
        });

        return true;
    }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.serverCache) serverCache = changes.serverCache.newValue || {};
        if (changes.pendingChanges) pendingChanges = changes.pendingChanges.newValue || {};
    }
});

// Global right-click event listener
// anonymous follow button
document.addEventListener('contextmenu', handleRightClick, true);

// ==========================================
// Initialization
// ==========================================

let injectionInterval;

async function initializeApp() {
    console.log('[IG Injector] Initializing...');

    // Load local cache first for immediate UI availability
    await loadState();

    CLIENT_ID = await getClientId();

    if (CLIENT_ID) {
        fetchFollowingsFromServer();
        processSync();

        // Scheduled tasks
        setInterval(processSync, 10000); // Check queue every 10s
        setInterval(fetchFollowingsFromServer, 60000); // Refresh server list every 60s

        // Post injection (based on effective list)
        injectionInterval = setInterval(injectPost, 2000);
        setTimeout(() => clearInterval(injectionInterval), 30000);
    }
}

initializeApp();