var querystring = require('querystring');
var http = require('http');

process.on('uncaughtException', function (err) {
    console.log(err)
})

module.it = null; /* the iterator should be set to the generator function that contains the yields (think about a reverse generator) */
module.allowParallelism = false;
module.exports = function (hostname, port) {
    var module = {};

    module.put = function (browserId, path, postData, expected, timeout) {
        var request = getRequestObject('put', path, timeout, postData);
        return runAndCheck(browserId, request, expected);
    }

    module.post = function (browserId, path, postData, expected, timeout) {
        var request = getRequestObject('post', path, timeout, postData);
        return runAndCheck(browserId, request, expected);
    }

    module.get = function (browserId, path, expected, timeout) {
        var request = getRequestObject('get', path, timeout);
        return runAndCheck(browserId, request, expected);
    }

    module.del = function (browserId, path, postData, expected, timeout) {
        var request = getRequestObject('delete', path, timeout, postData);
        return runAndCheck(browserId, request, expected);
    }

    function getRequestObject(verb, path, timeout, postData) {
        var request = {
            verb: verb,
            path: (path || '')
        };

        request.timeout = (typeof timeout === 'undefined') ? 10 : timeout;
        if (postData)
            request.postData = postData;

        return request;
    }

    runAndCheck = function (browserId, request, expected) {
        request.path = '/' + browserId + request.path;

        if (typeof expected === 'undefined')
            expected = {};

        if (typeof expected.code === 'undefined')
            expected.code = [200];

        else if (!(expected.code.constructor === Array))
            expected.code = [expected.code];

        runHttpRequest(request.verb, request, false, function (current) {
            var checkOk = expected.code.indexOf(current.statusCode) > -1;

            if (checkOk && (typeof expected.value !== 'undefined'))
                checkOk = JSON.stringify(expected.value) === JSON.stringify(current.value);

            if (checkOk) {
                module.it.next(current);

            } else {
                var e = {};
                e.expected = expected;
                e.__current = current;
                module.it.throw(e);
            }
        });
    }

    module.newGuid = function (includeSeparator) {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }

        if (includeSeparator)
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
        else
            return s4() + s4() + s4() + s4() + s4() + s4() + s4() + s4();
    }

    function existsInvalidParallelRun(options) {
        if (module.allowParallelism)
            return false;

        var optionsStrAfter = JSON.stringify(options);
        return module.lastOptionStr !== optionsStrAfter;
    }

    module.lastOptionStr;
    runHttpRequest = function (methodName, request, throwWhenNot200, cb) {
        var options = {
            host: hostname,
            port: port,
            path: encodeURI(request.path),
            method: request.verb
        };

        // restbot request timeout     
        options.headers = { 'x-timeout-in-sec': request.timeout || 0 };

        if (request.postData) {
            request.postData = querystring.stringify(request.postData);
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            options.headers['Content-Length'] = request.postData.length;
        }

        console.log('[' + options.method + ']', decodeURI(options.path));
        var retVal = {};

        module.lastOptionStr = JSON.stringify(options);

        var req = http.request(options, function (res) {
            res.setEncoding('utf8');

            retVal.value = '';
            retVal.statusCode = res.statusCode;

            res.on('data', function (chunk) {
                retVal.value += chunk;
            });

            res.on('end', function () {
                if (existsInvalidParallelRun(options)) {
                    module.it.throw(new Error("Missing yield: " + JSON.stringify(request.command)));
                    return;
                }

                if (retVal.value)
                    retVal.value = JSON.parse(retVal.value);

                if (throwWhenNot200 && retVal.statusCode != 200)
                    module.it.throw(new module.TestException(retVal.statusCode, methodName, retVal.value));

                else
                    cb(retVal);
            });
        });

        req.on('error', function (e) {
            if (req.errorThrown)
                return;

            retVal.error = e;
            req.errorThrown = true; /* because 2 errors may be raised for a single request */

            if (throwWhenNot200)
                module.it.throw(new module.TestException(500, methodName, e));
            else
                cb(retVal);
        });

        if (request.postData)
            req.write(request.postData);

        req.end();
    }

    function parseTestModuleFunctions(mod) {
        module.testInit = mod['init'];
        module.testFunctions = [];

        if (!module.testInit)
            throw new Error('Required method "init(params)" not found in the test module');

        Object.keys(mod).forEach(function (key) {
            if (key !== 'init' && typeof (mod[key]) === 'function')
                module.testFunctions.push({ name: key, func: mod[key] });
        });

        if (module.testFunctions.length === 0)
            throw new Error('No functions found in the test module');
    }

    function displayMenu() {
        console.log('\n_________________________');
        for (var i = 0; i < module.testFunctions.length; i++)
            console.log(i + ": " + module.testFunctions[i].name);
        console.log();
    }

    module.next = function () {
        module.it.next();
    }

    module.runInteractive = function (mod, args) {
        args.splice(0, 2); // removes first two params (unused)

        try {
            parseTestModuleFunctions(mod);
            module.testInit(args);
        }
        catch (e) {
            console.log("ERROR: ", e);
            return;
        }

        displayMenu();
        var stdin = process.openStdin();
        stdin.addListener("data", function (d) {
            var userInput = d.toString().trim();
            var functionEntry = module.testFunctions[userInput];

            if (!functionEntry)
                displayMenu();

            else {
                module.it = functionEntry.func();
                module.it.next();
            }
        });

        /*
                call required init method with parameters passed as input
                everything else will be taken from the env file
        */
    }

    module.TestException = function (statusCode, method, message) {
        this.name = 'TestException';
        this.code = statusCode;
        this.method = method;
        this.message = message || '';
        var error = new Error(this.message);
        error.name = this.name;
    }
    module.TestException.prototype = Object.create(Error.prototype);

    return module;
}