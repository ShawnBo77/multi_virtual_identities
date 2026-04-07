// ==========================================
// Listener
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // console.log(`[content.js] Message received at ${new Date().toLocaleTimeString()}:`, request);

    if (request.action === "renderSavedPosts") {
        renderSavedPosts()
            .then(() => {
                // console.log("[content.js] 'showSavedPosts' function finished. Sending response.");
                sendResponse({ status: "modal shown" });
            })
            .catch((error) => {
                // console.error("[content.js] Error inside showSavedPosts:", error);
                sendResponse({ status: "error", message: error.message });
            });

        return true;
    }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && CLIENT_ID) {
        const cacheKey = `serverCache_${CLIENT_ID}`;
        const pendingKey = `pendingChanges_${CLIENT_ID}`;

        if (changes[cacheKey]) {
            serverCache = changes[cacheKey].newValue || {};
            // console.log("[content.js] serverCache updated for client", CLIENT_ID);
        }
        if (changes[pendingKey]) {
            pendingChanges = changes[pendingKey].newValue || {};
        }

        if (changes.clientID) {
            location.reload();
        }
    }
});

// Global right-click event listener
// anonymous follow button
document.addEventListener("contextmenu", handleRightClick, true);

// ==========================================
// Initialization
// ==========================================

let injectionInterval;

async function initializeApp() {
    console.log("content script Initializing...");
    CLIENT_ID = await getClientId();

    // Post injection (based on effective list)
    injectionInterval = setInterval(injectPost, 2000);
    setTimeout(() => clearInterval(injectionInterval), 30000);
}

initializeApp();
