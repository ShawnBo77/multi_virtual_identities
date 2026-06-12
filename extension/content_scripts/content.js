const PLATFORM_ADAPTERS = {
    "instagram.com": {
        init: async () => {
            console.log(
                "[Multiple Virtual Identities] Initializing Instagram handler...",
            );

            // Set global Client ID (from client.js)
            window.CLIENT_ID = await getClientId();

            // Instagram-specific features
            // Anonymous follow logic (from follow.js)
            document.addEventListener("contextmenu", handleRightClick, true);

            // navbar account switcher
            document.addEventListener("contextmenu", handleNavRightClick, true);

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
            } else if (request.action === "getInstagramUsername") {
                try {
                    // Extract from the image alt attribute
                    const img = document.querySelector(
                        'img[alt*="的大頭貼照"], img[alt*="\'s profile picture"]',
                    );
                    if (img) {
                        const altText = img.getAttribute("alt") || "";
                        // Strips localized text suffixes based on language patterns
                        const username = altText
                            .replace("的大頭貼照", "")
                            .replace("'s profile picture", "")
                            .trim();
                        if (username) {
                            sendResponse({
                                status: "success",
                                username: username,
                            });
                            return true;
                        }
                    }

                    // Extract from the anchor link href attribute (e.g., href="/username/")
                    // Finds the profile anchor tag wrapping the avatar image in the sidebar layout
                    const profileLink = document
                        .querySelector('a[href^="/"][role="link"] img')
                        ?.closest("a");
                    if (profileLink) {
                        const href = profileLink.getAttribute("href") || "";
                        const username = href.replace(/\//g, "").trim(); // Strips out surrounding slashes

                        // Ensure it's a real user handle and not a generic system navigation path
                        if (
                            username &&
                            !["explore", "reels", "direct", "stories"].includes(
                                username,
                            )
                        ) {
                            sendResponse({
                                status: "success",
                                username: username,
                            });
                            return true;
                        }
                    }

                    sendResponse({
                        status: "error",
                        message:
                            "Target avatar elements not visible in current DOM",
                    });
                } catch (err) {
                    sendResponse({ status: "error", message: err.message });
                }
                return true;
            }
        },
    },
};

// Identify the current platform based on hostname
const currentPlatform = Object.keys(PLATFORM_ADAPTERS).find((domain) =>
    window.location.hostname.includes(domain),
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
