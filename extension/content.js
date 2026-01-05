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
    more: '<svg aria-label="更多選項" color="currentColor" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><circle cx="12" cy="12" r="1.5"></circle><circle cx="6" cy="12" r="1.5"></circle><circle cx="18" cy="12" r="1.5"></circle></svg>',
    soundOff: '<svg aria-label="正在播放音效" fill="white" height="12" role="img" viewBox="0 0 24 24" width="12"><path d="M16.636 7.028a1.5 1.5 0 1 0-2.395 1.807 5.365 5.365 0 0 1 1.103 3.17 5.378 5.378 0 0 1-1.105 3.176 1.5 1.5 0 1 0 2.395 1.806 8.396 8.396 0 0 0 1.71-4.981 8.39 8.39 0 0 0-1.708-4.978Zm3.73-2.332A1.5 1.5 0 1 0 18.04 6.59 8.823 8.823 0 0 1 20 12.007a8.798 8.798 0 0 1-1.96 5.415 1.5 1.5 0 0 0 2.326 1.894 11.672 11.672 0 0 0 2.635-7.31 11.682 11.682 0 0 0-2.635-7.31Zm-8.963-3.613a1.001 1.001 0 0 0-1.082.187L5.265 6H2a1 1 0 0 0-1 1v10.003a1 1 0 0 0 1 1h3.265l5.01 4.682.02.021a1 1 0 0 0 1.704-.814L12.005 2a1 1 0 0 0-.602-.917Z"></path></svg>',
    soundOn: '<svg aria-label="已靜音" fill="white" height="12" role="img" viewBox="0 0 48 48" width="12"><path clip-rule="evenodd" d="M1.5 13.3c-.8 0-1.5.7-1.5 1.5v18.4c0 .8.7 1.5 1.5 1.5h8.7l12.9 12.9c.9.9 2.5.3 2.5-1v-9.8c0-.4-.2-.8-.4-1.1l-22-22c-.3-.3-.7-.4-1.1-.4h-.6zm46.8 31.4-5.5-5.5C44.9 36.6 48 31.4 48 24c0-11.4-7.2-17.4-7.2-17.4-.6-.6-1.6-.6-2.2 0L37.2 8c-.6.6-.6 1.6 0 2.2 0 0 5.7 5 5.7 13.8 0 5.4-2.1 9.3-3.8 11.6L35.5 32c1.1-1.7 2.3-4.4 2.3-8 0-6.8-4.1-10.3-4.1-10.3-.6-.6-1.6-.6-2.2 0l-1.4 1.4c-.6.6-.6 1.6 0 2.2 0 0 2.6 2 2.6 6.7 0 1.8-.4 3.2-.9 4.3L25.5 22V1.4c0-1.3-1.6-1.9-2.5-1L13.5 10 3.3-.3c-.6-.6-1.5-.6-2.1 0L-.2 1.1c-.6.6-.6 1.5 0 2.1L4 7.6l26.8 26.8 13.9 13.9c.6.6 1.5.6 2.1 0l1.4-1.4c.7-.6.7-1.6.1-2.2z" fill-rule="evenodd"></path></svg>'
};

const NAV_ICONS = {
    prev: '<svg aria-label="Previous" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg aria-label="Next" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>'
};

// ==========================================
// Helper: Shuffle Array (Fisher-Yates)
// ==========================================
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

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
    const isFollowedInServer = serverData ? serverData.isFollowing : false;

    // If Server data is newer, discard local action
    if (serverTimestamp > action.timestamp) {
        console.log(`[IG Injector] Local action outdated for ${username}. Server: ${serverTimestamp}, Local: ${action.timestamp}. Dropping.`);
        delete pendingChanges[username];
        await saveState();
        isSyncing = false;
        processSync();
        return;
    }

    // If local action matches server state, discard it
    // if ((action.type === 'FOLLOW' && isFollowedInServer) ||
    //     (action.type === 'UNFOLLOW' && !isFollowedInServer)) {
    //     console.log(`[IG Injector] Local action matches server state for ${username}. Dropping.`);
    //     delete pendingChanges[username];
    //     await saveState();
    //     isSyncing = false;
    //     processSync();
    //     return;
    // }

    console.log(`[IG Injector] Syncing to Server: ${action.type} ${username}`);

    try {
        let success = false;

        if (action.type === 'FOLLOW') {
            const res = await fetch(`${API_BASE_URL}/instagram/followings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Client-ID': CLIENT_ID },
                body: JSON.stringify({ followed_username: username })
            });
            if (res.ok || res.status === 409) success = true;
        } else {
            const res = await fetch(`${API_BASE_URL}/instagram/followings/${username}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Client-ID': CLIENT_ID }
            });
            if (res.ok || res.status === 404) success = true;
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
            return;
        }

    } catch (e) {
        console.warn(`[IG Injector] Network error syncing ${username}. Keeping in queue.`);
    }

    isSyncing = false;
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
                const isServerFollowed = serverEntry ? serverEntry.isFollowing : false;

                // Server data is newer -> Discard local pending action
                if (serverTime > localAction.timestamp) {
                    console.log(`[IG Injector] Conflict: Server data newer for ${username}. Removed local pending action.`);
                    delete pendingChanges[username];
                    return;
                }

                // State matches -> Discard local pending action
                // if ((localAction.type === 'FOLLOW' && isServerFollowed) ||
                //     (localAction.type === 'UNFOLLOW' && !isServerFollowed)) {
                //     delete pendingChanges[username];
                // }
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

async function fetchUserPosts(identifier, limit = 1) {
    if (!CLIENT_ID) return [];
    const url = `${API_BASE_URL}/instagram/users/${identifier}/posts?limit=${limit}`;
    try {
        const response = await fetch(url, { headers: { 'Client-ID': CLIENT_ID } });
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        return [];
    }
}

function createCustomPostElement(data) {
    const postWrapper = document.createElement('article');
    postWrapper.className = 'custom-post-wrapper';
    postWrapper.id = `custom-post-${data.code}`;

    const { owner, media_items } = data;
    const username = owner.username;
    const profilePicUrl = owner.profile_pic_local_url || `https://ui-avatars.com/api/?name=${username.charAt(0)}&background=random&color=fff&size=32`;
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
            // We use 'data-src' to prevent immediate loading for CSP bypass logic
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

    postWrapper.innerHTML = `
        <header class="custom-post-header">
            <div class="header-left">
                <a class="profile-pic-container" href="https://www.instagram.com/${username}/" target="_blank">
                    <img class="profile-pic" src="${profilePicUrl}" alt="${username}">
                </a>
                <div class="user-text-info">
                    <div class="username-row">
                        <a class="username" href="https://www.instagram.com/${username}/" target="_blank">${username}</a>
                        <span class="time-separator">•</span>
                        <span class="post-time">1小時</span>
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
                <button class="action-btn save">${ICONS.save}</button>
            </div>
            <div class="caption-section">
                <a class="caption-username" href="https://www.instagram.com/${username}/" target="_blank">${username}</a>
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
    const USERS_TO_FETCH = 3;    // 隨機選取 3 位使用者
    const POSTS_PER_USER = 2;    // 每位使用者顯示 2 篇貼文

    // Only inject on the Instagram home page ('/')
    if (window.location.pathname !== '/') {
        return;
    }

    // Check if we have already injected posts to prevent duplicates
    if (document.querySelector('.custom-post-wrapper')) {
        clearInterval(injectionInterval);
        return;
    }

    // Find the feed container
    const firstPostArticle = document.querySelector('main article');
    if (!firstPostArticle) return;

    const feedContainer = firstPostArticle.parentElement?.parentElement;
    if (!feedContainer) return;

    // Get Follow List
    const effectiveList = getEffectiveFollowList();
    if (effectiveList.length === 0) {
        clearInterval(injectionInterval);
        return;
    }

    // Stop interval processing
    clearInterval(injectionInterval);
    console.log(`[IG Injector] Starting batch injection: ${USERS_TO_FETCH} users, ${POSTS_PER_USER} posts each...`);

    // Select Users: Shuffle and pick random N users
    const shuffledUsers = shuffleArray([...effectiveList]);
    const targetUsers = shuffledUsers.slice(0, USERS_TO_FETCH);

    // Fetch posts concurrently
    // 注意：fetchUserPosts 的第二個參數是 limit，這裡傳入 POSTS_PER_USER
    const promises = targetUsers.map(user => fetchUserPosts(user, POSTS_PER_USER));
    const results = await Promise.all(promises);

    // Flatten the results (array of arrays -> single array of posts)
    // results 結構原本是: [[UserA_Post1, UserA_Post2], [UserB_Post1, UserB_Post2]]
    // flat() 後變成: [UserA_Post1, UserA_Post2, UserB_Post1, UserB_Post2]
    let allPosts = results.flat();

    if (allPosts.length === 0) {
        console.log('[IG Injector] No valid posts found.');
        return;
    }

    // 這裡我們將陣列反轉 (reverse)，因為 insertBefore 是插入在最前面。
    // 為了讓螢幕上顯示順序為 [UserA_1, UserA_2, UserB_1...]，
    // 我們需要以相反順序插入：先插 UserB_2 -> UserB_1 -> UserA_2 -> UserA_1
    // 這樣 UserA_1 就會被擠到最上面的位置。
    allPosts.reverse().forEach(postData => {
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

let lastProcessedUrl = null;

function createAnonymousFollowButton(username) {

    const currentList = getEffectiveFollowList();
    const isAlreadyFollowing = currentList.includes(username);

    const button = document.createElement('div');
    button.id = 'anonymous-follow-btn';
    button.className = 'anonymous-follow-btn';
    button.setAttribute('role', 'button');

    const updateButtonState = (isFollowing) => {
        if (isFollowing) {
            button.textContent = '✓ Anon Following';
            button.classList.add('following');
        } else {
            button.textContent = 'Anon Follow';
            button.classList.remove('following');
        }
    };

    updateButtonState(isAlreadyFollowing);

    button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Prevent rapid clicking
        if (button.dataset.processing === "true") return;
        button.dataset.processing = "true";
        setTimeout(() => button.dataset.processing = "false", 300);

        const currentIsFollowing = button.classList.contains('following');

        if (currentIsFollowing) {
            updateButtonState(false);
            await recordAction('UNFOLLOW', username);
        } else {
            updateButtonState(true);
            await recordAction('FOLLOW', username);
        }
    });

    return button;
}

async function injectButtonOnProfilePage() {
    const currentUrl = window.location.pathname;

    // Avoid duplicate execution if already injected on this page
    if (lastProcessedUrl === currentUrl && document.getElementById('anonymous-follow-btn')) return;

    const pathParts = currentUrl.split('/').filter(p => p);
    if (pathParts.length === 0 || ['explore', 'direct', 'reels', 'stories'].includes(pathParts[0])) {
        lastProcessedUrl = currentUrl;
        return;
    }
    const username = pathParts[0];

    const header = document.querySelector('main header');
    if (!header) return;

    // Find the "Follow" related button to serve as an anchor
    let buttonContainer = null;
    let followBtnWrapper = null; // Wrapper used to locate the follow button

    const followKeywords = ['追蹤', '已追蹤', '追蹤中', 'Follow', 'Following', 'Requested', '关注', '已关注', '关注中'];

    const buttons = header.querySelectorAll('button, a[role="link"]');

    for (let btn of buttons) {
        const text = btn.innerText;
        if (text && followKeywords.some(kw => text === kw || text.startsWith(kw + '\n'))) {
            const parent = btn.parentElement;
            const grandParent = parent.parentElement;
            const greatGrandParent = grandParent?.parentElement;

            // Determine Flex Container based on structure depth
            if (parent.childElementCount > 1) {
                buttonContainer = parent;
                followBtnWrapper = btn;
            } else if (grandParent && grandParent.childElementCount > 1) {
                buttonContainer = grandParent;
                followBtnWrapper = parent;
            } else if (greatGrandParent && greatGrandParent.childElementCount > 1) {
                buttonContainer = greatGrandParent;
                followBtnWrapper = grandParent;
            } else if (grandParent) {
                buttonContainer = grandParent;
                followBtnWrapper = parent;
            }

            if (buttonContainer) break;
        }
    }

    if (!buttonContainer || !followBtnWrapper) {
        return;
    }

    // Double check if already injected
    if (buttonContainer.querySelector('#anonymous-follow-btn')) {
        lastProcessedUrl = currentUrl;
        return;
    }

    console.log(`[IG Injector] Profile page for @${username} detected. Injecting button next to Follow...`);

    const ourButton = createAnonymousFollowButton(username);

    // Insert the button after the "Follow" button
    ourButton.style.marginLeft = '0px';
    ourButton.style.marginRight = '0px';
    buttonContainer.insertBefore(ourButton, followBtnWrapper.nextSibling);

    lastProcessedUrl = currentUrl;
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        let stateChanged = false;

        // Update local variables
        if (changes.serverCache) {
            serverCache = changes.serverCache.newValue || {};
            stateChanged = true;
        }
        if (changes.pendingChanges) {
            pendingChanges = changes.pendingChanges.newValue || {};
            stateChanged = true;
        }

        // Re-render button if state changed
        if (stateChanged) {
            updateCurrentPageButtonState();
        }
    }
});

// Updates button appearance without a page reload
function updateCurrentPageButtonState() {
    const btn = document.getElementById('anonymous-follow-btn');
    if (!btn) return;

    // Extract username from current URL
    const pathParts = window.location.pathname.split('/').filter(p => p);
    if (pathParts.length === 0) return;
    const username = pathParts[0];

    // Recalculate status
    const currentList = getEffectiveFollowList();
    const isFollowing = currentList.includes(username);

    // Update DOM
    if (isFollowing) {
        btn.textContent = '✓ Anon Following';
        btn.classList.add('following');
    } else {
        btn.textContent = 'Anonymous Follow';
        btn.classList.remove('following');
    }
}

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

        // DOM Observer for button injection
        const observer = new MutationObserver(() => {
            clearTimeout(window.myObserverTimeout);
            window.myObserverTimeout = setTimeout(injectButtonOnProfilePage, 500);
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Post injection (based on effective list)
        injectionInterval = setInterval(injectPost, 2000);
        setTimeout(() => clearInterval(injectionInterval), 30000);
    }
}

initializeApp();