class ServerData {
    constructor() {
        this.pendingRequests = new Map();  // map[requestId, res]
        this.socketsByBrowser = new Map(); // map[browserId, socket]
        this.browserProcessMap = new Map(); // map[browserId, process]
    }

    purgeBrowserData(deletedBrowserId) {
        var purgeList = [];

        this.browserProcessMap.delete(deletedBrowserId);
        this.socketsByBrowser.delete(deletedBrowserId);

        for (let [requestId, res] of this.pendingRequests) {
            var browserId = res.req.browserId;
            if (browserId === deletedBrowserId) {
                purgeList.push(requestId);
            }
        }

        for (let requestId of purgeList) {
            console.log('Deleting orphaned request: ', requestId)
            this.pendingRequests.delete(requestId);
        }
    }

    fetchPendingCreationData() {
        // note: if we do not properly remove entries from 'this.pendingRequests' as appropriate the following code coudl result in picking the wrong browserId
        for (let [requestId, res] of this.pendingRequests) {
            let browserId = res.req.browserId;
            if (!(this.socketsByBrowser.has(browserId)))
                return [requestId, browserId];
        }

        throw new Error('Unable to find a pending browserId');
    };

    getSocket(browserId) {
        return this.socketsByBrowser.get(browserId);
    }

    getBrowser(browserId) {
        return this.browserProcessMap.get(browserId);
    }

    getPendingRequest(requestId) {
        return this.pendingRequests.get(requestId);
    }

    hasBrowserSocket(browserId) {
        return this.socketsByBrowser.has(browserId);
    }

    hasBrowserProcess(browserId) {
        return this.browserProcessMap.has(browserId);
    }

    setPendingRequest(requestId, res) {
        this.pendingRequests.set(requestId, res);
    }

    setBrowser(browserId, browser) {
        this.browserProcessMap.set(browserId, browser);
    }

    setSocket(browserId, socket) {
        this.socketsByBrowser.set(browserId, socket);
    }

    deletePendingRequest(requestId) {
        this.pendingRequests.delete(requestId);
    }
}

// only a single instance of this one will exist
module.exports = new ServerData();
