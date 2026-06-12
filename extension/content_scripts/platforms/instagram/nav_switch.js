/**
 * Navigation Bar Identity Switcher Module
 * Intercepts right-clicks directly on core SVG navigation icons to switch accounts with target redirection.
 */

/**
 * Identifies the targeted navigation icon based on the SVG attributes/tags.
 */
function detectNavClick(e) {
    const svg = e.target.closest("svg");
    if (!svg) return null;

    // Extract identifier keys from aria-label or inner <title> tag
    const label = svg.getAttribute("aria-label") || "";
    const titleEl = svg.querySelector("title");
    const title = titleEl ? titleEl.textContent : "";
    const textKey = (label + "|" + title).toLowerCase();

    // Match against specific navigation endpoints
    if (textKey.includes("首頁") || textKey.includes("home")) {
        return { type: "Home", url: "https://www.instagram.com/" };
    }
    if (textKey.includes("reel")) {
        return { type: "Reels", url: "https://www.instagram.com/reels/" };
    }
    if (
        textKey.includes("訊息") ||
        textKey.includes("message") ||
        textKey.includes("direct")
    ) {
        return {
            type: "Messages",
            url: "https://www.instagram.com/direct/inbox/",
        };
    }
    if (
        textKey.includes("新貼文") ||
        textKey.includes("create") ||
        textKey.includes("new post")
    ) {
        return { type: "New Post", url: "https://www.instagram.com/" };
    }

    return null;
}

/**
 * Renders and displays the custom identity context menu.
 */
async function showNavSwitchMenu(x, y, navTarget) {
    const existingMenu = document.getElementById("nav-switch-context-menu");
    if (existingMenu) existingMenu.remove();

    // Trigger original identity backup
    await chrome.runtime.sendMessage({
        action: "instagram:saveCurrentAsOriginal",
    });

    // Fetch credentials
    const response = await chrome.runtime.sendMessage({
        action: "instagram:getCredentials",
    });
    const storage = await chrome.storage.local.get([
        "ins_active_user",
        "ins_original_identity",
    ]);
    const activeUsername = storage.ins_active_user;
    const originalIdentity = storage.ins_original_identity;
    const originalUsername = originalIdentity?.username || "Browser Account";

    if (!response || response.status !== "success" || !response.data) {
        console.warn(
            "[IG Injector] Unable to fetch fresh credentials from background.",
        );
        return;
    }

    const creds = response.data;

    // Build context menu container
    const menu = document.createElement("div");
    menu.id = "nav-switch-context-menu";
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;

    // Context Menu Header
    const header = document.createElement("div");
    header.className = "nav-switch-header";
    header.textContent = `Quick Switch ➔ ${navTarget.type}`;
    menu.appendChild(header);

    // Original Browser Identity Entry
    const isOriginalActive = !activeUsername;
    const origIcon = isOriginalActive ? "✅" : "🔙";

    const origItem = document.createElement("div");
    origItem.className = "nav-switch-item";
    origItem.innerHTML = `
        <div class="nav-switch-label-wrapper item-column">
            <div class="nav-switch-username-row">
                <span class="nav-switch-emoji-icon">${origIcon}</span>
                <span class="nav-switch-username">(Original) ${originalUsername}</span>
            </div>
        </div>
        ${isOriginalActive ? '<span class="nav-switch-checkmark">✓</span>' : ""}
    `;

    origItem.onclick = async (e) => {
        e.stopPropagation();
        menu.remove();
        if (!activeUsername) return;
        await chrome.runtime.sendMessage({
            action: "instagram:revertToOriginal",
            redirectUrl: navTarget.url,
        });
    };
    menu.appendChild(origItem);

    // Identity Entries
    creds.forEach((cred) => {
        const item = document.createElement("div");
        item.className = "nav-switch-item";

        const isActive = cred.username === activeUsername;
        const identityIconHtml = cred.is_shared
            ? IDENTITY_ICONS.shared
            : IDENTITY_ICONS.private;
        const iconClass = cred.is_shared ? "icon-shared" : "icon-private";
        const displayCategories =
            cred.categories && cred.categories.length > 0
                ? cred.categories.join(", ")
                : "General";

        item.innerHTML = `
            <div class="nav-switch-label-wrapper">
                <div class="nav-switch-username-row">
                    <span class="nav-switch-svg-icon ${iconClass}">${identityIconHtml}</span>
                    <span class="nav-switch-username">(Virtual) ${cred.username}</span>
                </div>
                <span class="nav-switch-category-meta ${cred.categories && cred.categories.length > 0 ? "" : "fallback"}">
                    Tag: ${displayCategories}
                </span>
            </div>
            ${isActive ? '<span class="nav-switch-checkmark">✓</span>' : ""}
        `;

        if (cred.status !== "success") {
            item.classList.add("disabled");
            item.title = "Identity expired. Please check extension side panel.";
        }

        item.onclick = async (e) => {
            e.stopPropagation();
            if (cred.status !== "success" || isActive) return;
            menu.remove();

            await chrome.runtime.sendMessage({
                action: "instagram:switchIdentity",
                username: cred.username,
                redirectUrl: navTarget.url,
            });
        };
        menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Close custom context menu on any outside click triggers
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

/**
 * Global right-click event handler for navigation bar interactions.
 * Exposed to content.js.
 */
function handleNavRightClick(e) {
    const navTarget = detectNavClick(e);
    if (!navTarget) return;

    // Prevent default browser context menu and stop propagation bubble
    e.preventDefault();
    e.stopPropagation();

    // console.log(
    //     `[IG Injector] Navigation shortcut right-click intercepted for: ${navTarget.type}`,
    // );
    showNavSwitchMenu(e.pageX, e.pageY, navTarget);
}
