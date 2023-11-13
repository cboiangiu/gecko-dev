class _KleioManager {
    syncUrl = "https://sync.greenupworld.com";
    headers = new Headers();
    providers = [];
    redirects = new Map([]);
    windowsService = Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator);
    lastRedirectTimestamp = Date.now() - 2000;
    lastSyncTimestamp = Date.now() - 1800000;
    amazonRegex = /https:\/\/www\.amazon\.[A-Za-z.]+\/(?:[A-Za-z0-9-]+\/)?dp\/([A-Za-z0-9]+)\/?/;

    getCurrentURI = () => {
        // window object representing the most recent (active) instance of Firefox
        const currentWindow = this.windowsService.getMostRecentWindow('navigator:browser');
        // most recent (active) browser object - that's the document frame inside the chrome
        const browser = currentWindow.gBrowser;
        // object containing all the data about an address displayed in the browser
        const referredFromURI = browser.currentURI;

        if (referredFromURI.scheme !== "http" && referredFromURI.scheme !== "https") {
            return null;
        }
        return referredFromURI;
    }

    checkIfRedirectIsNeeded = (host, url) => {
        let localKey = null;
        for (const [key] of this.redirects) {
            if (host.includes(key)) {
                localKey = key;
                break;
            }
        }
        if (localKey === null) {
            return false;
        }

        const referredFromURI = this.getCurrentURI();
        // handles special amazon use case
        if (localKey.includes("amazon.")) {
            const hostProductIdMatch = url.match(this.amazonRegex);
            if (hostProductIdMatch == null) {
                return false;
            }
            const hostProductId = hostProductIdMatch[1];
            const referredFromURIProductIdMatch = referredFromURI?.spec.match(this.amazonRegex);
            const referredFromURIProductId = referredFromURIProductIdMatch == null ? null : referredFromURIProductIdMatch[1];
            if (hostProductId == referredFromURIProductId) {
                return false;
            }
        } else {
            if (referredFromURI?.host.includes(localKey)) {
                return false;
            }
            for (const provider of this.providers) {
                if (referredFromURI?.host.includes(provider)) {
                    return false;
                }
            }
        }
        if (this.lastRedirectTimestamp + 2000 > Date.now()) {
            return false;
        }
        return true;
    }

    makeRedirect = (redirectTo, host) => {
        let encodedRedirectTo = encodeURIComponent(redirectTo);
        let redirect = null;
        for (const [key, value] of this.redirects) {
            if (redirectTo.includes(key)) {
                // handles special amazon use case
                if (host.includes("amazon.")) {
                    let redirectToProductId = redirectTo.match(this.amazonRegex)[1];
                    redirect = value.replace("ENCODED_REDIRECT_TO", redirectToProductId);
                    break;
                }
                redirect = value.replace("ENCODED_REDIRECT_TO", encodedRedirectTo);
                break;
            }
        }
        return redirect;
    }

    syncData = () => {
        const requestOptions = {
            method: "GET",
            headers: this.headers
        };
        this.lastSyncTimestamp = Date.now();
        fetch(this.syncUrl, requestOptions)
            .then(response => {
                if (!response.ok) {
                    throw new Error();
                }
                return response.json();
            })
            .then(responseData => {
                this.providers = responseData.providers;
                this.redirects = new Map(responseData.affiliates
                    .map(affiliate => [affiliate.domain, affiliate.url])
                );
            })
            .catch(_ => { });
    }

    logAffiliation = (affiliateUrl) => {
        const requestOptions = {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({
                affiliate_url: affiliateUrl
            })
        };

        fetch(this.syncUrl + "/affiliation", requestOptions)
            .then(response => {
                if (!response.ok) {
                    throw new Error();
                }
                return;
            })
            .catch(_ => { });
    }

    exec = () => {
        this.headers.append("its", "me");
        this.syncData();
        let observe = (subject, topic, _) => {
            if (topic === 'http-on-modify-request') {
                const httpChannel = subject.QueryInterface(Ci.nsIHttpChannel);
                const host = httpChannel.URI.host;
                const url = httpChannel.URI.spec;
                if (this.checkIfRedirectIsNeeded(host, url)) {
                    // console.log("Initial url: " + this.getCurrentURI()?.spec);
                    // console.log("Redirecting for: " + url);
                    const redirect = this.makeRedirect(url, host);
                    if (redirect !== null) {
                        this.logAffiliation(url);
                        if (this.getCurrentURI()?.host.includes("google.") && redirect.includes("profitshare.")) {
                            try {
                                httpChannel.cancel(-1);
                            } catch (e) {
                                console.error("Error canceling HTTP request:", e);
                            }
                            const currentWindow = this.windowsService.getMostRecentWindow('navigator:browser');
                            const browser = currentWindow.gBrowser;
                            const newTab = browser.addTab(redirect, {
                                triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
                            });
                            browser.selectedTab = newTab;
                        } else {
                            this.lastRedirectTimestamp = Date.now();
                            const newURI = Services.io.newURI(redirect, null, null);
                            httpChannel.redirectTo(newURI);
                        }
                    }
                }

                if (this.lastSyncTimestamp + 1800000 < Date.now()) {
                    this.syncData();
                }
            }
        };
        Services.obs.addObserver(observe, 'http-on-modify-request', false);
    }
}

export const KleioManager = new _KleioManager();
