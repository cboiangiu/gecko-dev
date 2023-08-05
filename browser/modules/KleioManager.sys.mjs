class _KleioManager {
    providers = ["2performant.com"];
    redirects = new Map([
        ["drmax.ro", "https://event.2performant.com/events/click?ad_type=quicklink&aff_code=be1008129&unique=6390e3cfb&redirect_to=ENCODED_REDIRECT_TO"],
        ["pentruanimale.ro", "https://event.2performant.com/events/click?ad_type=quicklink&aff_code=be1008129&unique=32a6cdf55&redirect_to=ENCODED_REDIRECT_TO"],
        ["1001cosmetice.ro", "https://event.2performant.com/events/click?ad_type=quicklink&aff_code=be1008129&unique=e617bbc13&redirect_to=ENCODED_REDIRECT_TO"],
        ["f64.ro", "https://event.2performant.com/events/click?ad_type=quicklink&aff_code=be1008129&unique=5baacfa1f&redirect_to=ENCODED_REDIRECT_TO"],
    ]);
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
        let observe = (subject, topic, data) => {
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
    }
}

export const KleioManager = new _KleioManager();
