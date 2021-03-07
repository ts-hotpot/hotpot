let func = function(){
    let oldXMLHttpRequest = window.XMLHttpRequest;
    const VIDEO_ID = '072tU1tamd0';
    
    function doLottery() {
        let p = parseFloat(localStorage['_tsP']);
        if(isNaN(p)) p = 0;

        let r = Math.random();
        if(r <= p) return true;

        return false;
    }

    window.XMLHttpRequest = class _ extends oldXMLHttpRequest {
        
        constructor(){
            super();
            this._url = null;
            this._method = null;
            this._requestHeaderMap = {};
            this._needHookVideoResponse = false;
            this._hookPlayerResponse = null;
        }

        open(method, url) {
            if(!url.startsWith('https://')) {
                let a = document.createElement('a');
                a.href = url;
                url = a.href;
            }

            let u = this._url = new URL(url);
            this._method = method;
            
            let lotteryResult = doLottery();
            
            this._needHookEmbedRequest = lotteryResult === true && 
                u.pathname === '/youtubei/v1/player';

            this._needHookVideoResponse = lotteryResult === true &&
                u.pathname === '/watch' && 
                u.searchParams.get('v') !== null &&
                u.searchParams.get('pbj') !== null;

            return super.open.apply(this, arguments);
        }

        setRequestHeader(header, value) {
            let k = header.toLowerCase();
            if (value === null) {
                delete this._requestHeaderMap[k];
            } else {
                this._requestHeaderMap[k] = value;
            }

            return super.setRequestHeader.apply(this, arguments);
        }
        
        get readyState() {
            let superState = super.readyState;
            if(!this._needHookVideoResponse)
                return superState;
            
            if(superState < 4)
                return superState;
            
            if(this._hookPlayerResponse === null)
                return 3;

            return 4;
        }
        
        send(body) {
            if(this._needHookVideoResponse) {
                fetchTSVideo(this._requestHeaderMap).then(data => {
                    for(let resp of data) {
                        if(resp.playerResponse !== undefined) {
                            this._hookPlayerResponse = resp.playerResponse;
                            break;
                        }
                    }

                    this.onreadystatechange.apply(this, arguments);
                });
            } else if (this._needHookEmbedRequest) {
                let req = JSON.parse(body);
                req.videoId = VIDEO_ID;
                
                return super.send.apply(this, [JSON.stringify(req)]);
            }
            
            return super.send.apply(this, arguments);
        }
        
        get responseText() {
            let superResponseText = super.responseText;
            if(!this._needHookVideoResponse)
                return superResponseText;

            if(this.readyState !== 4)
                return "";
            
            let resp = JSON.parse(superResponseText);
            for(let v of resp) {
                if(v.playerResponse) {
                    v.playerResponse.streamingData = this._hookPlayerResponse.streamingData;
                    break;
                }
            }

            return JSON.stringify(resp);
        }
    };
    
    function fetchTSVideo(refHeaders) {
        let headers = {...refHeaders};
        delete headers['x-spf-previous'];
        delete headers['x-spf-referer'];
        return fetch('https://www.youtube.com/watch?v=' + VIDEO_ID + '&pbj=prefetch', {
            headers: refHeaders,
            method: "GET",
            credentials: "include"
        }).then(r=>r.json());
    }
    
    function extractYtPlayerResponse(html) {
        let sTxt = 'var ytInitialPlayerResponse';
        let eTxt = 'var meta';
        let s = html.indexOf(sTxt);
        s = html.indexOf('{', s + sTxt.length);
        
        let e = html.indexOf(eTxt, s);
        html = html.substring(s, e);
        e = html.lastIndexOf('}') + 1;
        let data = html.substring(0, e);
        return data;
    }

    function fetchAndCacheTSVideoData() {
        fetch("https://www.youtube.com/watch?v=" + VIDEO_ID, {
          "headers": {
            "accept": "text/html",
          },
          "method": "GET",
          "credentials": "include"
        })
            .then(r=>r.text())
            .then(extractYtPlayerResponse)
            .then((data) => {
                localStorage['_tsData'] = data;
            });
    }
    
    fetchAndCacheTSVideoData();
    
    if(localStorage['_tsData']) {
        let tsData = JSON.parse(localStorage['_tsData']);
        let lottery = doLottery();
        
        try {
            let initialPlayerResponse = undefined;
            Object.defineProperty(window, 'ytInitialPlayerResponse', {
                get() {
                    return initialPlayerResponse;
                },
                set(v) {
                    initialPlayerResponse = v;
                    if(lottery) {
                        initialPlayerResponse.streamingData = tsData.streamingData;
                    }
                    return initialPlayerResponse;
                }
            });
        } catch(e) {
            console.warn('fallback');
            let waiting = setInterval(()=>{
                if(window.ytInitialPlayerResponse) {
                    if(lottery) {
                        window.ytInitialPlayerResponse.streamingData = tsData.streamingData;
                    }
                }
            });
            
            window.addEventListener('load', function(){
                clearInterval(waiting);
            });
        }
    }
};

let script = document.createElement('script');
script.textContent = '(' + func.toString() + ')()';
document.documentElement.appendChild(script);
script.remove();
