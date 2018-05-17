var serverData = require('./server-data.js');
var os = require("os");
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

var BROWSER_PATH = "chrome-win32\\chrome.exe";
var BROWSER_DATA_FOLDER = "c:\\temp\\restbot_cache"; //  process.env.TMPDIR + "/google_data/restbot";

if (os.platform() === 'win32') {
    // windows
    downloadAndUnzipChrominiumIfNeededSync(BROWSER_PATH);
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

function downloadAndUnzipChrominiumIfNeededSync(chrominiumPath) {
    var fs = require('fs');

    if (fs.existsSync(BROWSER_PATH))
        return;

    const chrominiumPath = 'https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Win_x64%2F558500%2Fchrome-win32.zip?generation=1526340286819675&alt=media';

    var http = require('http'),
        fse = require('fs-extra'),
        request = require('request'),
        AdmZip = require('adm-zip'),
        uuid = require('node-uuid'),
        out = fs.createWriteStream('chrome.win32.zip');

    var req = request(
        {
            method: 'GET',
            uri: chrominiumPath
        }
    );

    req.pipe(out);
    req.on('end', function () {
        var archive = new AdmZip("chrome.win32.zip");
        var path = require('path');
        var tmpPath = path.join(os.tmpdir(), uuid.v1());
        console.log('extracting to:' + tmpPath);
        archive.extractAllTo(tmpPath);

        console.log('moving file...');
        fse.moveSync(path.join(tmpPath, 'chrome-win32'), 'chrome-win32', { overwrite: true });
    });


    /*
    // http://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?path=Win/
    var archive = new admZip('chrome.win32.zip');
    var path = require('path');
    var tmpPath = path.join(os.tmpdir(), uuid.v1());
    console.log('extracting to:' + tmpPath);
    archive.extractAllTo(tmpPath);
*/


    /*
    var request = require('request'),
        zlib = require('zlib'),
        fs = require('fs'),
        out = fs.createWriteStream('out');

    var chrominiumUrl = 'https://www.googleapis.com/download/storage/v1/b/chromium-browser-snapshots/o/Win_x64%2F558500%2Fchrome-win32.zip?generation=1526340286819675&alt=media';

    request(chrominiumUrl).pipe(zlib.createGunzip()).pipe(out);
    */
}