// nodejs base
var fs = require("fs");
var util = require('util');
var path = require('path');
var url = require("url");
var childProcess = require('child_process');

// requires npm install
var express = require('express');
var uuid = require('node-uuid');
var bodyParser = require('body-parser');

var deleteFolderRecursive = function (path) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function (file) {
            var curPath = path + "/" + file;
            if (fs.statSync(curPath).isDirectory())
                deleteFolderRecursive(curPath);
            else
                fs.unlinkSync(curPath);
        });
        fs.rmdirSync(path);
    }
}

module.exports = {
    start: function (port, browserPath, browserUserDataFolder, serverData, callback) {
        var app = express();
        app.listen(port, function () {
            console.log("restbot running at http://localhost:" + port + "/\n");
            callback(this);
        });

        app.use(bodyParser.json()); // for parsing application/json
        app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

        app.use(function (req, res, next) {
            // cross origin
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-timeout-in-sec");
            res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");

            // no cache
            res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
            res.header('Expires', '-1');
            res.header('Pragma', 'no-cache');

            next();
        });

        app.get('/', function (req, res) {
            // returns array of active browserIds
            var result = [];
            for (let [browserId, socket] of serverData.socketsByBrowser)
                result.push(browserId);

            res.send(result);

            console.log('[*] list');
        });

        app.use('/:id*', function (req, res, next) {
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

        app.put('/:id', function (req) {
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
                "--disable-popup-blocking", "--extensions-on-chrome-urls", "--user-data-dir=" + sessionDataPath,
                "--load-extension=" + extensionPath, "about:blank"];

            if (req.socketData.autoOpenDeveloperTools) {
                startupArgs.push("--auto-open-devtools-for-tabs");
            }

            var browser = spawn(browserPath, startupArgs);
            serverData.setBrowser(req.browserId, browser);

            logCommand(req.browserId, { cmd: 'start' })
        });

        app.delete('/:id', function (req) {
            var socketData = req.socketData;
            var browserId = req.browserId;
            var requestId = socketData.requestId;
            var browser = serverData.getBrowser(browserId);
            var res = serverData.getPendingRequest(requestId);

            socketData.cmd = "kill";
            logCommand(req.browserId, socketData);

            // delete from the maps first, because we capture un-expected socket disconnect
            serverData.deletePendingRequest(requestId);
            serverData.purgeBrowserData(browserId);

            browser.on('close', function (code) {
                // wait til process is actually closed to return 200
                res.writeHead(200);
                res.end();

                if (socketData.deleteSessionData) {
                    var sessionDataPath = path.resolve(browserUserDataFolder, req.browserId);
                    console.log('Cleaning up sessionData "' + sessionDataPath + '"');
                    deleteFolderRecursive(sessionDataPath);
                }
            });

            //todo: use OS-prefered way to stop the process without force-killing it: issue where chrome does not write session data (browser.kill does not give chrome enough time to stop on windows
            var spawn = childProcess.spawn;
            //var startupArgs = ["/pid", browser.pid, "/f"];
            var startupArgs = ["/pid", browser.pid];
            spawn("taskkill", startupArgs)
        });

        app.use('/:id/url', function (req, res, next) {
            // gets/sets the browser's url
            switch (req.method) {
                case "GET": req.socketData.cmd = "get_url"; break;
                case "PUT": req.socketData.cmd = "set_url"; break;
            }
            next();
        });

        app.use('/:id/views*', function (req, res, next) {
            // accesses the browser's views
            switch (req.method) {
                case "GET": req.socketData.cmd = "get_views_info"; break;
                case "PUT": req.socketData.cmd = "set_active_view"; break;
                case "DELETE": req.socketData.cmd = "close_view"; break;
            }

            if (req.params[0])
                req.socketData.tabId = parseInt(req.params[0].substring(1));

            next();
        });

        app.use('/:id/errors', function (req, res, next) {
            // accesses the browser's errors
            switch (req.method) {
                case "GET": req.socketData.cmd = "get_errors"; break;
                case "DELETE": req.socketData.cmd = "clear_errors"; break;
            }
            next();
        });

        app.use('/:id/cookies*', function (req, res, next) {
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

        app.use('/:id/doc*', function (req, res, next) {
            // interacts with the browser's html doc
            var timeOutInSeconds = req.headers["x-timeout-in-sec"];
            var expiry = new Date();
            if (timeOutInSeconds)
                expiry.setTime(expiry.getTime() + timeOutInSeconds * 1000);

            var socketData = req.socketData;
            socketData.requestExpiry = expiry.toString();

            var decodedUri = url.parse(decodeURI(req.originalUrl));

            if (req.params[0])
                socketData.path = decodedUri.pathname.substring(decodedUri.pathname.indexOf(req.params[0]));
            else
                socketData.path = '';

            if (!socketData.cmd)
                socketData.cmd = 'get_value'; /* default value if nothing passed */

            next();
        });

        app.use('/:id*', function (req, res, next) {
            // common to all previous methods: log & emit
            var socketData = req.socketData;
            logCommand(req.browserId, socketData);

            if (socketData.cmd === 'sleep') {
                setTimeout(function () {
                    res.writeHead(200);
                    res.end();
                    serverData.deletePendingRequest(socketData.requestId);
                }, (socketData.value * 1000))
            } else
                req.socket.emit('cmd', socketData);
        });

        function logCommand(browserId, socketData) {
            var logEntryText = '[' + browserId.substr(0, 4) + '] ' + socketData.cmd;

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
            fs.writeFile(filename, toString, function (err) {
                if (err) {
                    return console.log(err);
                }
                console.log("dumpObjectToDisk to '" + filename + "' completed");
            });
        }
    },

    deleteFolderRecursive: deleteFolderRecursive
}