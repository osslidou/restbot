function show() {
    chrome.runtime.sendMessage({ cmd: 'get' }, function (response) {

        var rulesElem = document.getElementById('rules');
        var functionsElem = document.getElementById('functions');

        rulesElem.value = response.config.rulesText;
        functionsElem.value = response.config.functionsText;

        textAreaAdjust(rulesElem);
        textAreaAdjust(functionsElem);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    show();

    var dropZone = document.getElementById('dropzone');
    dropZone.addEventListener('dragover', handleDragOver, false);
    dropZone.addEventListener('drop', handleFileSelect, false);
});

function handleRead(type, file) {
    var reader = new FileReader();
    reader.onload = function (e) {

        var text = e.target.result;
        console.log(type, " : ", text)

        var updateCommand = ''
        if (type == 'rules')
            updateCommand = 'update_rules'
        
        else if (type == 'functions')
            updateCommand = 'update_functions'
        
        else 
        throw Exception('invalid type: ' + type);

        chrome.runtime.sendMessage({ cmd: updateCommand, value: text });
        show();
    }
    reader.readAsText(file);
}

function handleFileSelect(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    var files = evt.dataTransfer.files;

    for (var i = 0, f; f = files[i]; i++) {
        if (f.name.indexOf('url.js') !== -1)
            handleRead('rules', f);

        if (f.name.indexOf('func.js') !== -1)
            handleRead('functions', f);
    }
}

function handleDragOver(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}

function textAreaAdjust(o) {
    o.style.height = "1px";
    o.style.height = (25 + o.scrollHeight) + "px";
}

/*
chrome.tabs.create({ url: "https://www.google.ca/search?q=hootsuite" });
chrome.tabs.create({ url: "chrome://extensions" });
*/

