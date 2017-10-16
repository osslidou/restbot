if (!document.hasRun) {
    // add listener only once!
    console.log('onMessage listener added');
    chrome.runtime.onMessage.addListener(messageListener);
    document.hasRun = true;
}

// function that waits for commands from background extension worker
function messageListener(request, sender, sendResponse) {
    try {
        console.log('incoming command: ' + JSON.stringify(request));

        var fullTitle = '';
        if (request.text)
            fullTitle = request.text;

        else if (request.func)
            fullTitle = eval(request.func);

        if (request.isAppendCurrent) {
            var titleSplit = document.title.split(' • ');
            var originalTitle = titleSplit.length > 1 ? titleSplit[1] : titleSplit[0];
            fullTitle += ' • ' + originalTitle;
        }

        setInterval(function () {
            document.title = fullTitle;
        }, 1000);
    }
    catch (err) {
        console.log('500 error: ' + err.message);
        console.log(err);
    }
}