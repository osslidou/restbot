const querystring = require('querystring');
const http = require('http');

process.on('unhandledRejection', error => {
    const exitCode = error.code || -1
    console.log('Unhandled Rejection - exiting process with error', exitCode, '. Details:', error);
    process.exit(exitCode);
});

// 'restbot-api' defines a wrapper object around the restbot API. So consumers of 'restbot-api' will use setUrl/start/list instead of having to make direct HTTP requests
module.exports = function (hostname, port) {
    const api = {};
    api.enums = {};
    api.enums.WINDOWS_STATE = {
        minimized: 'minimized',
        maximized: 'maximized',
        fullscreen: 'fullscreen',
        normal: 'normal',
    }

    const DEFAULT_TIMEOUT_IN_SECONDS = 10;
    api.clientTimeoutInSeconds = DEFAULT_TIMEOUT_IN_SECONDS;
    api.autoOpenDeveloperTools = false;
    api.logEntries = [];

    api.setOptions = function (options) {
        if (options) {
            api.clientTimeoutInSeconds = options.clientTimeoutInSeconds || api.clientTimeoutInSeconds;
            api.autoOpenDeveloperTools = options.autoOpenDeveloperTools || api.autoOpenDeveloperTools;
            api.throttleRequestsInMilliSeconds = options.throttleRequestsInMilliSeconds || api.throttleRequestsInMilliSeconds;
        }
    }

    api.list = async function () {
        const request = {
            verb: 'GET',
            path: ('/')
        };

        const { value: browserList } = await runHttpRequest('getList', request);
        return browserList;
    }

    api.destroyAllSessions = async function () {
        const request = {
            verb: 'DELETE',
            path: ('/')
        };

        const response = await runHttpRequest('destroyAllSessions', request);
        return response.statusCode === 204;
    }

    api.start = async function (browserId, locale) {
        const request = {
            verb: 'PUT',
            path: ('/' + browserId + '/'),
            postData: {}
        };

        if (locale) {
            request.postData.lang = locale;
        }

        if (this.autoOpenDeveloperTools) {
            request.postData.autoOpenDeveloperTools = this.autoOpenDeveloperTools;
        }

        const response = await runHttpRequest('start', request);
        if (response.statusCode != 200)
            throw new api.ApiException(response.statusCode, response.methodName, response.value);

        const browser = new Browser(browserId);
        return browser;
    }

    api.waitForRestbotToBeReady = async function () {
        const request = {
            verb: 'GET',
            path: ('/')
        };

        try {
            await runHttpRequest('getList', request);
            // it was able to connect to restbot to get the list of open browsers, restbot is ready!
        } catch (e) {
            console.log(`-- restbot not reachable [${e.message}]`);
            await api.sleep(1);
            await api.waitForRestbotToBeReady();
        }
    }

    api.attach = async function (browserId) {
        const browserList = await api.list();

        if (browserId === undefined) {
            // gets the first browser in the list
            if (browserList.length === 0)
                throw new api.ApiException(404, null, `No opened browsers`);

            browserId = browserList[0];
        } else {
            if (browserList.indexOf(browserId) === -1)
                throw new api.ApiException(404, null, `Unable to find browser ${browserId}`);
        }

        return new Browser(browserId);
    }

    api.log = function (...args) {
        api.logEntries.push(args);
        const timestamp = formatConsoleDate(new Date());
        console.log(...[timestamp, ...args]);
    }

    api.resetLogs = function () {
        api.logEntries = [];
    }

    api.sleep = function (sleepTimeInSeconds) {
        return new Promise(resolve => setTimeout(resolve, sleepTimeInSeconds * 1000));
    }

    api.newGuid = function () {
        function random4AlphaCharacters() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }

        return random4AlphaCharacters() + random4AlphaCharacters() + random4AlphaCharacters() + random4AlphaCharacters() +
            random4AlphaCharacters() + random4AlphaCharacters() + random4AlphaCharacters() + random4AlphaCharacters();
    }

    function formatConsoleDate(date) {
        var hour = date.getHours();
        var minutes = date.getMinutes();
        var seconds = date.getSeconds();
        var milliseconds = date.getMilliseconds();

        return '[' +
            ((hour < 10) ? '0' + hour : hour) +
            ':' +
            ((minutes < 10) ? '0' + minutes : minutes) +
            ':' +
            ((seconds < 10) ? '0' + seconds : seconds) +
            '.' +
            ('00' + milliseconds).slice(-3) +
            '] ';
    }

    function runHttpRequest(methodName, apiRequest) {
        const options = {
            host: hostname,
            port: port,
            path: encodeURI(apiRequest.path),
            method: apiRequest.verb
        };

        // restbot apiRequest timeout     
        options.headers = { 'x-timeout-in-sec': apiRequest.timeout || 0 };

        if (api.throttleRequestsInMilliSeconds)
            options.headers['x-throttle-requests-in-ms'] = api.throttleRequestsInMilliSeconds;

        if (apiRequest.postData) {
            apiRequest.postData = querystring.stringify(apiRequest.postData);
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            options.headers['Content-Length'] = apiRequest.postData.length;
        }

        return new Promise(function (resolve, reject) {
            const result = {};
            const req = http.request(options, function (res) {
                res.setEncoding('utf8');

                result.value = '';
                result.statusCode = res.statusCode;
                result.methodName = methodName;

                res.on('data', function (chunk) {
                    result.value += chunk;
                });

                res.on('end', function () {
                    if (result.value) {
                        try {
                            result.value = JSON.parse(result.value);
                        } catch (e) {
                            result.value = result.value;
                        }
                    }

                    resolve(result);
                });
            });

            req.on('error', function (e) {
                if (req.errorThrown)
                    return;

                result.message = e.message;
                result.statusCode = 500;
                result.error = e;
                req.errorThrown = true; /* because 2 errors may be raised for a single request */
                reject(result);
            });

            if (apiRequest.postData)
                req.write(apiRequest.postData);

            req.end();
        });
    }

    api.ApiException = function (statusCode, method, message) {
        this.name = 'ApiException';
        this.code = statusCode;
        this.method = method;
        this.message = message || '';
        const error = new Error(this.message);
        error.name = this.name;
    }

    function Browser(id) {
        const browser = this;
        const _methods = [];
        let lastValue;

        function runOrQueue(self, command) {
            command.stack = new Error().stack;
            _methods.push(command);
            const isSingleInvoke = !self.isBatch;

            if (isSingleInvoke) {
                const innerRunnerRes = innerRunner(self);
                return innerRunnerRes;
            }
            else
                return self;
        }

        function innerRunner(self) {
            const command = _methods.shift();

            function afterCurrentCallCompleted() {
                if (_methods.length > 0)
                    return runner(_methods.shift());
                else
                    return this.lastValue;
            }

            async function runner(command) {
                if (command.name === 'assertEquals') {
                    if (JSON.stringify(this.lastValue) !== JSON.stringify(command.expected)) {
                        const assertErrorMessage = `Current: '${this.lastValue}' was not equal to expected: '${command.expected}'`;
                        throw new Error(assertErrorMessage);
                    }

                    return afterCurrentCallCompleted();
                }
                else {
                    const request = command.request;
                    request.name = command.name;
                    request.path = `/${id}${request.path}`;

                    if (request.timeout === undefined)
                        request.timeout = api.clientTimeoutInSeconds

                    const response = await runHttpRequest(command.name, request);

                    if (response.statusCode >= 300) {
                        throw new api.ApiException(response.statusCode, response.methodName, response.value);
                    }
                    else {
                        this.lastValue = response.value;
                        return afterCurrentCallCompleted();
                    }
                }
            }

            return runner(command);
        }

        function getDocPath(action, path) {
            let fullPath = '/doc'
            if (path) {
                fullPath = `${fullPath}${path}`
            }

            fullPath = `${fullPath}?${action}`
            return fullPath
        }

        return {
            id: id,
            setUrl: function (url) { return runOrQueue(this, { name: 'setUrl', request: { verb: 'PUT', path: '/url', postData: { value: url } } }) },
            getUrl: function () { return runOrQueue(this, { name: 'getUrl', request: { verb: 'GET', path: '/url' } }) },
            kill: function (killInfo) { return runOrQueue(this, { name: 'kill', request: { verb: 'DELETE', path: '/', postData: killInfo } }); },

            getValue: function (path) { return runOrQueue(this, { name: 'getValue', request: { verb: 'GET', path: getDocPath('get_value', path) } }); },
            setValue: function (path, value) { return runOrQueue(this, { name: 'setValue', request: { verb: 'PUT', path: getDocPath('set_value', path), postData: { value } } }) },
            getText: function (path) { return runOrQueue(this, { name: 'getText', request: { verb: 'GET', path: getDocPath('get_text', path) } }); },
            getCount: function (path) { return runOrQueue(this, { name: 'getCount', request: { verb: 'GET', path: getDocPath('count', path) } }); },
            focus: function (path) { return runOrQueue(this, { name: 'focus', request: { verb: 'PUT', path: getDocPath('focus', path) } }) },
            getClientRectangle: function (path) { return runOrQueue(this, { name: 'getClientRectangle', request: { verb: 'GET', path: getDocPath('get_client_rectangle', path) } }) },

            checkVisible: function (path, timeoutInSeconds) { return runOrQueue(this, { name: 'checkVisible', request: { verb: 'GET', path: getDocPath('check_visible', path), timeout: timeoutInSeconds || 0 } }); },
            checkExists: function (path, timeoutInSeconds) { return runOrQueue(this, { name: 'checkExists', request: { verb: 'GET', path: getDocPath('check_exists', path), timeout: timeoutInSeconds || 0 } }); },
            waitExists: function (path) { return runOrQueue(this, { name: 'waitExists', request: { verb: 'GET', path: getDocPath('wait_exists', path) } }); },

            click: function (path) { return runOrQueue(this, { name: 'click', request: { verb: 'PUT', path: getDocPath('click', path) } }); },
            mouse: function (path, buttons) { return runOrQueue(this, { name: 'mouse', request: { verb: 'PUT', path: getDocPath('mouse', path), postData: { value: buttons } }, }); },

            setVar: function (path, func) { return runOrQueue(this, { name: 'setVar', request: { verb: 'PUT', path: getDocPath('set_var', path), postData: { value: func } } }); },

            screenshot: function () { return runOrQueue(this, { name: 'screenshot', request: { verb: 'GET', path: getDocPath('screenshot') } }); },
            fullPageScreenshot: function (increaseFactor) { return runOrQueue(this, { name: 'fullPageScreenshot', request: { verb: 'GET', path: getDocPath('fullpage_screenshot'), postData: increaseFactor } }); },
            sendKey: function (keyInfo) { return runOrQueue(this, { name: 'send_key', request: { verb: 'PUT', path: getDocPath('send_key'), postData: keyInfo } }); },
            invoke: function (path, func) { return runOrQueue(this, { name: 'invoke', request: { verb: 'PUT', path: getDocPath('invoke', path), postData: { value: func } } }); },
            inject: function (path, func) { return runOrQueue(this, { name: 'inject', request: { verb: 'PUT', path: getDocPath('inject', path), postData: { value: func } } }); },
            resetToDefaultFrame: function (frameId) { return runOrQueue(this, { name: 'resetToDefaultFrame', request: { verb: 'PUT', path: getDocPath('reset_frame') } }); },
            switchFrame: function (urlFragment) { return runOrQueue(this, { name: 'switchFrame', request: { verb: 'PUT', path: getDocPath('switch_frame'), postData: { value: urlFragment } } }); },
            enableNetworkStats: function () { return runOrQueue(this, { name: 'enableNetworkStats', request: { verb: 'GET', path: getDocPath('enable_network_stats') } }); },
            getNetworkStats: function (greaterThanTimeStamp) { return runOrQueue(this, { name: 'getNetworkStats', request: { verb: 'GET', path: getDocPath('get_network_stats', greaterThanTimeStamp) } }); },
            getNetworkStatsLatestTimestamp: function () { return runOrQueue(this, { name: 'getNetworkStatsLatestTimestamp', request: { verb: 'GET', path: getDocPath('get_network_stats_latest_timestamp') } }); },

            refresh: function () { return runOrQueue(this, { name: 'refresh', request: { verb: 'PUT', path: getDocPath('refresh') } }); },
            back: function () { return runOrQueue(this, { name: 'back', request: { verb: 'PUT', path: getDocPath('back') } }); },
            forward: function () { return runOrQueue(this, { name: 'forward', request: { verb: 'PUT', path: getDocPath('forward') } }); },

            getCookies: function () { return runOrQueue(this, { name: 'getCookies', request: { verb: 'GET', path: '/cookies' } }); },
            getCookieValue: function (name) { return runOrQueue(this, { name: 'getCookieValue', request: { verb: 'GET', path: `/cookies/${name}` } }); },
            setCookieValue: function (name, value) { return runOrQueue(this, { name: 'setCookieValue', request: { verb: 'PUT', path: `/cookies/${name}`, postData: { value } } }); },
            deleteCookie: function (name) { return runOrQueue(this, { name: 'deleteCookie', request: { verb: 'DELETE', path: `/cookies/${name}` } }); },

            getErrors: function () { return runOrQueue(this, { name: 'getErrors', request: { verb: 'GET', path: '/errors' } }); },
            clearErrors: function () { return runOrQueue(this, { name: 'clearErrors', request: { verb: 'DELETE', path: '/errors' } }); },

            getViews: function () { return runOrQueue(this, { name: 'getViews', request: { verb: 'GET', path: '/views' } }); },
            setActiveView: function (id) { return runOrQueue(this, { name: 'setActiveView', request: { verb: 'PUT', path: `/views/${id}` } }); },
            closeView: function (id) { return runOrQueue(this, { name: 'closeView', request: { verb: 'DELETE', path: `/views/${id}` } }); },
            closeActiveView: function (id) { return runOrQueue(this, { name: 'closeActiveView', request: { verb: 'DELETE', path: `/views` } }); },
            updateViews: function (updateInfo) { return runOrQueue(this, { name: 'updateViews', request: { verb: 'PUT', path: '/views', postData: updateInfo } }); },

            sleep: function (valueInSeconds) { return runOrQueue(this, { name: 'sleep', request: { verb: 'POST', path: '/?sleep', postData: { value: valueInSeconds } } }) },
            pause: function () { return runOrQueue(this, { name: 'pause', request: { verb: 'POST', path: '/?pause' } }); }, // sends pause test signal, returns after the user clicks on the resume button

            assertEquals: function (value) { return runOrQueue(this, { name: 'assertEquals', expected: value }) },
            batch: function (f) {
                const isNestedBatch = this.isBatch;
                if (isNestedBatch) {
                    return f();

                } else {
                    try {
                        this.isBatch = true;
                        f();
                        const retval = innerRunner(this);
                        return retval;
                    } finally {
                        this.isBatch = false;
                    }
                }
            }
        }
    }

    return api;
}