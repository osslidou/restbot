var api = require('./tests.lib')('localhost', 8081);
var util = require('util');

var mod = {};

mod.main = function* () {
    try {
        var result;
        yield api.put('b1', '', null, { code: [200, 409] });
        yield api.put('b1', '', null, { code: 409 }); // 409 conflict - already there
        yield api.get('', '', { value: ['b1'] });

        console.log('_____ url');
        var testAppUrl = 'http://localhost:8082/tests.html';
        yield api.put('b1', '/url', { value: testAppUrl });
        yield api.get('b1', '/url', { value: testAppUrl });

        console.log('_____ locators');
        yield api.get('b1', '/doc/body^tagName?get_value', { value: 'BODY' });
        yield api.get('b1', '/doc/div/class=list1^tagName?get_value', { value: 'UL' });
        yield api.get('b1', '/doc/div/.list1^tagName?get_value', { value: 'UL' });

        console.log('_____ functions');
        yield api.get('b1', '/doc/div/.list1/parent()^tagName?get_value', { value: 'DIV' });
        yield api.get('b1', '/doc/div/.list1/li/siblings()/eq(0)?get_text', { value: 'item 1' });
        yield api.get('b1', '/doc/div/.list1/li/siblings()/eq(2)?get_text', { value: 'item 3' });

        console.log('_____ attributes & properties');
        yield api.get('b1', '/doc/id=inputs/type=checkbox@checked?get_value', { value: 'checked' });
        yield api.get('b1', '/doc/id=inputs/type=checkbox@checked', { code: 400 }); // bad request when no action is provided
        yield api.get('b1', '/doc/id=inputs/type=checkbox^checked?get_value', { value: true });

        console.log('_____ count / get / set value / set focus - using attributes & properties');
        yield api.get('b1', '/doc/div/.list1/li?count', { value: 3 });
        yield api.get('b1', '/doc/id=inputs/input/eq(1)^value?get_value', { value: 'initial' });
        yield api.put('b1', '/doc/id=inputs/input/eq(1)?focus');
        yield api.put('b1', '/doc/id=inputs/input/eq(1)?set_value', { value: 'updated' });
        yield api.get('b1', '/doc/id=inputs/input/eq(1)^value?get_value', { value: 'updated' });
        yield api.get('b1', '/doc/id=inputs/input/eq(1)@value?get_value', { value: 'initial' });

        yield api.put('b1', '/doc/id=inputs/input/eq(1)@name?set_value', { value: 'name1' });
        yield api.get('b1', '/doc/id=inputs/input/eq(1)@name?get_value', { value: 'name1' });

        console.log('_____ mouse + check visibility + check exists + wait exists');
        yield api.get('b1', '/doc/id=result?get_text', { value: '' });
        yield api.put('b1', '/doc/id=inputs/.buttons/input/eq(0)?click');
        yield api.get('b1', '/doc/id=result?get_text', { value: 'clicked' });
        yield api.get('b1', '/doc/id=result?check_visible', { value: true });

        yield api.put('b1', '/doc/id=inputs/.buttons/input/eq(1)?mouse', { value: 'mouseenter,mouseover' });
        yield api.get('b1', '/doc/id=result?check_visible', { value: false });
        yield api.put('b1', '/doc/id=inputs/.buttons/input/eq(1)?mouse', { value: 'mouseout' });
        yield api.get('b1', '/doc/id=result?check_visible', { value: true });

        yield api.get('b1', '/doc/id=result?check_exists', { value: true });
        yield api.get('b1', '/doc/id=result_bad?check_exists', { value: false }, 0);

        yield api.get('b1', '/doc/id=result?wait_exists', { value: true });
        yield api.get('b1', '/doc/id=result_bad?wait_exists', { code: 404 });

        console.log('_____ set var');
        yield api.post('b1', '/doc/div/.list1?set_var');
        yield api.get('b1', '/doc/$0/li/eq(0)?get_text', { value: 'item 1' });

        yield api.post('b1', '/doc/body/h1?set_var', { value: 'return elem.parent();' });
        yield api.get('b1', '/doc/$0^tagName?get_value', { value: 'BODY' });
        yield api.get('b1', '/doc/$1/li/eq(0)?get_text', { value: 'item 1' }); // accesses one-before-last var

        yield api.post('b1', '/doc?set_var', { value: 'return elem.find("*:contains(\'item 2\'):last");' });
        yield api.get('b1', '/doc/$0?get_text', { value: 'item 2' });
        yield api.get('b1', '/doc/$4?get_text', { code: [500] });

        console.log('_____ screenshot');
        yield api.get('b1', '/doc/?screenshot');

        console.log('_____ unsupported action');
        yield api.get('b1', '/doc?unknownAction', { code: [500] });

        console.log('_____ invoke function');
        yield api.put('b1', '/doc?invoke', { value: 'return "hello";' }, { value: 'hello' });

        console.log('_____ inject function - auto confirm system confirm messagebox');
        yield api.put('b1', '/doc?inject', { value: 'window.confirm = function(){return true;};' });
        yield api.put('b1', '/doc/id=openConfirm?click');
        yield api.get('b1', '/doc/id=openConfirm^value?get_value', { value: 'confirm_yes' });

        console.log('_____ cookies access');
        yield api.put('b1', '/url', { value: testAppUrl });
        yield api.get('b1', '/cookies', { value: [] });
        yield api.get('b1', '/cookies/ck1', { value: null });
        yield api.put('b1', '/cookies/ck1', { value: '123' });
        yield api.get('b1', '/cookies/ck1', { value: '123' });
        yield api.get('b1', '/cookies', { value: ['ck1'] });
        yield api.del('b1', '/cookies/ck1');
        yield api.get('b1', '/cookies/ck1', { value: null });
        yield api.get('b1', '/cookies', { value: [] });

        console.log('_____ get / delete browser errors');
        yield api.put('b3', '', null, { code: [200, 409] });
        yield api.put('b3', '/url', { value: 'http://localhost:8082/tests.popup.html' });

        result = yield api.get('b3', '/errors', { value: [] });

        yield api.put('b3', '/doc/id=errorOnClick?click');

        result = yield api.get('b3', '/errors');
        var expectedErrorCheck = result.value[0] && result.value[0].message && result.value[0].message.indexOf('xhttp is not defined') > -1
        if (!expectedErrorCheck)
            throw new Error('Unable to fetch the error');

        yield api.del('b3', '/errors');
        yield api.get('b3', '/errors', { value: [] });
        yield api.del('b3');

        console.log('_____ views : info / set_active / close');
        var tabInfo = yield api.get('b1', '/views');
        var initialTabCount = tabInfo.value.length;

        yield api.put('b1', '/doc/id=openTab?click');
        yield api.put('b1', '/doc/id=openPopup?click');

        tabInfo = yield api.get('b1', '/views');
        var newTabCount = tabInfo.value.length;

        if (newTabCount - 2 !== initialTabCount)
            throw new Error('Failed to open the 2 tabs - initial:' + initialTabCount + ' - new:' + newTabCount);

        yield api.put('b1', '/views/' + tabInfo.value[1].id);
        yield api.put('b1', '/doc/id=input_text?set_value', { value: 'hello from other tab' });
        result = yield api.get('b1', '/doc/id=input_text^value?get_value');
        var textValueInOtherTab = result.value;

        yield api.put('b1', '/views/' + tabInfo.value[0].id);
        result = yield api.get('b1', '/doc/id=input_text^value?get_value');
        var textValueInFirstTab = result.value;

        if (textValueInFirstTab === textValueInOtherTab)
            throw new Error('Text not updated in other tab');

        for (var i = initialTabCount; i < tabInfo.value.length; i++)
            yield api.del('b1', '/views/' + tabInfo.value[i].id);

        console.log('_____ tabs: error scenarios');
        yield api.del('b1', '/views/999', null, { code: 500 });

        result = yield api.get('b1', '/views');
        var finalCount = result.value.length;
        if (finalCount != initialTabCount)
            throw new Error('Failed to close the last 2 tabs');

        console.log('______ refresh, back, forward')
        yield api.put('b1', '/doc/id=inputs/input/eq(1)?set_value', { value: 'updated' });
        yield api.get('b1', '/doc/id=inputs/input/eq(1)^value?get_value', { value: 'updated' });
        yield api.put('b1', '/doc?refresh');
        yield api.get('b1', '/doc/id=inputs/input/eq(1)^value?get_value', { value: 'initial' });

        yield api.put('b1', '/doc/id=nextPage?click');
        yield api.put('b1', '/doc?back');
        yield api.get('b1', '/doc/head/title?get_text', { value: 'test page' });
        yield api.put('b1', '/doc?forward');
        yield api.get('b1', '/doc/head/title?get_text', { value: 'popup page' });

        console.log('_____ kill instances');
        yield api.del('b1');
        yield api.del('b2', null, null, { code: 404 });

        for (var i = 0; i < 3; i++) {
            yield api.put(i, '');
            yield api.del(i, '', { deleteSessionData: false });
        }

        console.log('_____ views : position-size');
        yield api.put('b1');
        const TARGET_WIDTH = 640, TARGET_HEIGHT = 480, TARGET_TOP = 0, TARGET_LEFT = 1;
        yield api.put('b1', '/views', { width: TARGET_WIDTH, height: TARGET_HEIGHT, top: TARGET_TOP, left: TARGET_LEFT });
        var info = yield api.get('b1', '/views');
        if (info.value[0].width !== TARGET_WIDTH
            || info.value[0].height !== TARGET_HEIGHT
            || info.value[0].top !== TARGET_TOP
            || info.value[0].left !== TARGET_LEFT)
            throw new Error('Failed to set window position and size');
        yield api.del('b1');
        console.log("-- SUCCESS\n");
    }
    catch (e) {
        console.log("-- ERROR3:\n", e);
    }
}

mod.init = function (params) { }

api.runInteractive(mod, process.argv);