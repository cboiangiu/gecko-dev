class _KleioManager {
    providers = [];
    redirects = new Map([]);
    windowsService = Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator);
    lastRedirectTimestamp = Date.now();

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

    checkIfRedirectIsNeeded = (host) => {
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
        if (referredFromURI?.host.includes(localKey)) {
            return false;
        }
        for (const provider of this.providers) {
            if (referredFromURI?.host.includes(provider)) {
                return false;
            }
        }
        if (this.lastRedirectTimestamp + 2000 > Date.now()) {
            return false;
        }
        return true;
    }

    makeRedirect = (redirectTo) => {
        let encodedRedirectTo = encodeURIComponent(redirectTo);
        let redirect = null;
        for (const [key, value] of this.redirects) {
            if (redirectTo.includes(key)) {
                redirect = value.replace("ENCODED_REDIRECT_TO", encodedRedirectTo);
                break;
            }
        }
        return redirect;
    }

    exec = () => {
        const syncUrl = "http://localhost:8080";
        const headers = new Headers();
        headers.append("its", "me");
        const requestOptions = {
            method: "GET",
            headers: headers
        };

        fetch(syncUrl, requestOptions)
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

                let observe = (subject, topic, _) => {
                    if (topic === 'http-on-modify-request') {
                        const httpChannel = subject.QueryInterface(Ci.nsIHttpChannel);
                        const host = httpChannel.URI.host;
                        const url = httpChannel.URI.spec;
                        if (this.checkIfRedirectIsNeeded(host)) {
                            // console.log("Initial url: " + this.getCurrentURI()?.spec);
                            // console.log("Redirecting for: " + url);
                            const redirect = this.makeRedirect(url);
                            if (redirect !== null) {
                                this.lastRedirectTimestamp = Date.now();
                                const newURI = Services.io.newURI(redirect, null, null);
                                httpChannel.redirectTo(newURI);
                            }
                        }
                    }
                };
                Services.obs.addObserver(observe, 'http-on-modify-request', false);
            })
            .catch(_ => { });
    }
}

export const KleioManager = new _KleioManager();
