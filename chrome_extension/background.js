const APP_PORT = 8081;
var apiUrl = 'http://localhost:' + APP_PORT + '/';

var pageErrors = [];

chrome.tabs.onUpdated.addListener(injectDependenciesAfterPageLoaded);
chrome.runtime.onMessage.addListener(pageErrorsListener);

setupSocketClient(apiUrl);

function setupSocketClient(apiUrl) {
    console.log('Initializing websocket client ...');

    var socket = io.connect(apiUrl);

    socket.on('cmd', function (data) {
        console.log('cmd: ' + data.cmd);
        runActionInBrowser(socket, data);
    });

    // extension is started and ready - notify the server    
    socket.emit('chrome_ready');
}

function runActionInBrowser(socket, data) {
    switch (data.cmd) {
        case "get_views_info":
            var retval = [];
            chrome.windows.getAll({}, function (windows) {
                var remainingWindows = windows.length;

                windows.forEach(function (window) {
                    console.log('chrome.windows.getAll - wid=', window.id);

                    chrome.tabs.query({ windowId: window.id }, function (tabs) {
                        remainingWindows--;
                        tabs.forEach(function (tab) {
                            var viewInfo = {
                                id: tab.id, index: tab.index, isActive: tab.active, url: tab.url, title: tab.title,
                                windowId: window.id,
                                windowType: window.type
                            };
                            retval.push(viewInfo);
                        });

                        if (remainingWindows === 0) {
                            // we are done!
                            data.retVal = retval;
                            socket.emit('cmd_out', data);
                            console.log('--' + data.cmd + ' done:', data);
                        }
                    });
                });
            });

            break;

        case "set_active_view":
            chrome.tabs.update(data.tabId, { active: true }, function (tabs) {

                if (chrome.runtime.lastError) {
                    console.log('--' + data.cmd + ' error');
                    data.error_code = 500;
                    data.error_message = chrome.runtime.lastError.message;
                    socket.emit('cmd_out', data);
                    return;
                }

                socket.emit('cmd_out', data);
                console.log('--' + data.cmd + ' done:', data);
            });
            break;

        case "close_view":
            chrome.tabs.remove(data.tabId, function (tabs) {

                if (chrome.runtime.lastError) {
                    console.log('--' + data.cmd + ' error');
                    data.error_code = 500;
                    data.error_message = chrome.runtime.lastError.message;
                    socket.emit('cmd_out', data);
                    return;
                }

                socket.emit('cmd_out', data);
                console.log('--' + data.cmd + ' done:', data);
            });
            break;

        case "get_errors":
            data.retVal = pageErrors;
            socket.emit('cmd_out', data);
            console.log('--' + data.cmd + ' done:', data);
            break;

        case "clear_errors":
            pageErrors = [];
            socket.emit('cmd_out', data);
            console.log('--' + data.cmd + ' done:', data);
            break;

        case "pause":
            handlePause(socket, data);
            break;

        default:
            // runs all other actions in the current window & tab
            findActiveTabAndRunAction(socket, data);
    }
}

function handlePause(socket, data) {
    setExtensionIcon(true);
    chrome.browserAction.onClicked.addListener(function (tab) {
        socket.emit('cmd_out', data);
        setExtensionIcon();
    });
}

function findActiveTabAndRunAction(socket, data) {
    chrome.windows.getCurrent({}, function (window) {
        try {
            chrome.tabs.query({ active: true }, function (tabs) {
                tab = tabs[0]; // only work with the active tab - and there is only one active tab!             
                runActionInActivePage(socket, tab, data);
            });
        }
        catch (err) {
            console.log('-- ERROR: ' + err.message);
            data.error_code = 500;
            data.error_message = err.message;
            socket.emit('cmd_out', data);
        }
    });
}

function runActionInActivePage(socket, tab, data) {
    if (tab === undefined) {
        console.log('--' + data.cmd + ' error');
        data.error_code = 501;
        data.error_message = 'ERROR: Unable to find the active tab';
        socket.emit('cmd_out', data);
        return;
    }

    switch (data.cmd) {
        case "get_url":
            data.retVal = tab.url;
            socket.emit('cmd_out', data);
            console.log('--' + data.cmd + ' done');
            break;

        case "set_url":
            function tabUpdatedListener(tabId, changeInfo, tab) {
                console.log('--status=' + changeInfo.status + ' url=' + tab.url);
                if (changeInfo.status == 'complete' && tab.url !== 'about:blank') { /* timing issue where about:blank will be 'complete' before socket connection occurs before the about:blank tab is created*/
                    chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
                    socket.emit('cmd_out', data);
                    console.log('--' + data.cmd + ' done');
                }
            }

            chrome.tabs.onUpdated.addListener(tabUpdatedListener);

            // updates the url - response will be sent after the page load is complete - see above
            chrome.tabs.update(tab.id, { url: data.value });
            break;

        case "screenshot":
            chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 }, function (dataUrl) {
                data.retVal = dataUrl;
                socket.emit('cmd_out', data);
                console.log('--' + data.cmd + ' done');
            });
            break;

        default:
            sendMessageIntoTab(tab.id, data, function (response) {
                console.log('response:', JSON.stringify(response));

                if (response === undefined)
                    // try again, case when page moved
                    runActionInActivePage(socket, tab, data);

                else if (response.data.error_code)
                    console.log('error response received from page: ' + response.data.error_message);

                socket.emit('cmd_out', response.data);
                console.log('--' + data.cmd + ' done');
            });
            break;
    }
}

var dep_page = {};
var dep_jquery = {};

function injectDependenciesAfterPageLoaded(tabId, changeInfo, tab) {
    if (tab.url.startsWith("chrome://"))
        return;

    if (changeInfo.status === "loading") {
        chrome.tabs.executeScript(tabId, { file: "jquery-2.1.4.min.js" }, function () {
            dep_jquery[tabId] = tab.url;
            chrome.tabs.executeScript(tabId, { file: "page.js" }, function () {
                dep_page[tabId] = tab.url;
            });
        });
    }
}

// sends the message into the page - only after having checked that the dependencies are injected
function sendMessageIntoTab(tabId, data, callback) {
    chrome.tabs.get(tabId, function (tab) {
        if (dep_jquery[tabId] === tab.url && dep_page[tabId] === tab.url) {
            chrome.tabs.sendMessage(tabId, { data: data }, function (response) {
                callback(response);
            });
        }
        else
            setTimeout(function () {
                console.log('___ delay restart send message');
                sendMessageIntoTab(tabId, data, callback);
            }, 50);
    });
}

function pageErrorsListener(request) {
    if (request.cmd === 'page_error') {
        console.log('errorData:', request.data);
        pageErrors.push(request.data);
    }
}

function setExtensionIcon(isPauseIcon) {
    let iconPath = 'default.png';
    if (isPauseIcon)
        iconPath = 'play4.png';

    chrome.browserAction.setIcon({ path: iconPath });
}
