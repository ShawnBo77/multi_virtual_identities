// ==========================================
// Feed Post
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

function sortMediaItems(mediaItems) {
    return [...mediaItems].sort((a, b) => {
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
    const sortedMedia = sortMediaItems(media_items);

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
        bindCarouselEvents(postWrapper)
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
// Saved Posts Overview
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
// Saved Post
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

    // the HTML for all media items.
    // For videos, only set the 'data-src' attribute.
    const mediaAllHTML = sortedMedia.map(item => {
        const isVideo = item.media_type === 2 || item.video_local_url;
        const imageUrl = item.image_local_url || item.image_url || 'https://via.placeholder.com/600';
        const videoUrl = item.video_local_url || item.video_url;

        if (isVideo && videoUrl) {
            return `<div class="carousel-item">
                        <div class="video-wrapper">
                            <video data-src="${videoUrl}" poster="${imageUrl}" autoplay muted loop playsinline class="post-video"></video>
                            <button class="sound-btn" type="button">${ICONS.soundOn}</button>
                        </div>
                    </div>`;
        } else {
            return `<div class="carousel-item"><img src="${imageUrl}" alt="Post content"></div>`;
        }
    }).join('');

    const dotsHTML = hasMultipleMedia ? sortedMedia.map((_, index) =>
        `<div class="dot ${index === 0 ? 'active' : ''}" data-index="${index}"></div>`
    ).join('') : '';

    const navigationHTML = hasMultipleMedia ? `
        <button class="nav-btn prev hidden" type="button">${NAV_ICONS.prev}</button>
        <button class="nav-btn next" type="button">${NAV_ICONS.next}</button>
        <div class="dots-container">${dotsHTML}</div>
    ` : '';

    const userProfileUrl = `https://www.instagram.com/${owner.username}/`;
    const profilePicUrl = owner.profile_pic_local_url || `https://ui-avatars.com/api/?name=${owner.username.charAt(0)}`;
    const postLink = `https://www.instagram.com/p/${code}/`;
    const saveButtonIcon = is_saved ? ICONS.saveFilled : ICONS.save;

    // Set the complete innerHTML of the modal container.
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

    // AFTER the HTML is rendered, find the video elements and load them.
    const videoElements = container.querySelectorAll('video[data-src]');
    videoElements.forEach(videoEl => {
        const videoUrl = videoEl.dataset.src;
        if (videoUrl) {
            (async () => {
                try {
                    // Fetch video as Blob to bypass CSP restrictions on localhost
                    const req = await fetch(videoUrl);
                    const blob = await req.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    videoEl.src = blobUrl;
                } catch (e) {
                    console.error("[IG Injector] Blob load failed for modal video, falling back to original URL:", e);
                    videoEl.src = videoUrl;
                }
            })();
        }
    });

    bindCarouselEvents(container);
    container.querySelector('.action-btn.save').addEventListener('click', handleSaveClick);

    const soundButtons = container.querySelectorAll('.sound-btn');
    soundButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const video = btn.closest('.video-wrapper')?.querySelector('video');
            if (video) {
                video.muted = !video.muted;
                btn.innerHTML = video.muted ? ICONS.soundOn : ICONS.soundOff;
            }
        });
    });
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