var serverData = require('./server-data.js');
var fs = require('fs');

const Enums = require('./enums');

const WINDOWS_SERVICE_NAME = 'Restbot'
const WINDOWS_SERVICE_DESCRIPTION = 'Resbot node.js service'
const APP_PORT = 8081;
const STATIC_PORT = 8082;

const [action, currentFilename] = getOpeningArgsAction(process.argv);
if (action == Enums.APP_ACTION.install) {
    installOrRemoveWindowsService(true);
    return;
} else if (action == Enums.APP_ACTION.uninstall) {
    installOrRemoveWindowsService(false);
    return;
}

// starts static test webserver
var staticServer = require('./tests.static-server.js');
staticServer.start(STATIC_PORT);

// starts REST and websocket servers
var restServer = require('./server-rest.js');
var socketServer = require('./server-socket.js');

restServer.start(APP_PORT, serverData, function (server) {
    socketServer.start(server, serverData);
});

process.on('uncaughtException', function (err) {
    console.log('process.on(uncaughtException): ' + err + '\n');
});

function getOpeningArgsAction(args) {
    const filename = args[1];
    args.splice(0, 2); // removes first two params (node.exe and filename being ran)
    let action = Enums.APP_ACTION.run;
    switch (args[0]) {
        case "-i": action = Enums.APP_ACTION.install; break;
        case "-u": action = Enums.APP_ACTION.uninstall; break;
    }
    return [action, filename];
}

function installOrRemoveWindowsService(isInstall) {
    var Service = require('node-windows').Service;
    var nodeService = new Service({
        name: WINDOWS_SERVICE_NAME,
        description: WINDOWS_SERVICE_DESCRIPTION,
        script: currentFilename,
    });
    if (isInstall) {
        console.log('installing windows service...');
        nodeService.install();
    } else {
        console.log('removing windows service...');
        nodeService.uninstall();
    }
}

