chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Listener for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "recordAction") {
    console.log('[Background] Received recordAction request:', request);

    const { type, username } = request;
    if (!type || !username) {
      console.error('[Background] Invalid recordAction message received.');
      return;
    }

    // Perform the storage operation safely in the background
    // This is an async operation, so we perform it inside a self-executing async function
    (async () => {
      try {
        // Get the current pending changes
        const data = await chrome.storage.local.get('pendingChanges');
        const pendingChanges = data.pendingChanges || {};

        // Update the pending changes with the new action
        pendingChanges[username] = {
          type: type,
          timestamp: Date.now()
        };

        // Save the updated object back to storage
        await chrome.storage.local.set({ 'pendingChanges': pendingChanges });

        console.log(`[Background] Successfully recorded action: ${type} ${username}`);

      } catch (error) {
        console.error('[Background] Error while saving state:', error);
      }
    })();

    return true;
  }
});