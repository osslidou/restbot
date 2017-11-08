
var serverData = require('./server-data.js');
var os = require("os");

const APP_PORT = 8081;
const STATIC_PORT = 8082;

var BROWSER_PATH, BROWSER_DATA_FOLDER;

if (os.platform() === 'win32') { // windows
    BROWSER_PATH = "c:\\PROGRA~2\\Google\\Chrome\\Application\\chrome.exe";
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