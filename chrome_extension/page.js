
if (!document.hasRun) {
    window.addEventListener('error', handlePageErrors, true);

    // add listener only once!
    console.log('onMessage listener added');

    chrome.runtime.onMessage.addListener(messageListener);
    document.hasRun = true;
    document.restbot_vars = [];
}

// function that waits for events from background extension worker
function messageListener(request, sender, sendResponse) {
    try {
        var data = request.data;

        console.log('incoming command: ', data.cmd, ' - path:', data.path);
        var node = getNodeAtPath(data);

        if (!data.error_code) {
            var elem = node.elem;
            switch (data.cmd) {
                case "get_value":
                    if (node.attributeName)
                        data.retVal = elem.attr(node.attributeName);

                    else if (node.propertyName)
                        data.retVal = elem.prop(node.propertyName);

                    else
                        data.retVal = elem.prop('outerHTML');
                    break;

                case "back":
                    window.history.back();
                    break;

                case "forward":
                    window.history.forward();
                    break;

                case "refresh":
                    window.location.reload(true);
                    break;

                case "get_cookie":
                    if (data.cookieName) {
                        data.retVal = getCookie(data.cookieName);
                    } else
                        data.retVal = getAllCookies();
                    break;

                case "remove_cookie":
                    deleteCookie(data.cookieName);
                    break;

                case "set_cookie":
                    setCookie(data.cookieName, data.value);
                    break;

                case "get_text":
                    data.retVal = elem.text();
                    break;

                case "count":
                    data.retVal = elem.length;
                    break;

                case "check_exists":
                    data.retVal = true;
                    break;

                case "wait_exists":
                    data.retVal = true;
                    break;

                case "check_visible":
                    var hidden = elem.is(":hidden") || elem.css("visibility") == "hidden";
                    data.retVal = !hidden;
                    break;

                case "set_value":
                    if (node.attributeName)
                        elem.attr(node.attributeName, data.value);

                    else if (node.propertyName)
                        elem.prop(node.propertyName, data.value);

                    else
                        elem.val(data.value);

                    dispatchManualEvent(elem, 'change');
                    dispatchManualEvent(elem, 'input');
                    break;

                case "focus":
                    elem[0].focus();
                    break;

                case "click":
                    createMouseEvent(elem, "click");
                    break;

                case "set_var":
                    if (data.value) {
                        var expr = "(function(){" + data.value + "})();";
                        elem = eval(expr);
                    }

                    var varId = newGuid();
                    elem.attr('restbot_var', varId);
                    document.restbot_vars.unshift(varId);
                    break;

                case "mouse":
                    data.value.split(',').forEach(function (mouseType) {
                        if (mouseType !== '') {
                            createMouseEvent(elem, mouseType);
                        }
                    });
                    break;

                case "invoke":
                    var expr = "(function(elem){" + data.value + "})(elem);";
                    console.log('invoking: ' + expr);
                    data.retVal = eval(expr);
                    break;

                case "inject":
                    var script_node = elem[0].ownerDocument.createElement('script');
                    script_node.type = 'text/javascript';
                    var text_node = elem[0].ownerDocument.createTextNode(data.value)
                    script_node.appendChild(text_node);
                    elem[0].ownerDocument.body.appendChild(script_node);
                    break;

                default:
                    throw new Error("Action not supported: " + data.cmd);
            }
        }
    }
    catch (err) {
        console.log('500 error: ' + err.message);
        console.log(err);
        data.error_code = 500;
        data.error_message = err.message;
    }

    console.log('data=', data);
    sendResponse({ data: data });
}

function getUrlDomain(url) {
    var matches = url.match(/^https?\:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
    return matches && matches[1];  // domain will be null if no match is found
}

function setCookie(name, value) {
    document.cookie = name + "=" + value + "; path=/";
}

function getCookie(name) {
    var document_cookies = document.cookie;
    if (document_cookies) {
        var cookie_pairs = document_cookies.split(';');

        for (var i = 0; i < cookie_pairs.length; i++) {
            var cookie = cookie_pairs[i].split('=');
            if (cookie[0] === name)
                return cookie[1];
        }
    }
    return null;
}

function deleteCookie(name) {
    document.cookie = name + '=; Max-Age=0'
}

function getAllCookies() {
    var retVal = [];
    var document_cookies = document.cookie;
    if (document_cookies) {
        var cookie_pairs = document_cookies.split(';');
        for (var i = 0; i < cookie_pairs.length; i++) {
            var cookie = cookie_pairs[i].split('=');
            retVal.push(cookie[0]);
        }
    }
    return retVal;
}

// body/class=class1/input[0]/widgetid*=vince@type
function getNodeAtPath(data) {
    var retVal = {};
    retVal.elem = $('html');

    if (data.cmd.indexOf('_cookie') > -1)
        return retVal;

    try {
        data.path.split('/').forEach(function (segment) {

            if (segment !== '') {
                // attribute 
                if (segment.indexOf('@') > -1) {
                    var index = segment.indexOf('@');
                    retVal.attributeName = segment.substr(index + 1);
                    segment = segment.substr(0, index);
                }

                // property 
                if (segment.indexOf('^') > -1) {
                    var index = segment.indexOf('^');
                    retVal.propertyName = segment.substr(index + 1);
                    segment = segment.substr(0, index);
                }

                // local vars
                if (segment.indexOf('$') === 0) {
                    var index = parseInt(segment.substr(1));

                    if (document.restbot_vars[index] !== undefined)
                        retVal.elem = retVal.elem.find('*[restbot_var="' + document.restbot_vars[index] + '"]');
                    else
                        throw new Error('variable index $' + index + ' referenced but was never set in the path :' + data.path);
                }

                else if (segment.substr(segment.length - 1) === ')') {
                    // js function invocation - this would work also: retVal.elem = retVal.elem[functionName](params);                   
                    var evalText = "retVal.elem." + segment;
                    retVal.elem = eval(evalText);
                }
                else if ((segment.indexOf('=') > -1) && segment.indexOf('[') === -1)
                    // find by named attribute with wildcard
                    retVal.elem = retVal.elem.find('*[' + segment + ']');

                else
                    retVal.elem = retVal.elem.find(segment);
            }
        });

        var elemFound = retVal.elem && retVal.elem.prop('outerHTML');

        if (!elemFound) {
            console.log('-- ERROR in getNodeAtPath: ' + data.path);
            data.error_code = 404;
            data.error_message = 'Path "' + data.path + '" not found';
        }
    }
    catch (err) {
        console.log('-- ERROR: ' + err.message);
        data.error_code = 500;
        data.error_message = err.message;
    }

    return retVal;
}

function dispatchManualEvent(element, eventName) {
    var event = new Event(eventName, { bubbles: true });
    element[0].dispatchEvent(event);
}

function createMouseEvent(elem, eventName) {
    var mEvent = document.createEvent("MouseEvent");
    mEvent.initMouseEvent(eventName, true, true, window, 0,
        0, 0, 0, 0,
        false, false, false, false,
        0, null);

    elem[0].dispatchEvent(mEvent);
}

function newGuid() {
    //return "123";

    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }

    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}

function handlePageErrors(e) {
    // this code keeps tracks errors occuring in the page
    var errorData = {};
    if (e.message)
        errorData.message = e.message;

    if (e.filename)
        errorData.filename = e.filename;

    if (e.lineno)
        errorData.lineno = e.lineno;

    if (e.target && e.target.baseURI)
        errorData.baseURI = e.target.baseURI;

    if (e.target && e.target.src)
        errorData.src = e.target.src;

    if (e.target && e.target.nodeName)
        errorData.nodeName = e.target.nodeName;

    chrome.runtime.sendMessage({ cmd: 'page_error', data: errorData });
    console.log('fullError:', e);
}