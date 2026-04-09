// Calculates the current effective follow list for UI rendering.
// Merges Server Cache with Local Pending Changes.
async function getEffectiveFollowListFromBackground() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: "instagram:getEffectiveFollowList",
        });
        if (response && response.status === "success") {
            return response.data || [];
        }
        return [];
    } catch (error) {
        console.error(
            "[IG Injector] Could not get effective follow list from background:",
            error,
        );
        return [];
    }
}

// ==========================================
// Anonymously follow button
// ==========================================

async function showFollowButton(x, y, username) {
    // Remove existing menu
    const existingMenu = document.getElementById("anon-context-menu");
    if (existingMenu) existingMenu.remove();

    // Check current follow status
    const currentList = await getEffectiveFollowListFromBackground();
    const isAnonFollowing = currentList.includes(username);

    // Create menu DOM
    const menu = document.createElement("div");
    menu.id = "anon-context-menu";
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;

    const menuItem = document.createElement("div");
    menuItem.className = `anon-menu-item ${isAnonFollowing ? "action-unfollow" : "action-follow"}`;
    menuItem.innerHTML = isAnonFollowing
        ? "<span>Unfollow (Anonymous)</span>"
        : "<span>Follow Anonymously</span>";

    // Handle click action
    menuItem.onclick = async (e) => {
        e.stopPropagation();
        const actionType = isAnonFollowing ? "UNFOLLOW" : "FOLLOW";

        console.log(
            `[IG Injector] Sending message to background to ${actionType} ${username}`,
        );

        // Send a message to background.js to handle storage.
        chrome.runtime.sendMessage({
            action: "instagram:recordAction",
            type: actionType,
            username: username,
        });

        menu.remove();
    };

    menu.appendChild(menuItem);
    document.body.appendChild(menu);

    // Close menu on outside click
    setTimeout(() => {
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener("click", closeMenu);
                document.removeEventListener("contextmenu", closeMenu);
            }
        };
        document.addEventListener("click", closeMenu);
        document.addEventListener("contextmenu", closeMenu);
    }, 10);
}

function getUsernameFromUrl() {
    const pathParts = window.location.pathname.split("/").filter((p) => p);
    if (
        pathParts.length != 0 &&
        !["p", "explore", "direct", "reels", "stories"].includes(pathParts[0])
    ) {
        return pathParts[0];
    }
    return null;
}

function handleRightClick(e) {
    // Check if on a profile page
    const currentUsername = getUsernameFromUrl();
    if (!currentUsername) return;

    // Check if target is a button
    const targetBtn = e.target.closest('button, a, div[role="button"]');
    if (!targetBtn) return;
    // Ensure button is in the header
    if (!targetBtn.closest("header")) return;

    // Define keywords for Follow buttons
    const btnText = targetBtn.innerText || "";
    const followKeywords = [
        "Follow",
        "Following",
        "Requested",
        "追蹤",
        "已追蹤",
        "追蹤中",
        "已送出請求",
    ];

    // Check if button text matches keywords
    const isTargetButton = followKeywords.some((kw) => btnText.includes(kw));

    if (isTargetButton) {
        // Prevent default browser menu
        e.preventDefault();
        e.stopPropagation();

        console.log(
            `[IG Injector] Right-click intercepted on button: "${btnText.replace(/\n/g, "")}" for user: ${currentUsername}`,
        );

        // Show custom menu
        showFollowButton(e.pageX, e.pageY, currentUsername);
    }
}
