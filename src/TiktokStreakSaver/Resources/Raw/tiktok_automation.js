// TikTok Message Automation Script
// This script is injected into the TikTok WebView to automate messaging

(function () {
    var userName = '[UserName]';
    var message = '[Message]';
    var isGroup = '[IsGroup]' === 'true';
    var found = false;
    var chatIndex = 0;
    var chatItems = [];
    var maxScrollAttempts = 50;
    var scrollAttempts = 0;
    var checkedUsernames = {};
    var newItemsFound = 0;

    var log = function (msg) {
        if (typeof StreakApp == 'undefined') {
            console.log(msg);
            return;
        }
        StreakApp.log(msg);
    };

    // ── Environment & Diagnostics ────────────────────────────────────────────

    var dumpEnvironment = function () {
        log('=== FULL ENVIRONMENT DUMP ===');
        log('[ENV] User Agent: ' + navigator.userAgent);
        log('[ENV] Platform: ' + navigator.platform);
        log('[ENV] Page URL: ' + window.location.href);
        log('[ENV] Page Title: ' + document.title);
        log('[ENV] Document Ready: ' + document.readyState);
        log('[ENV] Total DOM elements: ' + document.querySelectorAll('*').length);
        log('[ENV] Viewport: ' + window.innerWidth + 'x' + window.innerHeight);
        log('[ENV] Screen: ' + screen.width + 'x' + screen.height);

        log('[DOM] <html>: ' + (document.documentElement ? 'YES' : 'NO'));
        log('[DOM] <body>: ' + (document.body ? 'YES' : 'NO'));
        log('[DOM] Elements with id: ' + document.querySelectorAll('[id]').length);
        log('[DOM] Elements with class: ' + document.querySelectorAll('[class]').length);
        log('[DOM] Elements with data-e2e: ' + document.querySelectorAll('[data-e2e]').length);

        // TikTok-specific structure checks
        log('[TIKTOK] #app: ' + (document.getElementById('app') ? 'YES' : 'NO'));
        log('[TIKTOK] [id*="app"]: ' + document.querySelectorAll('[id*="app"]').length);
        log('[TIKTOK] [class*="messages"]: ' + document.querySelectorAll('[class*="messages"]').length);
        log('[TIKTOK] [class*="Messages"]: ' + document.querySelectorAll('[class*="Messages"]').length);
        log('[TIKTOK] [class*="chat"]: ' + document.querySelectorAll('[class*="chat"]').length);
        log('[TIKTOK] [class*="Chat"]: ' + document.querySelectorAll('[class*="Chat"]').length);
        log('[TIKTOK] [class*="conversation"]: ' + document.querySelectorAll('[class*="conversation"]').length);
        log('[TIKTOK] [class*="Conversation"]: ' + document.querySelectorAll('[class*="Conversation"]').length);
        log('[TIKTOK] [contenteditable]: ' + document.querySelectorAll('[contenteditable]').length);

        // Framework detection
        log('[FRAMEWORK] window.React: ' + (typeof window.React !== 'undefined' ? 'YES' : 'NO'));
        log('[FRAMEWORK] __REACT_DEVTOOLS_GLOBAL_HOOK__: ' + (typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined' ? 'YES' : 'NO'));
        log('[FRAMEWORK] __NEXT_DATA__: ' + (typeof window.__NEXT_DATA__ !== 'undefined' ? 'YES' : 'NO'));

        log('=== END ENVIRONMENT DUMP ===');
    };

    var dumpDataE2eValues = function () {
        var allE2e = document.querySelectorAll('[data-e2e]');
        var uniqueVals = {};
        for (var i = 0; i < allE2e.length; i++) {
            var val = allE2e[i].getAttribute('data-e2e');
            if (val) uniqueVals[val] = true;
        }
        var keys = Object.keys(uniqueVals);
        log('[DATA-E2E] Total elements: ' + allE2e.length + ', Unique values: ' + keys.length);

        var chunk = [];
        for (var j = 0; j < keys.length; j++) {
            chunk.push(keys[j]);
            if (chunk.length >= 15 || j === keys.length - 1) {
                log('[DATA-E2E] ' + chunk.join(', '));
                chunk = [];
            }
        }
    };

    var searchUsernameInDom = function () {
        log('[USERNAME-SEARCH] Hunting for: ' + userName);
        var xpath = "//*[contains(text(), '" + userName + "')]";
        var result = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
        var node = result.iterateNext();
        var foundNodes = 0;

        while (node && foundNodes < 5) {
            foundNodes++;
            var current = node;
            var path = [];
            var foundE2e = null;

            for (var k = 0; k < 8 && current && current !== document.body; k++) {
                path.unshift(current.tagName);
                if (current.hasAttribute && current.hasAttribute('data-e2e')) {
                    foundE2e = current.getAttribute('data-e2e');
                    break;
                }
                current = current.parentNode;
            }

            if (foundE2e) {
                log('[USERNAME-SEARCH] Found inside data-e2e="' + foundE2e + '" (tags: ' + path.join('>') + ')');
            } else {
                log('[USERNAME-SEARCH] Found text, no data-e2e parent. Tags: ' + path.join('>'));
            }

            node = result.iterateNext();
        }

        if (foundNodes === 0) {
            log('[USERNAME-SEARCH] CRITICAL: "' + userName + '" not found anywhere in DOM!');
        }
    };

    var dumpFullDiagnostics = function () {
        dumpEnvironment();
        log('=== PAGE DIAGNOSTICS START ===');
        dumpDataE2eValues();
        searchUsernameInDom();

        // Log visible body text length to detect empty/blocked pages
        var bodyText = (document.body && document.body.innerText) || '';
        log('[PAGE] Body text length: ' + bodyText.length + ' chars');
        if (bodyText.length < 200) {
            log('[PAGE] Body text (short page): ' + bodyText.substring(0, 200));
        }

        // Check for common TikTok error/block indicators
        var errorIndicators = ['captcha', 'verify', 'blocked', 'suspended', 'error', 'login'];
        for (var i = 0; i < errorIndicators.length; i++) {
            if (bodyText.toLowerCase().indexOf(errorIndicators[i]) !== -1) {
                log('[PAGE] WARNING: Body contains "' + errorIndicators[i] + '"');
            }
        }

        log('=== PAGE DIAGNOSTICS END ===');
    };

    // ── Chat Item Discovery ──────────────────────────────────────────────────

    var findChatItems = function () {
        // Primary: current TikTok DM selector
        var items = document.querySelectorAll("[data-e2e*='dm-new-conversation-item']");
        if (items.length > 0) {
            log('[FIND] Found ' + items.length + ' items via: dm-new-conversation-item');
            return items;
        }

        // Fallback selectors — TikTok periodically renames data-e2e values
        var fallbacks = [
            "[data-e2e*='chat-list-item']",
            "[data-e2e*='chat-item']"
        ];
        for (var i = 0; i < fallbacks.length; i++) {
            try {
                items = document.querySelectorAll(fallbacks[i]);
                if (items.length > 0) {
                    log('[FIND] Found ' + items.length + ' items via fallback: ' + fallbacks[i]);
                    return items;
                }
            } catch (e) { }
        }

        log('[FIND] WARNING: No chat items found with any selector');
        return [];
    };

    var findChatListContainer = function () {
        if (chatItems.length > 0) {
            var parent = chatItems[0].parentElement;
            while (parent && parent !== document.body) {
                if (parent.scrollHeight > parent.clientHeight + 10) {
                    return parent;
                }
                parent = parent.parentElement;
            }
        }
        var candidates = document.querySelectorAll('[class*="ChatList"], [class*="chatList"], [class*="conversation-list"]');
        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i].scrollHeight > candidates[i].clientHeight + 10) {
                return candidates[i];
            }
        }
        return null;
    };

    // ── Scroll & Retry ───────────────────────────────────────────────────────

    var scrollAndRetry = function () {
        scrollAttempts++;
        if (scrollAttempts > maxScrollAttempts) {
            log('[SCROLL] Max scroll attempts reached (' + maxScrollAttempts + ')');
            reportError('User not found in chat list');
            return;
        }
        var container = findChatListContainer();
        if (!container) {
            log('[SCROLL] No scrollable chat container found');
            reportError('User not found in chat list');
            return;
        }
        var prevScrollTop = container.scrollTop;
        var prevCount = chatItems.length;
        // Scroll by one viewport height, not to the bottom — TikTok's virtualized
        // list recycles DOM nodes and jumping to scrollHeight skips conversations.
        container.scrollTop += container.clientHeight * 3;
        log('[SCROLL] Scrolling chat list (attempt ' + scrollAttempts + '/' + maxScrollAttempts + ', scrolling by ' + (container.clientHeight * 3) + 'px)...');
        setTimeout(function () {
            chatItems = findChatItems();
            log('[SCROLL] After scroll: ' + chatItems.length + ' items, scrollTop: ' + container.scrollTop + ' (was ' + prevScrollTop + ')');

            if (container.scrollTop <= prevScrollTop) {
                log('[SCROLL] Scroll did not move — end of list');
                reportError('User not found in chat list');
                return;
            }

            // After scrolling, clicking items near the top scrolls the sidebar
            // back up, undoing our scroll. Only check items from the lower portion
            // of the list where new content from the scroll appears.
            // Use max(0, prevCount - 5) to catch a few overlapping items for safety.
            var startFrom = Math.max(0, prevCount - 15);
            newItemsFound = 0;
            log('[SCROLL] Scanning from item ' + (startFrom + 1) + '/' + chatItems.length + ' (known: ' + Object.keys(checkedUsernames).length + ' users)');
            chatIndex = startFrom;
            checkNextChat();
        }, 2000);
    };

    // ── Username Detection ───────────────────────────────────────────────────

    var findCurrentChatUsername = function () {
        var chatHeader = document.querySelector('[data-e2e="chat-header"]') ||
            document.querySelector('[class*="ChatHeader"]') ||
            document.querySelector('[class*="chatHeader"]') ||
            document.querySelector('[class*="DivChatHeader"]');

        if (chatHeader) {
            var headerLink = chatHeader.querySelector('a[href*="/@"]');
            if (headerLink) {
                var href = headerLink.getAttribute('href') || '';
                var match = href.match(/\/@([^\/]+)/);
                return match ? match[1] : '';
            }
            log('[HEADER] ChatHeader found but no a[href*="/@"] link inside it');
        } else {
            log('[HEADER] No ChatHeader element found on page');
        }

        // Fallback: any profile link in the chat panel area
        var links = document.querySelectorAll('[class*="StyledLink"]');
        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            var parent = link.closest('[data-e2e]');
            var parentAttr = parent ? parent.getAttribute('data-e2e') : '';

            if (!parentAttr || parentAttr === 'chat-header') {
                var href = link.getAttribute('href') || '';
                var match = href.match(/\/@([^\/]+)/);
                if (match && match[1]) {
                    return match[1];
                }
            }
        }

        // Last resort: any a[href*="/@"] in the chat panel (right side), not in nav or chat list
        var allProfileLinks = document.querySelectorAll('a[href*="/@"]');
        for (var j = 0; j < allProfileLinks.length; j++) {
            var pLink = allProfileLinks[j];
            // Skip links inside the chat list sidebar
            if (pLink.closest('[data-e2e*="conversation-item"]') || pLink.closest('[data-e2e*="chat-list"]') || pLink.closest('[data-e2e*="dm-new-conversation"]')) continue;
            // Skip links in the nav bar (these are the logged-in user's own profile)
            if (pLink.closest('[data-e2e*="nav-"]') || pLink.closest('[data-e2e="profile-icon"]') || pLink.closest('nav')) continue;
            var href = pLink.getAttribute('href') || '';
            var match = href.match(/\/@([^\/]+)/);
            if (match && match[1]) {
                log('[HEADER] Found username via last-resort profile link: ' + match[1]);
                return match[1];
            }
        }

        return '';
    };

    var isTargetUser = function (currentName) {
        if (!currentName || !userName) return false;
        if (isGroup) {
            // Substring match for group names (may contain emoji/extra text)
            return currentName.toLowerCase().trim().indexOf(userName.toLowerCase().trim()) !== -1;
        }
        return currentName.toLowerCase().trim() === userName.toLowerCase().trim();
    };

    // Get the header text for group matching (no profile link needed)
    var findCurrentChatName = function () {
        var header = document.querySelector('[data-e2e="chat-header"]') ||
            document.querySelector('[class*="ChatHeader"]') ||
            document.querySelector('[class*="chatHeader"]') ||
            document.querySelector('[class*="DivChatHeader"]');
        if (!header) {
            log('[HEADER] No chat header found');
            return '';
        }

        var headerText = (header.textContent || '').trim();
        var profileLink = header.querySelector('a[href*="/@"]');
        
        // Group-specific markers from detect_groups.js
        var hasGroupClass = !!header.querySelector('[class*="group"], [class*="Group"], [class*="member"], [class*="Member"]');
        var memberMatch = headerText.match(/(\d+)\s*member/i);
        var avatars = header.querySelectorAll('img');

        log('[HEADER] Detect: profileLink=' + !!profileLink + ', groupClass=' + hasGroupClass + ', memberMatch=' + !!memberMatch + ', avatars=' + avatars.length);

        if (profileLink) {
            log('[HEADER] Detected as DM (has profile link)');
            return '';
        }

        if (hasGroupClass || memberMatch || avatars.length > 1) {
            log('[HEADER] Detected as GROUP via markers: "' + headerText.substring(0, 30) + '"');
            return headerText;
        }

        // Conservative fallback: if there is NO profile link, we treat it as a potential group
        log('[HEADER] Treating as potential group (no profile link): "' + headerText.substring(0, 30) + '"');
        return headerText;
    };

    // ── Message Input & Sending ──────────────────────────────────────────────

    var findMessageInput = function () {
        var editor = document.querySelector('[class*="DraftEditor-editorContainer"] [contenteditable="true"]') ||
            document.querySelector('[class*="DraftEditor-root"] [contenteditable="true"]') ||
            document.querySelector('div[contenteditable="true"][role="textbox"]') ||
            document.querySelector('div[contenteditable="true"]');

        return editor;
    };

    var findDraftEditor = function (messageInput) {
        var key = Object.keys(messageInput).find(function (k) {
            return k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$');
        });

        if (!key) {
            log('[DRAFT] React fiber not found on input element');
            return null;
        }

        log('[DRAFT] Found React fiber key: ' + key.substring(0, 20) + '...');
        var fiber = messageInput[key];
        var current = fiber;
        var depth = 0;

        while (current) {
            depth++;
            if (current.stateNode && current.stateNode.editor) {
                log('[DRAFT] Found Draft.js editor at fiber depth ' + depth);
                return current.stateNode;
            }
            current = current.return;
        }

        log('[DRAFT] Draft editor instance not found (walked ' + depth + ' fiber nodes)');
        return null;
    };

    var typeMessage = function (messageInput, callback) {
        log('[TYPE] Starting typeMessage...');

        var draftEditor = findDraftEditor(messageInput);

        if (draftEditor) {
            log('[TYPE] Using Draft.js _onPaste method');

            draftEditor.focus();

            setTimeout(function () {
                var dataTransfer = new DataTransfer();
                dataTransfer.setData('text/plain', message);

                var pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: dataTransfer
                });

                try {
                    draftEditor._onPaste(pasteEvent);
                    log('[TYPE] _onPaste called successfully');
                } catch (e) {
                    log('[TYPE] _onPaste error: ' + e.message);
                }

                setTimeout(function () {
                    var content = messageInput.textContent || '';
                    log('[TYPE] Content after _onPaste: "' + content.substring(0, 50) + '" (len=' + content.length + ')');
                    callback();
                }, 300);
            }, 200);
        } else {
            log('[TYPE] Draft.js not found, falling back to execCommand');

            messageInput.click();
            messageInput.focus();

            setTimeout(function () {
                var selection = window.getSelection();
                var range = document.createRange();
                range.selectNodeContents(messageInput);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);

                document.execCommand('insertText', false, message);
                var content = messageInput.textContent || '';
                log('[TYPE] Content after execCommand: "' + content.substring(0, 50) + '" (len=' + content.length + ')');

                setTimeout(callback, 300);
            }, 200);
        }
    };

    var normalizeMessageText = function (value) {
        return String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
    };

    var countRenderedMessageMatches = function () {
        var wanted = normalizeMessageText(message);
        if (!wanted) return 0;
        var nodes = document.querySelectorAll('p, span, [data-e2e*="message-text"], [data-e2e*="msg-text"], [class*="MessageText"], [class*="message-text"], [class*="Bubble"], [class*="bubble"]');
        var count = 0;
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (el.closest('[contenteditable], [data-e2e*="conversation-item"], [data-e2e*="chat-list"], nav, [role="navigation"]')) continue;
            if (normalizeMessageText(el.textContent) !== wanted) continue;
            var descendants = el.querySelectorAll('span, p, [data-e2e*="message-text"], [class*="Bubble"], [class*="bubble"]');
            var innerSame = false;
            for (var j = 0; j < descendants.length; j++) {
                if (normalizeMessageText(descendants[j].textContent) === wanted) {
                    innerSame = true;
                    break;
                }
            }
            if (!innerSame) count++;
        }
        return count;
    };

    var findSendButton = function (messageInput) {
        var selector = '[data-e2e*="send"], button[type="submit"], button[aria-label*="send" i], [role="button"][aria-label*="send" i]';
        var container = messageInput.parentElement;
        for (var depth = 0; container && depth < 7; depth++, container = container.parentElement) {
            var buttons = container.querySelectorAll(selector);
            for (var i = 0; i < buttons.length; i++) {
                var button = buttons[i];
                if (button === messageInput || button.closest('[contenteditable]')) continue;
                if (button.disabled || button.getAttribute('aria-disabled') === 'true') continue;
                if (button.getClientRects().length === 0) continue;
                return button;
            }
        }
        return null;
    };

    var sendMessage = function (messageInput) {
        var sendBtn = findSendButton(messageInput);
        if (sendBtn) {
            log('[SEND] Clicking visible send control: ' + (sendBtn.getAttribute('data-e2e') || sendBtn.tagName));
            sendBtn.click();
            return;
        }

        log('[SEND] No usable send control found; trying Enter');
        messageInput.focus();
        messageInput.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
        }));
        messageInput.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
        }));
    };

    var reportSuccess = function () {
        log('[RESULT] CONFIRMED IN CHAT — New message appeared for ' + userName);
        if (typeof StreakApp !== 'undefined') {
            StreakApp.onMessageSent(userName, true, '');
        }
    };

    var reportError = function (errorMessage) {
        log('[RESULT] FAIL — ' + errorMessage);
        if (typeof StreakApp !== 'undefined') {
            StreakApp.onMessageSent(userName, false, errorMessage);
        }
    };

    var verifySend = function (messageInput, baseline) {
        var checks = 0;
        var maxChecks = 20;
        var check = function () {
            checks++;
            var emptied = normalizeMessageText(messageInput.textContent) === '';
            var shownInChat = countRenderedMessageMatches() > baseline;
            if (emptied && shownInChat) {
                reportSuccess();
                return;
            }
            if (checks >= maxChecks) {
                log('[VERIFY] No confirmed new message: editorEmpty=' + emptied + ', rendered=' + shownInChat);
                reportError('Send not confirmed; check TikTok before retrying');
                return;
            }
            setTimeout(check, 500);
        };
        setTimeout(check, 500);
    };

    // ── Chat Processing ──────────────────────────────────────────────────────

    var sendMessageViaButton = function () {
        var messageInput = findMessageInput();

        if (!messageInput) {
            log('[CHAT] Message input NOT found on page');
            reportError('Message input not found');
            return;
        }

        log('[CHAT] Found message input, typing...');
        typeMessage(messageInput, function () {
            var expected = normalizeMessageText(message);
            var actual = normalizeMessageText(messageInput.textContent);
            if (!expected || actual !== expected) {
                log('[TYPE] Message content did not match expected text (expected length ' + expected.length + ', actual length ' + actual.length + ')');
                reportError('Message was not correctly entered in the editor');
                return;
            }

            var baseline = countRenderedMessageMatches();
            try {
                sendMessage(messageInput);
                verifySend(messageInput, baseline);
            } catch (e) {
                reportError('Send control failed: ' + e.message);
            }
        });
    };

    var searchForUserInCurrentChat = function () {
        var currentName;
        if (isGroup) {
            currentName = findCurrentChatName();
            log('[CHAT] Current chat: "' + (currentName || '(DM)').substring(0, 50) + '" (group target: "' + userName + '")');
        } else {
            currentName = findCurrentChatUsername();
            log('[CHAT] Current chat username: "' + currentName + '" (target: "' + userName + '")');
        }

        if (currentName) {
            checkedUsernames[currentName.toLowerCase()] = true;
        }

        if (isTargetUser(currentName)) {
            found = true;
            log('[CHAT] MATCH — Found ' + (isGroup ? 'group' : 'target user'));
            sendMessageViaButton();
            return true;
        }

        return false;
    };

    var checkNextChat = function () {
        if (found || chatIndex >= chatItems.length) {
            if (!found) {
                log('[CHAT] Exhausted ' + chatItems.length + ' visible items (' + newItemsFound + ' new), trying scroll...');
                scrollAndRetry();
            }
            return;
        }

        var chatItem = chatItems[chatIndex];

        // Optimization: Detect type from list item before clicking to avoid unnecessary loads
        var itemAvatars = chatItem.querySelectorAll('img');
        var itemLinks = chatItem.querySelectorAll('a[href*="/@"]');

        if (isGroup) {
            // If searching for a group, but the list item has a clear profile link, it's a DM
            if (itemLinks.length > 0) {
                log('[CHAT] Item ' + (chatIndex + 1) + ' has profile link, skipping DM...');
                chatIndex++;
                setTimeout(checkNextChat, 10);
                return;
            }
        } else {
            // DM mode only pre-click optimization
            for (var i = 0; i < itemLinks.length; i++) {
                var href = itemLinks[i].getAttribute('href') || '';
                var match = href.match(/\/@([^\/]+)/);
                if (match && match[1]) {
                    var inlineUsername = match[1].toLowerCase().trim();
                    if (checkedUsernames[inlineUsername]) {
                        chatIndex++;
                        setTimeout(checkNextChat, 10);
                        return;
                    }
                    if (isTargetUser(match[1])) {
                        log('[CHAT] MATCH — Found @' + match[1] + ' in item ' + (chatIndex + 1) + ' (pre-click)');
                        chatItem.click();
                        found = true;
                        setTimeout(function () {
                            var actualChat = findCurrentChatUsername();
                            if (!isTargetUser(actualChat)) {
                                reportError('Chat did not open for the selected user');
                                return;
                            }
                            sendMessageViaButton();
                        }, 1500);
                        return;
                    }
                    break;
                }
            }
        }

        log('[CHAT] Clicking item ' + (chatIndex + 1) + '/' + chatItems.length);
        chatItem.click();

        setTimeout(function () {
            var currentName;
            if (isGroup) {
                // Group mode: get header text, skip DMs (which have profile links)
                currentName = findCurrentChatName();
                if (currentName) {
                    log('[CHAT] Current chat: "' + currentName.substring(0, 50) + '" (group target: "' + userName + '")');
                } else {
                    // Has a profile link — this is a DM, skip it
                    var dmUser = findCurrentChatUsername();
                    log('[CHAT] Skipping DM: @' + dmUser);
                    if (dmUser) checkedUsernames[dmUser.toLowerCase()] = true;
                    chatIndex++;
                    checkNextChat();
                    return;
                }
            } else {
                // DM mode: get username from header
                currentName = findCurrentChatUsername();
                log('[CHAT] Current chat username: "' + currentName + '" (target: "' + userName + '")');
            }

            var nameKey = currentName ? currentName.toLowerCase().trim() : '';

            if (nameKey && checkedUsernames[nameKey]) {
                chatIndex++;
                checkNextChat();
                return;
            }

            if (nameKey) {
                checkedUsernames[nameKey] = true;
                newItemsFound++;
            }

            if (isTargetUser(currentName)) {
                found = true;
                log('[CHAT] MATCH — Found ' + (isGroup ? 'group' : 'target user') + ': "' + currentName + '"');
                sendMessageViaButton();
                return;
            }

            chatIndex++;
            checkNextChat();
        }, 1500);
    };

    // ── Initialization with Checkpoint Retries ───────────────────────────────

    var init = function () {
        try {
            if (userName.startsWith('@')) {
                userName = userName.substring(1);
            }

            log('[INIT] Starting automation initialization...');
            dumpEnvironment();
            log('[INIT] Target user: ' + userName);

            // Pre-check: if the target chat is already open (e.g. when re-injecting between friends)
            var preCheckName = isGroup ? findCurrentChatName() : findCurrentChatUsername();
            if (preCheckName && isTargetUser(preCheckName)) {
                log('[INIT] Target ' + (isGroup ? 'group' : 'chat') + ' already open: ' + preCheckName);
                found = true;
                setTimeout(sendMessageViaButton, 500);
                return;
            }

            log('[INIT] Waiting 3s for page stabilization...');
            setTimeout(function () {
                // ── Checkpoint: 3 seconds ──
                log('[CHECKPOINT-3S] Checking for chat items (attempt 1)...');
                chatItems = findChatItems();
                log('[CHECKPOINT-3S] Found ' + chatItems.length + ' chat items');

                if (chatItems.length > 0) {
                    log('[CHECKPOINT-3S] Items found, starting chat scan');
                    checkNextChat();
                    return;
                }

                // Zero items — run diagnostics and retry
                log('[CHECKPOINT-3S] Zero items found, running full diagnostics...');
                dumpFullDiagnostics();
                log('[CHECKPOINT-3S] Scheduling retry in 5 more seconds...');

                setTimeout(function () {
                    // ── Checkpoint: 8 seconds total ──
                    log('[CHECKPOINT-8S] Checking for chat items (attempt 2 after 8s total)...');
                    chatItems = findChatItems();
                    log('[CHECKPOINT-8S] Found ' + chatItems.length + ' chat items');

                    if (chatItems.length > 0) {
                        log('[CHECKPOINT-8S] Items found on retry, starting chat scan');
                        checkNextChat();
                        return;
                    }

                    log('[CHECKPOINT-8S] Still zero items after 8s, running full diagnostics again...');
                    dumpFullDiagnostics();
                    log('[CHECKPOINT-8S] Giving up - reporting error');
                    reportError('No chat items found after 8s wait');

                }, 5000);

            }, 3000);

        } catch (e) {
            log('[INIT] EXCEPTION: ' + e.message);
            reportError('Error: ' + e.message);
        }
    };

    // Start the automation
    init();
})();