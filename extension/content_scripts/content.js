const PLATFORM_ADAPTERS = {
    "instagram.com": {
        init: async () => {
            console.log("[Social Shield] Initializing Instagram handler...");

            // Set global Client ID (from client.js)
            window.CLIENT_ID = await getClientId();

            // Instagram-specific features
            // Anonymous follow logic (from follow.js)
            document.addEventListener("contextmenu", handleRightClick, true);

            // Start post injection logic if on the main feed (from post.js)
            if (window.location.pathname === "/") {
                startInstagramInjection();
            }
        },
        onMessage: (request, sendResponse) => {
            if (request.action === "renderSavedPosts") {
                renderSavedPosts() // Defined in post.js
                    .then(() => sendResponse({ status: "modal shown" }))
                    .catch((error) =>
                        sendResponse({
                            status: "error",
                            message: error.message,
                        }),
                    );
                return true;
            }
        },
    },
};


// Identify the current platform based on hostname
const currentPlatform = Object.keys(PLATFORM_ADAPTERS).find(domain => 
    window.location.hostname.includes(domain)
);

const handler = PLATFORM_ADAPTERS[currentPlatform];

if (handler) {
    // Run the platform's initialization
    handler.init();

    // Route messages to the correct platform handler
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        return handler.onMessage(request, sendResponse);
    });
}
