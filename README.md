# RestBot
### Introduction
RestBot is a REST API that can be used to automate web applications. It was built with following technologies:
* node.js (socket.io / express)
* jquery
* chrome extension api

In its current version, RestBot can replace most Selenium / WebDriver implementations.

### Starting Restbot

To start restbot, download the source code and run the following command at the prompt:
> node app.js

### Starting and stopping browsers

A browser instance is a real chrome browser that runs on the RestBot server.

You can start and stop instances with a single HTTP request. To start several instances (concurrency tests), run HTTP requests with distinct browser IDs (browser1 / browser2 / test1 / ...).
 
For instance, run the following 3 HTTP requests to start 3 chrome browsers instances on the automation server:  
`[PUT] http://restbot-vm1/browser1`  
`[PUT] http://restbot-vm1/browser2`  
`[PUT] http://restbot-vm1/test1`

To list current browser instances, run this HTTP request:  
`[GET] http://restbot-vm1` -> this returns `['browser1', 'browser2', 'test1']`  

To stop/kill them, run 3 HTTP requests:  
`[DELETE] http://restbot-vm1/browser1`  
`[DELETE] http://restbot-vm1/browser2`  
`[DELETE] http://restbot-vm1/test1`  

### Working with the url
To set the browser instance url, create a JSON object with {value=url}, and run :  
`[PUT] http://restbot-vm1/browser1/url { value: www.github.com }`

To get the current url:  
`[GET] http://restbot-vm1/browser1/url`

### Locating elements in the page
All other RestBot actions run on specific HTML elements in the page. Elements are identified by following url segments after /doc. You can find elements by class, by id, by element name, or by index. The API also supports advanced xPath expressions (startWith/contains/...). A good way to locate HTML elements is to use Chrome Developer Tools.

`[GET] http://restbot-vm1/browser1/doc/path-to-element` - returns the element's outer HTML  
`[PUT] http://restbot-vm1/browser1/doc/path-to-element?action {value=123 }` - runs various actions (click/set_value/focus/…)

`/body/div/input` - by tag name  
`/.invalid/span` ( same as /class='invalid'/span ) - by class name  
`/id*=search` - by ID (attribute value)  
`/input[id*=search]` - only look for input type of elements  
`/body/input/parent()` - using a jquery function  
`/body/input/siblings()/eq(2)` - using 2 jquery functions

RestBot supports most jQuery selectors and tree traversal functions, see the list at http://api.jquery.com/category/selectors/ and https://api.jquery.com/category/traversing/tree-traversal/

To access the attribute value of an element, add '@' to the last segment. This returns the value of the type attribute:  
`[GET] http://restbot-vm1/browser1/doc/input@type`

A similar syntax exists to access the property of an element - with the ^ symbol:  
`[GET] http://restbot-vm1/browser1/doc/input^checked` - returns the checkbox's checked status
`[GET] http://restbot-vm1/browser1/doc/body/input/parent()^tagName` - returns INPUT  

To access iframe contents, use the contents() function in the url, like this:  
`[GET] http://restbot-vm1/browser1/doc/iframe[id*=frame1]/contents()/body^tagName`

### Running actions
The API supports the following actions:

**wait_exists**  
Waits for an element to exist, using the 'x-timeout-in-sec' header parameter (or succeeds/fails immediately of no timeout value is passed)
`[GET] http://restbot-vm1/browser1/doc/form?wait_exists`

**check_exists**  
Check if an element exist - returns true or false. The request always returns a status 200, even though the element does not exist.  
`[GET] http://restbot-vm1/browser1/doc/form?check_exists`

**check_visible**  
Check if an element is visible - returns true or false. The request always returns a status 200, even though the element does not exist.  
`[GET] http://restbot-vm1/browser1/doc/form?check_visible`

**get_value**  
If the path points to an element, return its outer html, if the path points to an attribute or property, return the value. When no action is specified for a GET request, this is the default action, so you do not need to specify the trailing "?get_value" parameter.  
`[GET] http://restbot-vm1/browser1/doc/form` - returns the form's element outer HTML  
`[GET] http://restbot-vm1/browser1/doc/form@type` - returns the form's type attribute value  

**get_text**  
Return the element's text value ( for DIVs / H1s / ...)  
`[GET] http://restbot-vm1/browser1/doc/h1?get_text`

**count**  
Return the count of elements matching the path  
`[GET] http://restbot-vm1/browser1/doc/h1?count`

**screenshot​**  
Take a jpeg screenshot. The image is returned as Data URI (jpeg base64 encoded)  
`[GET] http://restbot-vm1/browser1/doc?screenshot`

**set_value** (value)  
Set the value of the element/attribute/property
`[PUT] http://restbot-vm1/browser1/doc/form/div/input?set_value { value: 'vancouver' }`  

**focus** (value)  
Focus on an element  
`[PUT] http://restbot-vm1/browser1/doc/form/div/input?focus`

**click**  
Simulate a click  
`[PUT] http://restbot-vm1/browser1/doc/form/type=submit?click`

**mouse**  
Simulate one or several mouse actions (comma-separated). Supported values (can be chained): mouseenter, mousedown, mouseup, mousemove, click, dblclick, mouseover, mouseout, mouseenter, mouseleave, contextmenu  
`[PUT] http://restbot-vm1/browser1/doc/form/type=submit?mouse { value: 'mousedown' }`  
`[PUT] http://restbot-vm1/browser1/doc/form/type=submit?mouse { value: 'mouseover,click' }`

**invoke**  
Run javascript code in the current page. This will execute a simple command. You can access the returned value (if needed) using the RestBot json returned value object  
`[PUT] http://restbot-vm1/browser1/doc?invoke {value: 'return "hello";'}`

**inject**  
Inject a javascript fragment in the current node.  
`[POST] http://restbot-vm1/browser1/doc?inject { value: 'window.confirm = function(){return true;};' }` ->  this removes all system confirm dialogs from the current page 

**set_var**  
Assign a new guid to the current element, and store it in the current browser variable $0. Previously set variables are pushed forward (so $1 contains the variable-before-last). The element can be referenced in the url with $0 in the url:  
`[POST] http://restbot-vm1/browser1/doc/form/div?set_var`  
`[GET] http://restbot-vm1/browser1/doc/$0/input`

set_var also supports functions to find the node to be tagged. In the context of the function, the variable elem refers to the current node :  
`[POST] http://restbot-vm1/browser1/doc/h1?set_var { value: 'return elem.parent();' }` - this tags the parent node of the h1 element  
`[POST] http://restbot-vm1/browser1/doc?set_var { value: 'return elem.find("*:contains(\'item 2\'):last");' }` - this tags the node that contains the text 'item 2' (:last is required to get the leaf node)

**sleep**  
Wait the specified amount of time in seconds.  
`[PUT] http://restbot-vm1/browser1/?sleep{ value: '5' }`  

### Interacting with the view - tabs and window
If your web application is opening tabs or popup pages, you can use the functions below to work with them. You can also change browser size and position properties.

**get**  
This returns an array of viewInfo objects. Each object has the id of the tab/popup.  
`[GET] http://restbot-vm1/browser1/views`

Its return value looks like this Json array:  
`[ { id: 2, index: 0, isActive: false, url: 'http://localhost:8082/tests.html', title: 'test page', windowId: 1, windowType: 'normal' },  
   { id: 4, index: 1, isActive: true, url: 'http://localhost:8082/tests.html', title: 'test page', windowId: 1, windowType: 'normal' },  
   { id: 6, index: 0, isActive: true, url: 'http://localhost:8082/tests.popup.html', title: 'popup page', windowId: 8, windowType: 'popup' } ]`

**close**  
Close a tab/popup, identified by its ID  
`[DELETE] http://restbot-vm1/browser1/views/id1`

**set_active**  
Change the active tab/popup  
`[PUT] http://restbot-vm1/browser1/views/id1`

**set_views_info**  
Update the browser size and position  
`[PUT] http://restbot-vm1/browser1/views { width: 640, height: 480, top: 10, left: 10 }`

### Accessing local cookies
You can get, set and delete cookies with the following functions:

**get**  
This returns the active tab's cookies.  
`[GET] http://restbot-vm1/browser1/cookies`

**set**  
Set a cookie
`[PUT] http://restbot-vm1/browser1/cookies/ck1 { value: '123' }`

**delete**  
Delete a cookie
`[DELETE] http://restbot-vm1/browser1/cookies/ck1`

### Accessing page errors
You can get and purge page errors with these functions:

**get**  
This returns an array of page errors.  
`[GET] http://restbot-vm1/browser1/errors`

**delete**  
Clear page errors
`[DELETE] http://restbot-vm1/browser1/errors`

### Clearing Restbot Cache

To clear automation-browser cache, run the same command with a `cleanup` parameter:
> node app.js cleanup
