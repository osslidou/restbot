// requires npm install
var io = require('socket.io');

exports.start = function (restServer, serverData) {

    var server = io.listen(restServer);
    server.on('error', function (err) {
        console.log('-- [' + browserId + '] server.on(error): ' + err + '\n');
    });

    server.on('connection', function (socket) {
        var browserId;

        socket.on('disconnect', function () {
            if (serverData.hasBrowserProcess(browserId)) {
                console.log('[' + browserId + '] unexpected disconnect\n');
                serverData.purgeBrowserData(browserId);
            }
        });

        socket.on('error', function (err) {
            console.log('socket.on(error): ' + err + '\n');
        });

        socket.on('chrome_ready', function () {
            var requestId;

            [requestId, browserId] = serverData.fetchPendingCreationData();
            console.log('-- [' + browserId.substr(0, 4) + '] chrome_ready');
            serverData.setSocket(browserId, socket);
            var res = serverData.getPendingRequest(requestId);
            var browser = serverData.getBrowser(browserId);
            res.json(browser.pid);
            res.end();

            serverData.deletePendingRequest(requestId);
        });

        // response received from chrome extension
        socket.on('cmd_out', function (socketData) {
            //console.log('-- [' + browserId + ']', socketData.cmd, ' ACK\n');

            // grabs the pending response object - assuming it is the latest in the queue
            var requestId = socketData.requestId;
            var res = serverData.getPendingRequest(requestId);

            // retry logic when we have a 404
            if (socketData.error_code === 404) {
                var now = new Date();
                var expiry = new Date(socketData.requestExpiry);
                var requestExpired = (expiry.getTime() - now.getTime()) < 0;

                if (!requestExpired) {
                    // request not expired, retry...
                    socketData.error_code = socketData.error_message = undefined;
                    console.log('-- [' + browserId + ']', socketData.cmd + ' - ' + socketData.path);
                    setTimeout(function () { socket.emit('cmd', socketData); }, 500);
                    return;
                }
                else if (socketData.cmd === "check_exists" || socketData.cmd === "check_visible")
                    socketData.retVal = false;
            }

            if (socketData.retVal !== undefined)
                res.json(socketData.retVal);

            else if (socketData.error_code)
                res.status(socketData.error_code).json(socketData.error_message);

            else
                res.writeHead(200);

            res.end();

            // at the end : do not remove it at first in case the retry logic kicks-in
            serverData.deletePendingRequest(requestId);
        });
    });
}