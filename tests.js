// note: this file contains tests that ensure that api,js functions are working properly, using restbot's test files (see restbot project->test html files)
const api = require('./api')('localhost', 8081);

// uncomment this to use restbot from a remote/local VM
// const api = require('./restbot-api')('10.161.162.77', 8081);

api.setOptions({
    clientTimeoutInSeconds: 1,
    throttleRequestsInMilliSeconds: 0
});

const mainUrl = 'http://localhost:8082/tests.html';
const popupUrl = 'http://localhost:8082/tests.popup.html';

async function objectApi() {
    let b1 = await api.start('b1');
    let allBrowsers = await api.list();
    if (allBrowsers.indexOf('b1') == -1)
        throw Error("b1 should be in the browser list");

    api.log('_____ url');
    await b1.setUrl(popupUrl);
    await b1.getUrl();
    await b1.assertEquals(popupUrl);

    api.log('_____ url batch')
    await b1.batch(() => {
        b1.setUrl(mainUrl)
            .getUrl()
            .assertEquals(mainUrl);
    });

    api.log('_____ locators');
    await b1.batch(() => {
        b1.getValue('/body^tagName').assertEquals('BODY')
            .getValue('/div/class=list1^tagName').assertEquals('UL')
            .getValue('/div/.list1^tagName').assertEquals('UL')
    });

    api.log('_____ functions');
    await b1.batch(() => {
        b1.getValue('/div/.list1/parent()^tagName').assertEquals('DIV')
            .getText('/div/.list1/li/siblings()/eq(0)').assertEquals('item 1')
            .getText('/div/.list1/li/siblings()/eq(2)').assertEquals('item 3')
            .getText('/head/title').assertEquals('test page')
    });

    api.log('_____ attributes & properties');
    await b1.batch(() => {
        b1.getValue('/id=inputs/type=checkbox@checked').assertEquals('checked')
            .getValue('/id=inputs/type=checkbox^checked').assertEquals(true)
    });

    api.log('_____ count / get / set value / sendKey/ getClientRectangle - using attributes & properties');
    await b1.batch(() => {
        b1.getCount('/div/.list1/li').assertEquals(3)
            .getValue('/id=inputs/input/eq(1)^value').assertEquals('initial')
            .setValue('/id=inputs/input/eq(1)', 'updated')
            .getValue('/id=inputs/input/eq(1)^value').assertEquals('updated')
            .getValue('/id=inputs/input/eq(1)@value').assertEquals('initial')

            .setValue('/id=inputs/input/eq(1)@name', 'name1')
            .getValue('/id=inputs/input/eq(1)@name').assertEquals('name1')

            .focus('/id=inputs/input/eq(1)')
            .sendKey({ keyEventType: 'char', keyEventText: '_' })
            .sleep(.5)
            .getValue('/id=inputs/input/eq(1)^value').assertEquals('updated_');
    });

    const button1Rectangle = await b1.getClientRectangle('/id=setvalue');
    const button2Rectangle = await b1.getClientRectangle('/id=visibility');

    if (button1Rectangle.x > button2Rectangle.x)
        throw new Error('Error fetching buttons clientRectangle');

    api.log('_____ mouse + check visibility + check exists + wait exists');
    await b1.batch(() => {
        b1.getText('/id=result').assertEquals('')
            .click('/id=inputs/.buttons/input/eq(0)')
            .getText('/id=result').assertEquals('clicked')
            .checkVisible('/id=result').assertEquals(true)
            .mouse('/id=inputs/.buttons/input/eq(1)', 'mouseenter,mouseover')
            .checkVisible('/id=result').assertEquals(false)
            .mouse('/id=inputs/.buttons/input/eq(1)', 'mouseout')
            .checkVisible('/id=result').assertEquals(true)
            .checkExists('/id=result').assertEquals(true)
            .checkExists('/id=result_bad', 0).assertEquals(false)
            .waitExists('/id=result').assertEquals(true)

    });

    try {
        await b1.waitExists('/id=result_bad')
    }
    catch (ex) {
        if (ex.code != 404)
            throw ex;
    }

    api.log('_____ set let');
    await b1.batch(() => {
        b1.setVar('/div/.list1')
            .getText('/$0/li/eq(0)').assertEquals('item 1')
            .setVar('/body/h1', 'return elem.parent();')
            .getValue('/$0^tagName').assertEquals('BODY')
            .getText('/$1/li/eq(0)').assertEquals('item 1') // accesses one-before-last let
            .setVar('', 'return elem.find("*:contains(\'item 2\'):last");')
            .getText('/$0').assertEquals('item 2')
    });

    api.log('_____ screenshot');
    await b1.screenshot();

    api.log('_____ invoke function');
    await b1.batch(() => {
        b1.invoke('', 'return "hello";')
            .assertEquals('hello')
            .invoke('/id=firstTitle', 'let para = document.createElement("p");let node = document.createTextNode("This is new.");para.appendChild(node);elem[0].appendChild(para);')
    });
    // todo: verify that it worked!

    api.log('_____ inject function - auto confirm system confirm messagebox');
    await b1.batch(() => {
        b1.inject('', 'window.confirm = function(){return true;};')
            .click('/id=openConfirm')
            .getValue('/id=openConfirm^value').assertEquals('confirm_yes')
    });

    api.log('_____ iframes access');
    const newId = api.newGuid();
    await b1.batch(() => {
        b1.setUrl(popupUrl)
            .switchFrame("tests.popup.inner.html")
            .setValue('/body/id=inputs_popup/input/eq(1)', newId)
            .getValue('/body/id=inputs_popup/input/eq(1)^value')
            .assertEquals(newId)
            .resetToDefaultFrame()
            .checkExists('/h1[id=firstTitle]')
            .assertEquals(true)
    });

    api.log('_____ cookies access');
    await b1.batch(() => {
        b1.setUrl(mainUrl)
            .getCookies().assertEquals([])
            .getCookieValue('ck1').assertEquals(null)
            .setCookieValue('ck1', '123')
            .getCookieValue('ck1').assertEquals('123')
            .getCookies().assertEquals(['ck1'])
            .deleteCookie('ck1')
            .getCookies().assertEquals([])
    });

    api.log('_____ get / delete browser errors');
    const b3 = await api.start('b3');
    await b3.batch(() => {
        b3.setUrl(popupUrl)
            .getErrors().assertEquals([])
            .click('/id=errorOnClick')
    });

    const errors = await b3.getErrors();
    const expectedErrorCheck = errors[0] && errors[0].message && errors[0].message.indexOf('xhttp is not defined') > -1
    if (!expectedErrorCheck)
        throw new Error('Unable to fetch the error');

    await b3.batch(() => {
        b3.clearErrors()
            .getErrors().assertEquals([])
            .kill()
    });

    await b1.setUrl(mainUrl);
    api.log('_____ views : info / set_active / close');
    let tabInfo = await b1.getViews();
    let initialTabCount = tabInfo.length;

    await b1.click('/id=openTab');
    await b1.click('/id=openPopup');

    tabInfo = await b1.getViews();
    let newTabCount = tabInfo.length;

    if (newTabCount - 2 !== initialTabCount)
        throw new Error('Failed to open the 2 tabs - initial:' + initialTabCount + ' - new:' + newTabCount);

    await b1.setActiveView(tabInfo[1].id);
    await b1.setValue('/id=input_text', 'hello from other tab');

    const textValueInOtherTab = await b1.getValue('/id=input_text^value');

    await b1.setActiveView(tabInfo[0].id);
    const textValueInFirstTab = await b1.getValue('/id=input_text^value');

    if (textValueInFirstTab === textValueInOtherTab)
        throw new Error('Text not updated in other tab');

    for (let i = initialTabCount; i < tabInfo.length; i++)
        await b1.closeView(tabInfo[i].id);

    tabInfo = await b1.getViews();
    const finalCount = tabInfo.length;
    if (finalCount != initialTabCount)
        throw new Error('Failed to close the last 2 tabs');

    // opens another tab and attempt to close it with del(/views)
    await b1.click('/id=openTab');
    tabInfo = await b1.getViews();
    initialTabCount = tabInfo.length;

    await b1.closeActiveView();;
    tabInfo = await b1.getViews();
    newTabCount = tabInfo.length;

    if ((newTabCount + 1) !== initialTabCount)
        throw new Error('Unable to close the tab');

    api.log('_____ views : position-size-state');
    const TARGET_WIDTH = 1024, TARGET_HEIGHT = 480, TARGET_TOP = 0, TARGET_LEFT = 1;
    await b1.updateViews({ width: TARGET_WIDTH, height: TARGET_HEIGHT, top: TARGET_TOP, left: TARGET_LEFT });
    let info = await b1.getViews();
    if (info[0].width !== TARGET_WIDTH
        || info[0].height !== TARGET_HEIGHT
        || info[0].top !== TARGET_TOP
        || info[0].left !== TARGET_LEFT)
        throw new Error('Failed to set window position and size');

    await b1.updateViews({ state: api.enums.WINDOWS_STATE.minimized });
    info = await b1.getViews();

    if (info[0].state !== api.enums.WINDOWS_STATE.minimized)
        throw new Error('Failed to set window state');

    await b1.kill();

    api.log('_____ kill instances / destroy');
    for (let i = 0; i < 3; i++) {
        let b = await api.start(i);
        await b.kill(true);
    }

    b1 = await api.start('b1');
    const allSessionsDestroyed = await api.destroyAllSessions();
    allBrowsers = await api.list();

    if (!allSessionsDestroyed || allBrowsers.length !== 0)
        throw new Error('Failed to destroy all sessions');

    api.log('_____ sleep, pause and attach');
    b1 = await api.start('b1');
    await b1.batch(() => {
        b1.setUrl(mainUrl)
            .sleep(1)
            .pause()
            .kill()
    });

    api.log('_____ back, forward, refresh')
    b1 = await api.start('b1');
    await b1.batch(() => {
        b1.setUrl(mainUrl)
            .setValue('/id=inputs/input/eq(1)', 'updated')
            .getValue('/id=inputs/input/eq(1)^value').assertEquals('updated')
            .refresh()
            .getValue('/id=inputs/input/eq(1)^value').assertEquals('initial')
            .click('/id=nextPage')
            .back()
            .getText('/head/title').assertEquals('test page')
            .forward()
            .getText('/head/title').assertEquals('popup page')
    });

    // attach without parameters should attach to the first one & work
    b1 = await api.attach();
    await b1.kill();

    api.log('_____ network stats');
    b1 = await api.start('b1');
    await b1.enableNetworkStats();
    await b1.setUrl(mainUrl);
    await b1.click('/id=openLongRunningHttpRequest');
    const networkStats = await b1.getNetworkStats();

    // ensure we have a 404 in the network stats requests
    const has404 = networkStats.filter(({ status }) => status === 404).length > 0;
    const hasPendingRequests = networkStats.filter(({ status }) => status === 0).length > 0;
    if (!has404 || !hasPendingRequests)
        throw new Error('Failed to get network stats');

    const latestTimeStamp = await b1.getNetworkStatsLatestTimestamp();
    const networkStats2 = await b1.getNetworkStats(latestTimeStamp);
    if (networkStats2.length !== 0)
        throw new Error('Failed to filter network stats');

    await b1.kill();

    api.log('END');
}

objectApi();

async function requestApiTests() {
    const baseApiUrl = `http://localhost:8081`;

    const ensureExpectedBrowsersCount = async (expected) => {
        const { value } = await api.apiRequest({
            url: baseApiUrl
        });
        if (value.length !== expected)
            throw new Error(`expected '${expected}' but received '${value.length}' browsers`);
    };

    await ensureExpectedBrowsersCount(0);

    // start browser
    await api.apiRequest({
        url: `${baseApiUrl}/b1`,
        verb: 'PUT',
    });

    await ensureExpectedBrowsersCount(1);

    // stop browser
    await api.apiRequest({
        url: `${baseApiUrl}/b1`,
        verb: 'DELETE',
    });

    await ensureExpectedBrowsersCount(0);
}

//requestApiTests();

async function fullPageScreenshot() {
    const b1 = await api.start('b1');
    await b1.setUrl(mainUrl)
    await b1.updateViews({ width: 800, height: 300 });
    const { data: bytes } = await b1.fullPageScreenshot();
    const buffer = new Buffer(bytes, 'base64');
    const fs = require('fs');
    fs.writeFile('image.png', buffer);
    api.log('-- done');
    await b1.kill();
}

//fullPageScreenshot();

async function wip() {
    const b1 = await api.start('b1');

    await b1.batch(() => {
        b1.setUrl(mainUrl)
            .focus('/id=inputs/input/eq(1)')
            .sendKey({ keyEventType: 'char', keyEventText: 'txt' })
            .sleep(.5)
            .getValue('/id=inputs/input/eq(1)^value').assertEquals('updated');
    });




    //await b1.kill();

    //await b1.updateViews({ state: api.enums.WINDOWS_STATE.minimized });
    //await b1.pause();

    //await b1.kill();
}

//wip();