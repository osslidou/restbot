// nodejs base
var fs = require("fs");
var util = require('util');
var path = require('path');
var url = require("url");
var childProcess = require('child_process');
var os = require("os");

// requires npm install
var express = require('express');
var uuid = require('node-uuid');
var bodyParser = require('body-parser');

const CHROMINIUM_VERSION = 558500;
const MAX_FOLDER_DELETE_RETRIES = 20;
const REQUEST_TIMEOUT_IN_MS = 1800000; // 30mins

module.exports = {
    start: async function (port, serverData, callback) {

        var { browserFullPath, browserUserDataFolder } = await downloadAndUnzipChrominiumIfNeededSync();

        var app = express();

        const server = app.listen(port, function () {
            console.log(`Restbot: http://localhost:${port}\nCache: ${browserUserDataFolder}\n`);
            callback(this);
        });
        server.timeout = REQUEST_TIMEOUT_IN_MS;

        app.use(bodyParser.json()); // for parsing application/json
        app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

        app.use((req, res, next) => {
            // cross origin
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-timeout-in-sec", "x-throttle-requests-in-ms");
            res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");

            // no cache
            res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
            res.header('Expires', '-1');
            res.header('Pragma', 'no-cache');

            var throttleRequestInSecs = req.headers["x-throttle-requests-in-ms"];
            if (throttleRequestInSecs) {
                setTimeout(() => {
                    next();
                }, throttleRequestInSecs);
            }
            else
                next();
        });

        app.get('/', (req, res) => {
            // returns array of active browserIds
            var allBrowsers = getOpenedBrowsersList();
            res.send(allBrowsers);
            console.log('[*] list');
        });

        app.delete('/', (req, res) => {
            // close/delete all opened browser
            var allBrowsers = getOpenedBrowsersList();
            for (let browserId of allBrowsers)
                deleteBrowser(browserId)

            attemptToDeleteFolderRecursive(browserUserDataFolder, MAX_FOLDER_DELETE_RETRIES, (httpCode) => {
                res.sendStatus(httpCode);
            });
        })

        app.use('/:id*', (req, res, next) => {
            // browserId middleware: 
            // 1. gets and stores: browserId and its associated socket, 
            // 2. creates the socketData object, 
            // 3. stores res object to be later used by (ie responded) the websocket server
            // 4. ensure that the browser socket exists

            if (req.method == "OPTIONS") { // deals with firefox
                res.json('verb not supported')
                return; /* breaks the chain: do not call next() */
            }

            req.browserId = req.params.id;
            req.socket = serverData.getSocket(req.browserId);

            var socketData = req.body; /* this will copy any extra field into the socket data - including body.value */
            req.socketData = socketData;
            socketData.requestId = uuid.v1();
            serverData.setPendingRequest(socketData.requestId, res);
            socketData.params = [];
            var decodedUri = url.parse(decodeURI(req.originalUrl));
            if (decodedUri.query) {
                var queryArgs = decodedUri.query.split('&');
                socketData.cmd = queryArgs[0];
                socketData.params = queryArgs.slice(1);
            }

            var isBrowserCreation = req.method === 'PUT' && (!req.params[0]);

            if (!isBrowserCreation) {
                // then browser needs to exist with a connected socket
                var message;
                if (!req.socket)
                    message = "Browser not found: " + req.browserId;;

                if (req.socket && !req.socket.connected)
                    message = "Browser disconnected: " + req.browserId;

                if (message) {
                    handleRequestError(req, 404, message);
                    return;
                }
            }

            next();
        });

        app.put('/:id', (req) => {
            // creates a new browser instance, defaults to chrome
            req.socketData.type = req.socketData.type || 'chrome';
            if (req.socketData.type !== 'chrome') {
                var message = "unsupported browser type: " + req.socketData.type;
                handleRequestError(req, 415, message);
                return;
            }

            req.socketData.autoOpenDeveloperTools = req.socketData.autoOpenDeveloperTools || false;

            if (serverData.hasBrowserSocket(req.browserId)) {
                var message = "browser " + req.browserId + " already running";
                handleRequestError(req, 409, message);
                return;
            }

            var sessionDataPath = path.resolve(browserUserDataFolder, req.browserId);
            var extensionPath = path.resolve(__dirname, 'chrome_extension');
            var titleExtensionPath = path.resolve(__dirname, '../', 'chromeTitle/chrome_extension');

            if (fs.existsSync(titleExtensionPath))
                extensionPath = extensionPath + "," + titleExtensionPath

            var spawn = childProcess.spawn;
            var startupArgs = ["--no-default-browser-check", "--no-first-run", "--test-type", "--ignore-certificate-errors",
                "--user-agent=\"Mozilla/5.0 (Windows NT 10.0; Win64; x64; [restbot]) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36\"",
                "--disable-popup-blocking", "--disable-default-apps", "--no-first-run", "--extensions-on-chrome-urls", "--user-data-dir=" + sessionDataPath,
                "--load-extension=" + extensionPath, "about:blank"];

            if (req.socketData.autoOpenDeveloperTools) {
                startupArgs.push("--auto-open-devtools-for-tabs");
            }

            if (req.socketData.lang) {
                startupArgs.push(`--lang=${req.socketData.lang}`);
            }

            var browser = spawn(browserFullPath, startupArgs);
            serverData.setBrowser(req.browserId, browser);

            logCommand(req.browserId, { cmd: 'start' })
        });

        app.delete('/:id', (req) => {
            deleteBrowser(req.browserId, req.socketData)
        });

        app.use('/:id/url', (req, res, next) => {
            // gets/sets the browser's url
            switch (req.method) {
                case "GET": req.socketData.cmd = "get_url"; break;
                case "PUT": req.socketData.cmd = "set_url"; break;
            }
            next();
        });

        app.use('/:id/views*', (req, res, next) => {
            // accesses the browser's views
            let hasTabParam = req.params[0];

            switch (req.method) {
                case "GET":
                    req.socketData.cmd = "get_views_info";
                    break;

                case "DELETE":
                    if (hasTabParam)
                        req.socketData.cmd = "close_view";
                    else
                        req.socketData.cmd = "close_active_view";
                    break;

                case "PUT":
                    if (hasTabParam)
                        req.socketData.cmd = "set_active_view";
                    else
                        req.socketData.cmd = "set_views_info";
                    break;
            }

            if (hasTabParam)
                req.socketData.tabId = parseInt(req.params[0].substring(1));

            next();
        });

        app.use('/:id/errors', (req, res, next) => {
            // accesses the browser's errors
            switch (req.method) {
                case "GET": req.socketData.cmd = "get_errors"; break;
                case "DELETE": req.socketData.cmd = "clear_errors"; break;
            }
            next();
        });

        app.use('/:id/cookies*', (req, res, next) => {
            // access to browser cookies
            switch (req.method) {
                case "GET": req.socketData.cmd = "get_cookie"; break;
                case "PUT": req.socketData.cmd = "set_cookie"; break;
                case "DELETE": req.socketData.cmd = "remove_cookie"; break;
            }

            if (req.params[0])
                req.socketData.cookieName = req.params[0].substring(1);

            next();
        });

        app.use('/:id/doc*', (req, res, next) => {
            // interacts with the browser's html doc
            var timeOutInSeconds = req.headers["x-timeout-in-sec"];
            var expiry = new Date();
            if (timeOutInSeconds)
                expiry.setTime(expiry.getTime() + timeOutInSeconds * 1000);

            var socketData = req.socketData;
            socketData.requestExpiry = expiry.toString();

            var uri = url.parse(req.originalUrl);

            if (req.params[0]) {
                var encodedParams = encodeURI(req.params[0]);
                var fragments = uri.pathname.substring(uri.pathname.indexOf(encodedParams));
                socketData.path = decodeURI(fragments);
            }
            else
                socketData.path = '';

            if (!socketData.cmd) {
                var message = `no action provided in path ${socketData.path}`;
                handleRequestError(req, 400, message);
                return;
            }

            next();
        });

        app.use('/:id*', (req, res, next) => {
            // common to all previous methods: log & emit
            var socketData = req.socketData;
            logCommand(req.browserId, socketData);

            if (socketData.cmd === 'sleep') {
                setTimeout(() => {
                    res.writeHead(200);
                    res.end();
                    serverData.deletePendingRequest(socketData.requestId);
                }, (socketData.value * 1000))
            } else
                req.socket.emit('cmd', socketData);
        });

        function deleteBrowser(browserId, socketData) {
            var browser = serverData.getBrowser(browserId);

            if (socketData) {
                var requestId = socketData.requestId;
                var res = serverData.getPendingRequest(requestId);
                // delete from the maps first, because we capture un-expected socket disconnect
                serverData.deletePendingRequest(requestId);
                socketData.cmd = "kill";
                logCommand(browserId, socketData);

                browser.on('close', (code) => {
                    // wait til process is actually closed to return 200
                    if (socketData.cleanupSessionData) {
                        var sessionDataPath = path.resolve(browserUserDataFolder, browserId);
                        attemptToDeleteFolderRecursive(sessionDataPath, MAX_FOLDER_DELETE_RETRIES, (httpCode) => {
                            res.writeHead(httpCode);
                            res.end();
                        });
                    } else {
                        res.writeHead(200);
                        res.end();
                    }
                });
            }

            serverData.purgeBrowserData(browserId);

            //todo: use OS-prefered way to stop the process without force-killing it: issue where chrome does not write session data (browser.kill does not give chrome enough time to stop on windows
            var spawn = childProcess.spawn;
            var startupArgs = ["/pid", browser.pid, "/f"];
            //var startupArgs = ["/pid", browser.pid];
            spawn("taskkill", startupArgs)
        }

        function getOpenedBrowsersList() {
            var result = [];
            for (let [browserId, socket] of serverData.socketsByBrowser)
                result.push(browserId);
            return result;
        }

        function logCommand(browserId, socketData) {
            var logEntryText = '[' + browserId.substr(0, 5) + '] ' + socketData.cmd;

            if (socketData.path !== undefined)
                logEntryText += ' ' + socketData.path;

            if (socketData.value !== undefined)
                logEntryText += ' { ' + util.inspect(socketData.value) + ' }';

            console.log(logEntryText);
        }

        function handleRequestError(req, code, message) {
            console.log("[" + code + "]", message);

            var res = serverData.getPendingRequest(req.socketData.requestId);
            res.status(code).json(message);
            serverData.deletePendingRequest(req.socketData.requestId);
        }

        function dumpObjectToDisk(obj, filename) {
            var toString = util.inspect(obj, false, null);
            fs.writeFile(filename, toString, (err) => {
                if (err) {
                    return console.log(err);
                }
                console.log("dumpObjectToDisk to '" + filename + "' completed");
            });
        }

        function deleteFolderRecursive(path) {
            if (fs.existsSync(path)) {
                fs.readdirSync(path).forEach((file) => {
                    var curPath = path + "/" + file;
                    if (fs.statSync(curPath).isDirectory())
                        deleteFolderRecursive(curPath);
                    else
                        fs.unlinkSync(curPath);
                });
                fs.rmdirSync(path);
            }
        }

        function attemptToDeleteFolderRecursive(folder, tries, callback) {
            try {
                deleteFolderRecursive(folder);
                callback(204);
            } catch (err) {
                if (tries > 0) {
                    setTimeout(() => {
                        console.log(`-- retrying to purge '${folder}' - remainting attempts=${tries}`)
                        attemptToDeleteFolderRecursive(folder, --tries, callback);
                    }, (500));
                } else {
                    callback(500);
                }
            }
        }

        async function downloadAndUnzipChrominiumIfNeededSync() {
            if (os.platform() !== 'win32') {
                throw new Error('OS not supported - platform = ' + os.platform());
            }

            var chrominiumFolder = `chrominium.v${CHROMINIUM_VERSION}`;
            var browserFullPath = `${chrominiumFolder}\\chrome.exe`;
            var browserUserDataFolder = path.join(os.tmpdir(), 'restbot_cache'); // mac: process.env.TMPDIR + "/google_data/restbot";

            const downloadAndUnzip = function () {
                return new Promise(function (resolve) {
                    const chrominiumPath = `https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Win_x64%2F${CHROMINIUM_VERSION}%2Fchrome-win32.zip?generation=1526340286819675&alt=media`;
                    //const chrominiumPath = 'http://localhost:8082/chrome.win32.zip';
                    const downloadFilePath = 'tmp_chrome.win32.zip';

                    var http = require('http'),
                        fse = require('fs-extra'),
                        request = require('request'),
                        AdmZip = require('adm-zip'),
                        uuid = require('node-uuid'),
                        out = fs.createWriteStream(downloadFilePath, { autoClose: false });

                    console.log(`-- downloading chrominium v${CHROMINIUM_VERSION}...`);
                    var req = request({ method: 'GET', uri: chrominiumPath });
                    req.pipe(out);
                    req.on('end', function () {
                        fs.close(out.fd, async function () {
                            await checkExistsWithTimeout('chrome.win32.zip', 2000);
                            var archive = new AdmZip("chrome.win32.zip");
                            var path = require('path');
                            var tmpPath = path.join(os.tmpdir(), uuid.v1());
                            console.log(`-- extracting to: ${tmpPath}`);
                            archive.extractAllTo(tmpPath);
                            console.log('-- moving/cleaning up...');
                            fse.moveSync(path.join(tmpPath, 'chrome-win32'), chrominiumFolder, { overwrite: true });
                            fs.unlinkSync(downloadFilePath);
                            console.log('-- done!');
                            resolve();
                        });
                    });
                });
            }

            if (!fs.existsSync(browserFullPath)) {
                await downloadAndUnzip();
            }

            return { browserFullPath, browserUserDataFolder }
        }

        function checkExistsWithTimeout(path, timeout) {
            return new Promise((resolve, reject) => {
                const timeoutTimerId = setTimeout(handleTimeout, timeout)
                const interval = timeout / 6
                let intervalTimerId

                function handleTimeout() {
                    clearTimeout(timerId)
                    const error = new Error('path check timed out')
                    error.name = 'PATH_CHECK_TIMED_OUT'
                    reject(error)
                }

                function handleInterval() {
                    fs.access(path, (err) => {
                        if (err) {
                            intervalTimerId = setTimeout(handleInterval, interval)
                        } else {
                            clearTimeout(timeoutTimerId)
                            resolve(path)
                        }
                    })
                }

                intervalTimerId = setTimeout(handleInterval, interval)
            })
        }
    }
}