var serverData = require('./server-data.js');
var os = require("os");
const Enums = require('./enums');

const WINDOWS_SERVICE_NAME = 'Restbot'
const WINDOWS_SERVICE_DESCRIPTION = 'Resbot node.js service'
const APP_PORT = 8081;
const STATIC_PORT = 8082;

var BROWSER_PATH, BROWSER_DATA_FOLDER;

const [action, currentFilename] = getOpeningArgsAction(process.argv);
if (action == Enums.APP_ACTION.install) {
    installOrRemoveWindowsService(true);
    return;
} else if (action == Enums.APP_ACTION.uninstall) {
    installOrRemoveWindowsService(false);
    return;
}

if (os.platform() === 'win32') { // windows
    BROWSER_PATH = "c:\\PROGRA~2\\Google\Chrome\\Application\\chrome.exe";
    //BROWSER_DATA_FOLDER = process.env.TEMP + "\\google_data\\restbot";
    BROWSER_DATA_FOLDER = "c:\\temp\\restbot_cache";
    BROWSER_PATH = "c:\\temp\\Application\\chrome.exe"
    // permissions: if you get a crashed chrome, run nodejs not-as-admin and chrome in another folder
    //BROWSER_PATH = "C:\\Users\\vilidou\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";

} else if (os.platform() === 'darwin') { // mac
    BROWSER_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    BROWSER_DATA_FOLDER = process.env.TMPDIR + "/google_data/restbot";
} else
    throw new Error('OS not supported - platform = ' + os.platform());

// starts REST and websocket servers
var restServer = require('./server-rest.js');
var socketServer = require('./server-socket.js');

restServer.start(APP_PORT, BROWSER_PATH, BROWSER_DATA_FOLDER, serverData, function (server) {
    socketServer.start(server, serverData);
});

// starts static test webserver
var staticServer = require('./tests.static-server.js');
staticServer.start(STATIC_PORT);

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
