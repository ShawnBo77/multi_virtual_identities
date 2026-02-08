const API_BASE_URL = 'http://127.0.0.1:8000';
let CLIENT_ID = null;
let serverCache = {};
let pendingChanges = {};

// --- Built-in SVG Icons ---
const ICONS = {
    like: '<svg aria-label="讚" color="currentColor" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.956-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"></path></svg>',
    comment: '<svg aria-label="留言" color="currentColor" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path></svg>',
    share: '<svg aria-label="Share" color="currentColor" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><title>Share</title><path d="M13.973 20.046 21.77 6.928C22.8 5.195 21.55 3 19.535 3H4.466C2.138 3 .984 5.825 2.646 7.456l4.842 4.752 1.723 7.121c.548 2.266 3.571 2.721 4.762.717Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path><line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="7.488" x2="15.515" y1="12.208" y2="7.641"></line></svg>',
    save: '<svg aria-label="儲存" color="currentColor" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><polygon fill="none" points="20 21 12 13.44 4 21 4 3 20 3 20 21" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></polygon></svg>',
    saveFilled: '<svg aria-label="移除" color="currentColor" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><polygon fill="currentColor" points="20 21 12 13.44 4 21 4 3 20 3 20 21"></polygon></svg>',
    more: '<svg aria-label="更多選項" color="currentColor" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><circle cx="12" cy="12" r="1.5"></circle><circle cx="6" cy="12" r="1.5"></circle><circle cx="18" cy="12" r="1.5"></circle></svg>',
    soundOff: '<svg aria-label="正在播放音效" fill="white" height="12" role="img" viewBox="0 0 24 24" width="12"><path d="M16.636 7.028a1.5 1.5 0 1 0-2.395 1.807 5.365 5.365 0 0 1 1.103 3.17 5.378 5.378 0 0 1-1.105 3.176 1.5 1.5 0 1 0 2.395 1.806 8.396 8.396 0 0 0 1.71-4.981 8.39 8.39 0 0 0-1.708-4.978Zm3.73-2.332A1.5 1.5 0 1 0 18.04 6.59 8.823 8.823 0 0 1 20 12.007a8.798 8.798 0 0 1-1.96 5.415 1.5 1.5 0 0 0 2.326 1.894 11.672 11.672 0 0 0 2.635-7.31 11.682 11.682 0 0 0-2.635-7.31Zm-8.963-3.613a1.001 1.001 0 0 0-1.082.187L5.265 6H2a1 1 0 0 0-1 1v10.003a1 1 0 0 0 1 1h3.265l5.01 4.682.02.021a1 1 0 0 0 1.704-.814L12.005 2a1 1 0 0 0-.602-.917Z"></path></svg>',
    soundOn: '<svg aria-label="已靜音" fill="white" height="12" role="img" viewBox="0 0 48 48" width="12"><path clip-rule="evenodd" d="M1.5 13.3c-.8 0-1.5.7-1.5 1.5v18.4c0 .8.7 1.5 1.5 1.5h8.7l12.9 12.9c.9.9 2.5.3 2.5-1v-9.8c0-.4-.2-.8-.4-1.1l-22-22c-.3-.3-.7-.4-1.1-.4h-.6zm46.8 31.4-5.5-5.5C44.9 36.6 48 31.4 48 24c0-11.4-7.2-17.4-7.2-17.4-.6-.6-1.6-.6-2.2 0L37.2 8c-.6.6-.6 1.6 0 2.2 0 0 5.7 5 5.7 13.8 0 5.4-2.1 9.3-3.8 11.6L35.5 32c1.1-1.7 2.3-4.4 2.3-8 0-6.8-4.1-10.3-4.1-10.3-.6-.6-1.6-.6-2.2 0l-1.4 1.4c-.6.6-.6 1.6 0 2.2 0 0 2.6 2 2.6 6.7 0 1.8-.4 3.2-.9 4.3L25.5 22V1.4c0-1.3-1.6-1.9-2.5-1L13.5 10 3.3-.3c-.6-.6-1.5-.6-2.1 0L-.2 1.1c-.6.6-.6 1.5 0 2.1L4 7.6l26.8 26.8 13.9 13.9c.6.6 1.5.6 2.1 0l1.4-1.4c.7-.6.7-1.6.1-2.2z" fill-rule="evenodd"></path></svg>'
};

const NAV_ICONS = {
    prev: '<svg aria-label="Previous" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg aria-label="Next" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>'
};

// ==========================================
// Client
// ==========================================

async function registerClient() {
    try {
        const response = await fetch(`${API_BASE_URL}/clients`, { method: 'POST' });
        if (response.ok) {
            const newClient = await response.json();
            return newClient.id;
        }
        return null;
    } catch (error) {
        console.error('[IG Injector] Failed to register client:', error);
        return null;
    }
}

async function getClientId() {
    const key = 'clientID';
    let data = await chrome.storage.local.get(key);
    if (data[key]) {
        return data[key];
    } else {
        const newId = await registerClient();
        if (newId) {
            await chrome.storage.local.set({ [key]: newId });
            return newId;
        }
        return null;
    }
}

// ==========================================
// State Management & Synchronization
// ==========================================

// Calculates the current effective follow list for UI rendering.
// Merges Server Cache with Local Pending Changes.
function getEffectiveFollowList() {
    const effectiveSet = new Set();

    // Process Server Cache
    Object.keys(serverCache).forEach(username => {
        const data = serverCache[username];
        if (data.isFollowing) {
            effectiveSet.add(username);
        }
    });

    // Apply Local Pending Changes
    Object.keys(pendingChanges).forEach(username => {
        const change = pendingChanges[username];
        if (change.type === 'FOLLOW') {
            effectiveSet.add(username);
        } else if (change.type === 'UNFOLLOW') {
            effectiveSet.delete(username);
        }
    });

    return Array.from(effectiveSet);
}

async function loadState() {
    const data = await chrome.storage.local.get(['serverCache', 'pendingChanges', 'clientID']);
    serverCache = data.serverCache || {};
    pendingChanges = data.pendingChanges || {};
    CLIENT_ID = data.clientID || null;
}

async function saveState() {
    await chrome.storage.local.set({
        'serverCache': serverCache,
        'pendingChanges': pendingChanges
    });
}

async function recordAction(type, username) {
    // Always record the latest action and timestamp
    pendingChanges[username] = {
        type: type,
        timestamp: Date.now()
    };

    await saveState();
    console.log(`[IG Injector] Recorded local action: ${type} ${username}`);

    processSync();
}

let isSyncing = false;

// Push local pending actions to the Server
async function processSync() {
    if (isSyncing || !CLIENT_ID) return;

    const usersToSync = Object.keys(pendingChanges);
    if (usersToSync.length === 0) return;

    isSyncing = true;

    const username = usersToSync[0];
    const action = pendingChanges[username];

    const serverData = serverCache[username];
    const serverTimestamp = serverData ? serverData.timestamp : 0;

    // If Server data is newer, discard local action
    if (serverTimestamp > action.timestamp) {
        console.log(`[IG Injector] Local action outdated for ${username}. Server: ${serverTimestamp}, Local: ${action.timestamp}. Dropping.`);
        delete pendingChanges[username];
        await saveState();
        isSyncing = false;
        processSync();
        return;
    }

    console.log(`[IG Injector] Syncing to Server: ${action.type} ${username}`);

    try {
        let success = false;
        let response;

        if (action.type === 'FOLLOW') {
            response = await fetch(`${API_BASE_URL}/instagram/followings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Client-ID': CLIENT_ID },
                body: JSON.stringify({ followed_username: username })
            });
            if (response.ok || response.status === 409) success = true;
        } else {
            response = await fetch(`${API_BASE_URL}/instagram/followings/${username}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Client-ID': CLIENT_ID }
            });
            if (response.ok || response.status === 404) success = true;
        }

        if (success) {
            serverCache[username] = {
                timestamp: action.timestamp,
                isFollowing: (action.type === 'FOLLOW')
            };

            delete pendingChanges[username];
            await saveState();

            setTimeout(() => {
                isSyncing = false;
                processSync();
            }, 100);
        } else {
            console.warn(`[Sync] Server returned an error (${response.status}) for ${username}. Will retry later.`);
            isSyncing = false;
        }

    } catch (e) {
        console.warn(`[IG Injector] Network error syncing ${username}. Keeping in queue.`);
        isSyncing = false;
    }
}

async function fetchFollowingsFromServer() {
    if (!CLIENT_ID) return;

    try {
        const response = await fetch(`${API_BASE_URL}/instagram/followings`, {
            headers: { 'Client-ID': CLIENT_ID }
        });

        if (response.ok) {
            const serverData = await response.json();

            // Rebuild Server Cache
            // Format: { "username": { timestamp, isFollowing } }
            const newServerCache = {};
            serverData.forEach(item => {
                const timeMs = new Date(item.updated_at).getTime();
                newServerCache[item.followed_username] = {
                    timestamp: timeMs,
                    isFollowing: item.is_following
                };
            });

            // Reconcile Pending Changes
            Object.keys(pendingChanges).forEach(username => {
                const localAction = pendingChanges[username];

                const serverEntry = newServerCache[username];
                const serverTime = serverEntry ? serverEntry.timestamp : 0;

                // Server data is newer -> Discard local pending action
                if (serverTime > localAction.timestamp) {
                    console.log(`[IG Injector] Conflict: Server data newer for ${username}. Removed local pending action.`);
                    delete pendingChanges[username];
                    return;
                }
            });

            serverCache = newServerCache;
            await saveState();

            console.log(`[IG Injector] Server list fetched. Users: ${Object.keys(serverCache).length}, Pending Actions: ${Object.keys(pendingChanges).length}`);

            // Resume syncing if there are surviving pending changes
            processSync();
        }
    } catch (e) {
        console.log('[IG Injector] Fetch server list failed:', e);
    }
}

// ==========================================
// Post
// ==========================================

async function fetchFeed(limit = 2) {
    if (!CLIENT_ID) return [];
    const url = `${API_BASE_URL}/instagram/feed?limit=${limit}`;
    try {
        const response = await fetch(url, { headers: { 'Client-ID': CLIENT_ID } });
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error('[IG Injector] Fetch feed failed:', error);
        return [];
    }
}

async function handleSaveClick(event) {
    const saveButton = event.currentTarget;
    const postId = saveButton.dataset.postId;
    let isSaved = saveButton.dataset.isSaved === 'true';

    if (!CLIENT_ID || !postId) return;

    saveButton.disabled = true;

    try {
        const url = `${API_BASE_URL}/instagram/posts/${postId}/save`;
        const method = isSaved ? 'DELETE' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Client-ID': CLIENT_ID }
        });

        if (response.ok) {
            isSaved = !isSaved;
            saveButton.dataset.isSaved = isSaved;
            saveButton.innerHTML = isSaved ? ICONS.saveFilled : ICONS.save;
        } else {
            console.error('[IG Injector] Failed to update save state on server.');
        }
    } catch (error) {
        console.error('[IG Injector] Network error during save/unsave:', error);
    } finally {
        saveButton.disabled = false;
    }
}

function createCustomPostElement(data) {
    const postWrapper = document.createElement('article');
    postWrapper.className = 'custom-post-wrapper';
    postWrapper.id = `custom-post-${data.code}`;

    const { owner, media_items } = data;
    const username = owner.username;
    const userProfileUrl = `https://www.instagram.com/${username}/`;
    const profilePicUrl = owner.profile_pic_local_url || `https://ui-avatars.com/api/?name=${username.charAt(0)}&background=random&color=fff&size=32`;
    const postDate = new Date(data.taken_at);
    const dataString = `${postDate.getFullYear()}/${postDate.getMonth() + 1}/${postDate.getDate()}`;
    const postLink = `https://www.instagram.com/p/${data.code}/`;

    // Sort media items
    const sortedMedia = media_items.sort((a, b) => {
        // Helper: Extract leading number from filename in URL
        const getIndexFromUrl = (item) => {
            // Get any available local URL
            const url = item.image_local_url || item.video_local_url;
            if (!url) return 999; // If no URL, push to end

            try {
                // Get filename (e.g., 00_12345.jpg)
                const filename = url.substring(url.lastIndexOf('/') + 1);
                // Get part before underscore (e.g., 00)
                const prefix = filename.split('_')[0];
                // Convert to number
                const index = parseInt(prefix, 10);
                return isNaN(index) ? 999 : index;
            } catch (e) {
                return 999;
            }
        };

        return getIndexFromUrl(a) - getIndexFromUrl(b);
    });

    const hasMultipleMedia = sortedMedia.length > 1;

    // Generate HTML for media items
    const mediaAllHTML = sortedMedia.map(item => {
        const isVideo = item.media_type === 2 || (item.video_local_url !== null);
        const imageUrl = item.image_local_url || item.image_url;
        const videoUrl = item.video_local_url || item.video_url;

        let contentHTML = '';

        if (isVideo && videoUrl) {
            // Structure: Wrapper + Video + Sound Button
            // Use 'data-src' to prevent immediate loading for CSP bypass logic
            contentHTML = `
                <div class="video-wrapper">
                    <video data-src="${videoUrl}" poster="${imageUrl}" autoplay muted loop playsinline class="post-video"></video>
                    <button class="sound-btn" type="button">
                        ${ICONS.soundOn}
                    </button>
                </div>`;

            // Async Blob Loader (CSP Bypass)
            setTimeout(async () => {
                // Find the specific video element by ID and data-src
                const wrapper = document.getElementById(`custom-post-${data.code}`);
                if (!wrapper) return;

                const videoEl = wrapper.querySelector(`video[data-src="${videoUrl}"]`);

                if (videoEl) {
                    try {
                        // Fetch video as Blob to bypass CSP restrictions on localhost
                        const req = await fetch(videoUrl);
                        const blob = await req.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        videoEl.src = blobUrl;
                    } catch (e) {
                        console.error("[IG Injector] Blob load failed, falling back to original URL:", e);
                        videoEl.src = videoUrl;
                    }
                }
            }, 0);
        } else {
            contentHTML = `<img src="${imageUrl}" alt="Post content">`;
        }

        return `<div class="carousel-item">${contentHTML}</div>`;
    }).join('');

    // Generate Navigation Elements (Arrows & Dots)
    let navigationHTML = '';
    if (hasMultipleMedia) {
        const prevIcon = NAV_ICONS.prev;
        const nextIcon = NAV_ICONS.next;
        const dotsHTML = sortedMedia.map((_, index) =>
            `<div class="dot ${index === 0 ? 'active' : ''}" data-index="${index}"></div>`
        ).join('');

        navigationHTML = `
            <button class="nav-btn prev hidden" type="button">${prevIcon}</button>
            <button class="nav-btn next" type="button">${nextIcon}</button>
            <div class="dots-container">${dotsHTML}</div>
        `;
    }

    const captionText = (data.caption_text || '').replace(/\n/g, '<br>');
    const saveButtonIcon = data.is_saved ? ICONS.saveFilled : ICONS.save;

    postWrapper.innerHTML = `
        <header class="custom-post-header">
            <div class="header-left">
                <a class="profile-pic-container" href="${userProfileUrl}" target="_blank">
                    <img class="profile-pic" src="${profilePicUrl}" alt="${username}">
                </a>
                <div class="user-text-info">
                    <div class="username-row">
                        <a class="username" href="${userProfileUrl}" target="_blank">${username}</a>
                        <span class="custom-date-text"> • ${dataString}</span>
                    </div>
                </div>
            </div>
            <div class="more-options">${ICONS.more}</div>
        </header>
        <div class="carousel-wrapper">
            <div class="carousel-container">
                ${mediaAllHTML}
            </div>
            ${navigationHTML}
        </div>
        <footer class="custom-post-footer">
            <div class="actions-bar">
                <div class="actions-left">
                    <a class="action-btn" href="${postLink}" target="_blank">${ICONS.like}</a>
                    <span class="action-count">${data.like_count.toLocaleString()}</span>
                    <a class="action-btn" href="${postLink}" target="_blank">${ICONS.comment}</a>
                    <span class="action-count">${data.comment_count.toLocaleString()}</span>
                    <button class="action-btn">${ICONS.share}</button>
                </div>
                <button class="action-btn save" data-post-id="${data.id}" data-is-saved="${!!data.is_saved}">
                    ${saveButtonIcon}
                </button>
            </div>
            <div class="caption-section">
                <a class="caption-username" href="${userProfileUrl}" target="_blank">${username}</a>
                <span class="caption-text">${captionText}</span>
            </div>
        </footer>
    `;

    // Bind Events for Carousel Navigation (if multiple items exist)
    if (hasMultipleMedia) {
        const container = postWrapper.querySelector('.carousel-container');
        const prevBtn = postWrapper.querySelector('.nav-btn.prev');
        const nextBtn = postWrapper.querySelector('.nav-btn.next');
        const dots = postWrapper.querySelectorAll('.dot');
        const getItemWidth = () => container.clientWidth || 470;

        const updateUI = () => {
            const scrollLeft = container.scrollLeft;
            const width = getItemWidth();
            const scrollWidth = container.scrollWidth;

            const currentIndex = Math.round(scrollLeft / width);

            if (currentIndex <= 0) prevBtn.classList.add('hidden');
            else prevBtn.classList.remove('hidden');

            // Tolerance for float calculation
            if (scrollLeft + width >= scrollWidth - 5) nextBtn.classList.add('hidden');
            else nextBtn.classList.remove('hidden');

            dots.forEach((dot, idx) => {
                if (idx === currentIndex) dot.classList.add('active');
                else dot.classList.remove('active');
            });
        };

        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            container.scrollBy({ left: -getItemWidth(), behavior: 'smooth' });
        });

        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            container.scrollBy({ left: getItemWidth(), behavior: 'smooth' });
        });

        container.addEventListener('scroll', () => {
            window.requestAnimationFrame(updateUI);
        });

        setTimeout(updateUI, 200);
    }

    const saveButton = postWrapper.querySelector('.action-btn.save');
    if (saveButton) {
        saveButton.addEventListener('click', handleSaveClick);
    }

    const soundButtons = postWrapper.querySelectorAll('.sound-btn');
    soundButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            // Find the video within the same wrapper
            const wrapper = btn.closest('.video-wrapper');
            const video = wrapper.querySelector('video');

            if (video) {
                video.muted = !video.muted; // Toggle mute state

                // Update Icon
                if (video.muted) {
                    btn.innerHTML = ICONS.soundOn; // Show "Muted" icon (video is silent)
                } else {
                    btn.innerHTML = ICONS.soundOff; // Show "Sound On" icon (video has audio)
                }
            }
        });
    });

    return postWrapper;
}

async function injectPost() {
    // Set the number of new posts to fetch in one batch
    const FEED_LIMIT = 2;

    // Only inject on the Instagram home page ('/')
    if (window.location.pathname !== '/') {
        return;
    }

    // Check if we have already injected posts
    if (document.querySelector('.custom-post-wrapper')) {
        clearInterval(injectionInterval);
        return;
    }

    // Find the feed container
    const firstPostArticle = document.querySelector('main article');
    if (!firstPostArticle) return;

    const feedContainer = firstPostArticle.parentElement?.parentElement;
    if (!feedContainer) return;

    // Stop interval processing
    clearInterval(injectionInterval);
    console.log(`[IG Injector] Checking for new feed posts (Limit: ${FEED_LIMIT})...`);

    const allPosts = await fetchFeed(FEED_LIMIT);

    if (allPosts.length === 0) {
        console.log('[IG Injector] No new unsent posts found.');
        return;
    }

    // Reverse the array so that the newest post is appearing at the top
    const postsToInject = [...allPosts].reverse();

    postsToInject.forEach(postData => {
        if (!postData || !postData.code) return;

        // Double check duplicate injection by ID
        if (!document.getElementById(`custom-post-${postData.code}`)) {
            const customPost = createCustomPostElement(postData);
            feedContainer.insertBefore(customPost, feedContainer.firstChild);
        }
    });

    console.log(`%c[IG Injector] Successfully injected ${allPosts.length} posts!`, 'color: green; font-weight: bold;');
}

// ==========================================
// Anonymous Follow Button
// ==========================================

function showContextMenu(x, y, username) {
    // Remove existing menu
    const existingMenu = document.getElementById('anon-context-menu');
    if (existingMenu) existingMenu.remove();

    // Check current follow status
    const currentList = getEffectiveFollowList();
    const isAnonFollowing = currentList.includes(username);

    // Create menu DOM
    const menu = document.createElement('div');
    menu.id = 'anon-context-menu';
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;

    const menuItem = document.createElement('div');
    menuItem.className = `anon-menu-item ${isAnonFollowing ? 'action-unfollow' : 'action-follow'}`;
    menuItem.innerHTML = isAnonFollowing
        ? '<span>Unfollow (Anonymous)</span>'
        : '<span>Follow Anonymously</span>';

    // Handle click action
    menuItem.onclick = async (e) => {
        e.stopPropagation();
        if (isAnonFollowing) {
            await recordAction('UNFOLLOW', username);
            console.log(`[IG Injector] Unfollowed ${username} anonymously.`);
        } else {
            await recordAction('FOLLOW', username);
            console.log(`[IG Injector] Followed ${username} anonymously.`);
        }
        menu.remove();
    };

    menu.appendChild(menuItem);
    document.body.appendChild(menu);

    // Close menu on outside click
    setTimeout(() => {
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
                document.removeEventListener('contextmenu', closeMenu);
            }
        };
        document.addEventListener('click', closeMenu);
        document.addEventListener('contextmenu', closeMenu);
    }, 10);
}

// Global right-click event listener
document.addEventListener('contextmenu', (e) => {
    // Check if on a profile page
    const pathParts = window.location.pathname.split('/').filter(p => p);
    if (pathParts.length === 0 || ['p', 'explore', 'direct', 'reels', 'stories'].includes(pathParts[0])) {
        return;
    }
    const currentUsername = pathParts[0];

    // Check if target is a button
    const targetBtn = e.target.closest('button, a, div[role="button"]');

    if (!targetBtn) return;

    // Ensure button is in the header
    if (!targetBtn.closest('header')) return;

    // Define keywords for Follow buttons
    const btnText = targetBtn.innerText || "";
    const followKeywords = ['Follow', 'Following', 'Requested', '追蹤', '已追蹤', '追蹤中', '已送出請求'];

    // Check if button text matches keywords
    const isTargetButton = followKeywords.some(kw => btnText.includes(kw));

    if (isTargetButton) {
        // Prevent default browser menu
        e.preventDefault();
        e.stopPropagation();

        console.log(`[IG Injector] Right-click intercepted on button: "${btnText.replace(/\n/g, '')}" for user: ${currentUsername}`);

        // Show custom menu
        showContextMenu(e.pageX, e.pageY, currentUsername);
    }
}, true); // Capture mode

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.serverCache) serverCache = changes.serverCache.newValue || {};
        if (changes.pendingChanges) pendingChanges = changes.pendingChanges.newValue || {};
    }
});

// ==========================================
// Helper Functions
// ==========================================

function sortMediaItems(mediaItems) {
    return [...mediaItems].sort((a, b) => {
        const getIndexFromUrl = (item) => {
            const url = item.image_local_url || item.video_local_url;
            if (!url) return 999;
            try {
                const filename = url.substring(url.lastIndexOf('/') + 1);
                const prefix = filename.split('_')[0];
                const index = parseInt(prefix, 10);
                return isNaN(index) ? 999 : index;
            } catch (e) {
                return 999;
            }
        };
        return getIndexFromUrl(a) - getIndexFromUrl(b);
    });
}


function bindCarouselEvents(wrapper) {
    const container = wrapper.querySelector('.carousel-container');
    const prevBtn = wrapper.querySelector('.nav-btn.prev');
    const nextBtn = wrapper.querySelector('.nav-btn.next');
    const dots = wrapper.querySelectorAll('.dot');

    if (!container || !prevBtn || !nextBtn) return; // No carousel to bind

    const getItemWidth = () => container.clientWidth;

    const updateUI = () => {
        // Debounce or throttle this if performance becomes an issue
        window.requestAnimationFrame(() => {
            const scrollLeft = container.scrollLeft;
            const width = getItemWidth();
            const scrollWidth = container.scrollWidth;
            const currentIndex = Math.round(scrollLeft / width);

            prevBtn.classList.toggle('hidden', currentIndex <= 0);
            nextBtn.classList.toggle('hidden', scrollLeft + width >= scrollWidth - 5);

            if (dots.length > 0) {
                dots.forEach((dot, idx) => {
                    dot.classList.toggle('active', idx === currentIndex);
                });
            }
        });
    };

    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        container.scrollBy({ left: -getItemWidth(), behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        container.scrollBy({ left: getItemWidth(), behavior: 'smooth' });
    });

    container.addEventListener('scroll', updateUI);
    // Initial UI update after a short delay to ensure layout is stable
    setTimeout(updateUI, 100);
}


// ==========================================
// Post Detail Modal
// ==========================================

function createPostDetailModal() {
    if (document.getElementById('post-detail-modal-overlay')) return;

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'post-detail-modal-overlay';
    modalOverlay.innerHTML = `<div class="post-detail-modal-content"></div>`;
    document.body.appendChild(modalOverlay);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target.id === 'post-detail-modal-overlay' || e.target.closest('#post-detail-modal-close-btn')) {
            modalOverlay.classList.remove('visible');
        }
    });
}

function renderPostDetails(postData, container) {
    const { owner, media_items, caption_text, like_count, comment_count, code, id, is_saved } = postData;

    const sortedMedia = sortMediaItems(media_items);
    const hasMultipleMedia = sortedMedia.length > 1;

    const mediaAllHTML = sortedMedia.map(item => {
        const isVideo = item.media_type === 2 || item.video_local_url;
        const imageUrl = item.image_local_url || item.image_url || 'https://via.placeholder.com/600';
        const videoUrl = item.video_local_url || item.video_url;

        if (isVideo && videoUrl) {
            return `<div class="carousel-item"><div class="video-wrapper"><video src="${videoUrl}" poster="${imageUrl}" autoplay muted loop playsinline class="post-video"></video></div></div>`;
        } else {
            return `<div class="carousel-item"><img src="${imageUrl}" alt="Post content"></div>`;
        }
    }).join('');

    let navigationHTML = '';
    if (hasMultipleMedia) {
        navigationHTML = `
            <button class="nav-btn prev hidden" type="button">${NAV_ICONS.prev}</button>
            <button class="nav-btn next" type="button">${NAV_ICONS.next}</button>
        `;
    }

    const userProfileUrl = `https://www.instagram.com/${owner.username}/`;
    const profilePicUrl = owner.profile_pic_local_url || `https://ui-avatars.com/api/?name=${owner.username.charAt(0)}`;
    const postLink = `https://www.instagram.com/p/${code}/`;
    const saveButtonIcon = is_saved ? ICONS.saveFilled : ICONS.save;

    container.innerHTML = `
        <div class="post-detail-media-container">
            <div class="carousel-wrapper">
                <div class="carousel-container">${mediaAllHTML}</div>
                ${navigationHTML}
            </div>
        </div>
        <div class="post-detail-info-container">
            <header class="post-detail-header">
                <button id="post-detail-modal-close-btn" style="position: absolute; top: 10px; right: 10px; font-size: 28px; background: none; border: none; color: white; cursor: pointer; z-index: 10;">&times;</button>
                <a href="${userProfileUrl}" target="_blank"><img class="profile-pic" src="${profilePicUrl}" alt="${owner.username}"></a>
                <a class="username" href="${userProfileUrl}" target="_blank">${owner.username}</a>
            </header>
            <div class="post-detail-scroll-area">
                <div class="post-detail-caption">
                    <a href="${userProfileUrl}" target="_blank"><img class="profile-pic" src="${profilePicUrl}" alt="${owner.username}"></a>
                    <div class="post-detail-caption-text">
                        <a class="username" href="${userProfileUrl}" target="_blank">${owner.username}</a>
                        <span>${caption_text || ''}</span>
                    </div>
                </div>
                <div class="post-detail-comments-placeholder">Comments are not available in this view.</div>
            </div>
            <footer class="post-detail-footer">
                 <div class="actions-bar">
                    <div class="actions-left">
                        <a class="action-btn" href="${postLink}" target="_blank">${ICONS.like}</a><span class="action-count">${like_count.toLocaleString()}</span>
                        <a class="action-btn" href="${postLink}" target="_blank">${ICONS.comment}</a><span class="action-count">${comment_count.toLocaleString()}</span>
                        <button class="action-btn">${ICONS.share}</button>
                    </div>
                    <button class="action-btn save" data-post-id="${id}" data-is-saved="${!!is_saved}">${saveButtonIcon}</button>
                </div>
            </footer>
        </div>
    `;

    bindCarouselEvents(container);
    container.querySelector('.action-btn.save').addEventListener('click', handleSaveClick);
}

async function showPostDetailModal(postIdentifier) {
    createPostDetailModal();
    const modalOverlay = document.getElementById('post-detail-modal-overlay');
    const contentContainer = modalOverlay.querySelector('.post-detail-modal-content');

    contentContainer.innerHTML = '<p style="font-size: 18px; text-align: center; color: white; width: 100%; align-self: center;">Loading post...</p>';
    modalOverlay.classList.add('visible');

    try {
        const response = await fetch(`${API_BASE_URL}/instagram/posts/${postIdentifier}`, { headers: { 'Client-ID': CLIENT_ID } });
        if (!response.ok) throw new Error('Failed to fetch post details');
        const postData = await response.json();
        renderPostDetails(postData, contentContainer);
    } catch (error) {
        console.error("Error fetching post details:", error);
        contentContainer.innerHTML = '<p style="color:red; text-align:center; width: 100%; align-self: center;">Could not load the post.</p>';
    }
}

// ==========================================
// Saved Posts Modal
// ==========================================

function createSavedPostsModal() {
    // Check if modal already exists to prevent duplicates
    if (document.getElementById('saved-posts-modal-overlay')) {
        return;
    }

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'saved-posts-modal-overlay';

    modalOverlay.innerHTML = `
        <div class="saved-posts-modal-content">
            <div class="saved-posts-modal-header">
                <h2>Saved Posts</h2>
                <button id="saved-posts-modal-close-btn">&times;</button>
            </div>
            <div class="saved-posts-grid-container">
                <p style="text-align:center;">Loading...</p>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    const closeModal = () => {
        modalOverlay.classList.remove('visible');
    };

    // Event listeners for closing the modal
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) { // Only close if clicking on the overlay itself
            closeModal();
        }
    });
    document.getElementById('saved-posts-modal-close-btn').addEventListener('click', closeModal);
}

async function showSavedPosts() {
    // Ensure the base modal structure exists
    createSavedPostsModal();

    const modalOverlay = document.getElementById('saved-posts-modal-overlay');
    const gridContainer = modalOverlay.querySelector('.saved-posts-grid-container');

    // Show modal and loading state
    modalOverlay.classList.add('visible');
    gridContainer.innerHTML = '<p style="text-align:center;">Loading...</p>';

    if (!CLIENT_ID) {
        gridContainer.innerHTML = '<p style="text-align:center; color:red;">Error: Client ID not found.</p>';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/instagram/saved-posts`, {
            headers: { 'Client-ID': CLIENT_ID }
        });

        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }

        const posts = await response.json();

        if (posts.length === 0) {
            gridContainer.innerHTML = '<p style="text-align:center;">You have no saved posts yet.</p>';
            return;
        }

        // Create the grid and populate it
        const grid = document.createElement('div');
        grid.className = 'saved-posts-grid';

        posts.forEach(post => {
            const thumbnailUrl = post.thumbnail_url || 'https://via.placeholder.com/300'; // Fallback image

            const item = document.createElement('div');
            item.className = 'saved-post-item';
            item.innerHTML = `
                <a href="#" data-post-code="${post.code}">
                    <img src="${thumbnailUrl}" alt="Saved post thumbnail">
                </a>
            `;
            grid.appendChild(item);
        });

        gridContainer.innerHTML = ''; // Clear loading message
        gridContainer.appendChild(grid);

        gridContainer.addEventListener('click', (event) => {
            const link = event.target.closest('a');
            if (link && link.dataset.postCode) {
                event.preventDefault(); // Stop the link from opening a new tab
                showPostDetailModal(link.dataset.postCode);
            }
        });

    } catch (error) {
        console.error('[IG Injector] Failed to fetch saved posts:', error);
        gridContainer.innerHTML = `<p style="text-align:center; color:red;">Failed to load saved posts. Please try again later.</p>`;
    }
}

// ==========================================
// Listen for messages from the sidepanel
// ==========================================
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