// Last time updated On: May 15, 2018

// Latest file can be found here: https://cdn.webrtc-experiment.com/meeting.js

// Muaz Khan     - https://github.com/muaz-khan
// MIT License   - https://www.webrtc-experiment.com/licence/
// Documentation - https://github.com/muaz-khan/WebRTC-Experiment/tree/master/meeting

// __________
// meeting.js

(function () {

    if (typeof adapter === 'undefined' || typeof adapter.browserDetails === 'undefined') {
        // https://webrtc.github.io/adapter/adapter-latest.js
        console.warn('adapter.js is recommended.');
    }
    else {
        window.adapter = {
            browserDetails: {
                browser: 'chrome'
            }
        };
    }

    if (typeof IceServersHandler === 'undefined') {
        // https:/cdn.webrtc-experiment.com/IceServersHandler.js
        console.warn('IceServersHandler.js is recommended.');
    }

    // a middle-agent between public API and the Signaler object
    window.Meeting = function (channel) {
        var signaler, self = this;
        // this.channel = channel || location.href.replace(/\/|:|#|%|\.|\[|\]/g, '');
        this.channel = channel || window.channel;

        var width = window.innerWidth;
        var height = window.innerHeight;
        var streams = [];

        // get alerted for each new meeting
        this.onmeeting = function (room) {
            if (self.detectedRoom) return;
            self.detectedRoom = true;

            self.meet(room);
        };

        function initSignaler() {
            signaler = new Signaler(self);
        }

        function captureUserMedia(callback) {
            var constraints = {
                audio: true,
                video: true
            };
            self.stream = new MediaStream()
            navigator.mediaDevices
                .getUserMedia({ audio: true, video: true })
                .then(stream => {
                    stream.width = parseInt((20 / 100) * width);
                    stream.height = parseInt((20 / 100) * height);
                    stream.top = height - stream.height;
                    stream.left = width - stream.width;

                    streams.push(stream);
                });

            navigator.getDisplayMedia({ video: true }).then(onstream).catch(onerror);

            function onstream(stream) {
                addStreamStopListener(stream, function () {
                    console.log("stopped");
                    console.log("Remove from DB");
                    removeChannel(window.channel.replace("#", ""));

                    var a = document.getElementById("stream-button").children[0]
                    a.setAttribute("target", "_blank");
                    a.innerHTML = "START STREAMING"
                    a.href = "javascript:startStream();";
                    if (self.onuserleft) self.onuserleft('self');
                });

                stream.fullcanvas = true;
                stream.width = width;
                stream.height = height;

                streams.push(stream);
                var mixer = new MultiStreamsMixer(streams);

                var videoScreen = createVideo(mixer.getMixedStream());
                mixer.frameInterval = 1;
                mixer.startDrawingFrames();

                self.stream = mixer.getMixedStream();

                function createVideo(streamLine) {
                    var video = document.createElement('video');
                    video.id = 'self';
                    video.muted = true;
                    video.volume = 0;

                    try {
                        video.setAttributeNode(document.createAttribute('autoplay'));
                        video.setAttributeNode(document.createAttribute('playsinline'));
                        video.setAttributeNode(document.createAttribute('controls'));
                    } catch (e) {
                        video.setAttribute('autoplay', true);
                        video.setAttribute('playsinline', true);
                        video.setAttribute('controls', true);
                    }

                    video.srcObject = streamLine;
                    return video;
                }

                self.onaddstream({
                    video: videoScreen,
                    stream: self.stream,
                    userid: 'self',
                    type: 'local'
                });

                // self.onaddstream({
                //     video: videoCam,
                //     stream: camStream,
                //     userid: 'self',
                //     type: 'localme'
                // });
                document.getElementsByTagName("canvas")[0].style.display = 'none'
                console.log("Add to DB");
                writeUserData(window.channel.replace("#", ""));

                callback(mixer.getMixedStream());
            }

            function removeChannel(streamId) {
                if (signaler.isbroadcaster) {
                    firebase.database().ref('streams/' + streamId).remove();
                }
            }

            function writeUserData(streamId) {
                firebase.database().ref('streams/' + streamId).set({
                    viewers: 0,
                });
            }

            function onerror(e) {
                ga('send', 'event', 'error', e.name, e.message, null, null);
                console.log(e);
            }
        }

        // setup new meeting room
        this.setup = function (roomid) {
            captureUserMedia(function () {
                !signaler && initSignaler();
                signaler.broadcast({
                    roomid: roomid || self.channel
                });
            });
            // document.getElementById('videos').deleteCell(1);
        };

        // join pre-created meeting room
        this.meet = function (room) {
            // captureUserMedia(function () {
            !signaler && initSignaler();
            signaler.join({
                to: room.userid,
                roomid: room.roomid
            });
            console.log("Join");
            var id = window.channel.replace("#", "");
            firebase.database().ref('streams/' + id).on('value', function (snapshot) {
                console.log("JOIN Data::" + snapshot.val().viewers);
            });
            // document.getElementById('videos').deleteCell(0);
            // });
        };

        // check pre-created meeting rooms
        this.check = initSignaler;
    };

    // object to store all connected peers
    var peers = {};

    // it is a backbone object

    function Signaler(root) {
        // unique identifier for the current user
        var userid = root.userid || getToken();

        // self instance
        var signaler = this;

        // object to store all connected participants's ids
        var participants = {};

        // it is called when your signaling implementation fires "onmessage"
        this.onmessage = function (message) {
            // if new room detected
            if (message.roomid && message.broadcasting && !signaler.sentParticipationRequest)
                root.onmeeting(message);

            else
                // for pretty logging
                console.debug(JSON.stringify(message, function (key, value) {
                    if (value && value.sdp) {
                        // console.log(value.sdp.type, '---', value.sdp.sdp);                        
                        window.watching++;
                        updateWatching();
                        return '';
                    } else return value;
                }, '---'));

            // if someone shared SDP
            if (message.sdp && message.to == userid) {
                this.onsdp(message);
            }

            // if someone shared ICE
            if (message.candidate && message.to == userid)
                this.onice(message);

            // if someone sent participation request
            if (message.participationRequest && message.to == userid) {
                participationRequest(message.userid);
            }

            // session initiator transmitted new participant's details
            // it is useful for multi-user connectivity
            if (message.conferencing && message.newcomer != userid && !!participants[message.newcomer] == false) {
                participants[message.newcomer] = message.newcomer;
                root.stream && signaler.signal({
                    participationRequest: true,
                    to: message.newcomer
                });
            }
        };

        function participationRequest(_userid) {
            // it is appeared that 10 or more users can send 
            // participation requests concurrently
            // onicecandidate fails in such case
            if (!signaler.creatingOffer) {
                signaler.creatingOffer = true;
                createOffer(_userid);
                setTimeout(function () {
                    signaler.creatingOffer = false;
                    if (signaler.participants &&
                        signaler.participants.length) repeatedlyCreateOffer();
                }, 1000);
            } else {
                if (!signaler.participants) signaler.participants = [];
                signaler.participants[signaler.participants.length] = _userid;
            }
        }

        // reusable function to create new offer

        function createOffer(to) {
            var _options = options;
            _options.to = to;
            _options.stream = root.stream;
            peers[to] = Offer.createOffer(_options);
        }

        // reusable function to create new offer repeatedly

        function repeatedlyCreateOffer() {
            var firstParticipant = signaler.participants[0];
            if (!firstParticipant) return;

            signaler.creatingOffer = true;
            createOffer(firstParticipant);

            // delete "firstParticipant" and swap array
            delete signaler.participants[0];
            signaler.participants = swap(signaler.participants);

            setTimeout(function () {
                signaler.creatingOffer = false;
                if (signaler.participants[0])
                    repeatedlyCreateOffer();
            }, 1000);
        }

        // if someone shared SDP
        this.onsdp = function (message) {
            var sdp = message.sdp;

            if (sdp.type == 'offer') {
                var _options = options;
                _options.stream = root.stream;
                _options.sdp = sdp;
                _options.to = message.userid;
                peers[message.userid] = Answer.createAnswer(_options);
            }

            if (sdp.type == 'answer') {
                peers[message.userid].setRemoteDescription(sdp);
            }
        };

        var candidates = [];
        // if someone shared ICE
        this.onice = function (message) {
            var peer = peers[message.userid];
            if (peer) {
                peer.addIceCandidate(message.candidate);
                for (var i = 0; i < candidates.length; i++) {
                    peer.addIceCandidate(candidates[i]);
                }
                candidates = [];
            } else candidates.push(candidates);
        };

        // it is passed over Offer/Answer objects for reusability
        var options = {
            onsdp: function (sdp, to) {
                signaler.signal({
                    sdp: sdp,
                    to: to
                });
            },
            onicecandidate: function (candidate, to) {
                signaler.signal({
                    candidate: candidate,
                    to: to
                });
            },
            onuserleft: function (_userid) {
                if (root.onuserleft) root.onuserleft(_userid);
            },
            onaddstream: function (stream, _userid) {
                console.debug('onaddstream', '>>>>>>', stream);

                addStreamStopListener(stream, function () {
                    if (root.onuserleft) root.onuserleft(_userid);
                });

                var videoScreen = createVideo(stream);

                function createVideo(streamLine) {
                    var video = document.createElement('video');
                    video.id = _userid;

                    try {
                        video.setAttributeNode(document.createAttribute('autoplay'));
                        video.setAttributeNode(document.createAttribute('playsinline'));
                        video.setAttributeNode(document.createAttribute('controls'));

                    } catch (e) {
                        video.setAttribute('autoplay', true);
                        video.setAttribute('playsinline', true);
                        video.setAttribute('controls', true);
                    }

                    video.srcObject = streamLine;

                    return video;
                }

                function onRemoteStreamStartsFlowing() {
                    // chrome for android may have some features missing                  
                    if (navigator.userAgent.match(/Android|iPhone|iPad|iPod|BlackBerry|IEMobile/i)) {
                        return afterRemoteStreamStartedFlowing();
                    }

                    if (!(videoScreen.readyState <= HTMLMediaElement.HAVE_CURRENT_DATA || videoScreen.paused || videoScreen.currentTime <= 0)) {
                        afterRemoteStreamStartedFlowing();
                    } else
                        setTimeout(onRemoteStreamStartsFlowing, 300);
                }

                function afterRemoteStreamStartedFlowing() {
                    // for video conferencing
                    document.getElementById("loader").style.display = "none";
                    document.getElementById("loader_text").style.display = "none";

                    signaler.isbroadcaster &&
                        signaler.signal({
                            conferencing: true,
                            newcomer: _userid
                        });

                    if (!root.onaddstream) return;
                    root.onaddstream({
                        video: videoScreen,
                        stream: stream,
                        userid: _userid + 's',
                        type: 'remote'
                    });
                }

                onRemoteStreamStartsFlowing();
            }
        };

        // call only for session initiator
        this.broadcast = function (_config) {
            signaler.roomid = _config.roomid || getToken();
            signaler.isbroadcaster = true;
            (function transmit() {
                signaler.signal({
                    roomid: signaler.roomid,
                    broadcasting: true
                });

                if (!signaler.stopBroadcasting && !root.transmitOnce)
                    setTimeout(transmit, 3000);
            })();

            // if broadcaster leaves; clear all JSON files from Firebase servers
            if (socket.onDisconnect) {
                console.log("Remove from DB");
                socket.onDisconnect().remove();
            }
        };

        // called for each new participant
        this.join = function (_config) {
            signaler.roomid = _config.roomid;
            this.signal({
                participationRequest: true,
                to: _config.to
            });
            signaler.sentParticipationRequest = true;
        };

        window.onbeforeunload = function () {
            leaveRoom();
            removeChannel(window.channel.replace("#", ""));
            // return 'You\'re leaving the session.';
        };

        window.onkeyup = function (e) {
            if (e.keyCode == 116)
                leaveRoom();
        };

        function removeChannel(streamId) {
            if (signaler.isbroadcaster) {
                firebase.database().ref('streams/' + streamId).remove();
            }
        }

        function leaveRoom() {
            signaler.signal({
                leaving: true
            });

            // stop broadcasting room
            if (signaler.isbroadcaster) {
                signaler.stopBroadcasting = true;
            } else {
                console.log("Leaving");
            }

            // leave user media resources
            if (root.stream) {
                if ('stop' in root.stream) {
                    root.stream.stop();
                }
                else {
                    root.stream.getTracks().forEach(function (track) {
                        track.stop();
                    });
                }
            }

            // if firebase; remove data from their servers
            if (window.Firebase) socket.remove();
        }
        root.leave = leaveRoom;

        var socket;

        // signaling implementation
        // if no custom signaling channel is provided; use Firebase
        if (!root.openSignalingChannel) {
            if (!window.Firebase) throw 'You must link <https://cdn.firebase.com/v0/firebase.js> file.';

            // Firebase is capable to store data in JSON format
            // root.transmitOnce = true;
            socket = new window.Firebase('https://' + (root.firebase || 'signaling') + '.firebaseIO.com/' + root.channel);
            socket.on('child_added', function (snap) {
                var data = snap.val();

                if (data.userid != userid) {
                    if (!data.leaving) signaler.onmessage(data);
                    else if (root.onuserleft) root.onuserleft(data.userid);
                }

                // we want socket.io behavior; 
                // that's why data is removed from firebase servers 
                // as soon as it is received
                // data.userid != userid && 
                if (data.userid != userid) snap.ref().remove();
            });

            // method to signal the data
            this.signal = function (data) {
                data.userid = userid;
                socket.push(data);
            };
        } else {
            // custom signaling implementations
            // e.g. WebSocket, Socket.io, SignalR, WebSycn, XMLHttpRequest, Long-Polling etc.
            socket = root.openSignalingChannel(function (message) {
                message = JSON.parse(message);
                if (message.userid != userid) {
                    if (!message.leaving) signaler.onmessage(message);
                    else if (root.onuserleft) root.onuserleft(message.userid);
                }
            });

            // method to signal the data
            this.signal = function (data) {
                data.userid = userid;
                socket.send(JSON.stringify(data));
            };
        }
    }

    // reusable stuff
    var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
    var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
    var RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;

    var iceServers = [];

    if (typeof IceServersHandler !== 'undefined') {
        iceServers = IceServersHandler.getIceServers();
    }

    iceServers = {
        iceServers: iceServers,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        iceCandidatePoolSize: 0
    };

    if (adapter.browserDetails.browser !== 'chrome') {
        iceServers = {
            iceServers: iceServers.iceServers
        };
    }

    var offerAnswerConstraints = {
        OfferToReceiveAudio: true,
        OfferToReceiveVideo: true
    };

    if (adapter.browserDetails.browser === 'chrome' || adapter.browserDetails.browser === 'safari') {
        offerAnswerConstraints = {
            mandatory: offerAnswerConstraints,
            optional: []
        };
    }

    var dontDuplicateOnAddTrack = {};

    function getToken() {
        if (window.crypto && window.crypto.getRandomValues && navigator.userAgent.indexOf('Safari') === -1) {
            var a = window.crypto.getRandomValues(new Uint32Array(3)),
                token = '';
            for (var i = 0, l = a.length; i < l; i++) {
                token += a[i].toString(36);
            }
            return token;
        } else {
            return (Math.random() * new Date().getTime()).toString(36).replace(/\./g, '');
        }
    }

    function onSdpError(e) {
        console.error('sdp error:', e);
    }

    // var offer = Offer.createOffer(config);
    // offer.setRemoteDescription(sdp);
    // offer.addIceCandidate(candidate);
    var Offer = {
        createOffer: function (config) {
            var peer = new RTCPeerConnection(iceServers);

            if ('addStream' in peer) {
                peer.onaddstream = function (event) {
                    config.onaddstream(event.stream, config.to);
                };

                if (config.stream) {
                    peer.addStream(config.stream);
                }
            }
            else if ('addTrack' in peer) {
                peer.onaddtrack = function (event) {
                    event.stream = event.streams.pop();

                    if (dontDuplicateOnAddTrack[event.stream.id] && adapter.browserDetails.browser !== 'safari') return;
                    dontDuplicateOnAddTrack[event.stream.id] = true;

                    config.onaddstream(event.stream, config.to);
                };

                if (config.stream) {
                    console.log(config.stream.getTracks());
                    config.stream.getTracks().forEach(function (track) {
                        peer.addTrack(track, config.stream);
                    });
                }
            }
            else {
                throw new Error('WebRTC addStream/addTrack is not supported.');
            }

            peer.onicecandidate = function (event) {
                config.onicecandidate(event.candidate, config.to);
            };

            peer.oniceconnectionstatechange = peer.onsignalingstatechange = function () {
                if (peer && peer.iceConnectionState && peer.iceConnectionState.search(/disconnected|closed|failed/gi) !== -1) {
                    if (peers[config.to]) {
                        window.watching--;
                        updateWatching();
                        delete peers[config.to];
                    }

                    if (config.onuserleft) config.onuserleft(config.to);
                }
            };

            peer.createOffer(offerAnswerConstraints).then(function (sdp) {
                // https://github.com/muaz-khan/RTCMultiConnection/blob/master/dev/CodecsHandler.js
                if (typeof CodecsHandler !== 'undefined') {
                    sdp.sdp = CodecsHandler.preferCodec(sdp.sdp, 'vp9');
                }

                peer.setLocalDescription(sdp).then(function () {
                    config.onsdp(sdp, config.to)
                }).catch(onSdpError);
            }).catch(onSdpError);

            function sdpCallback() {
                config.onsdp(peer.localDescription, config.to);
            }

            this.peer = peer;

            return this;
        },
        setRemoteDescription: function (sdp) {
            this.peer.setRemoteDescription(new RTCSessionDescription(sdp)).catch(onSdpError);
        },
        addIceCandidate: function (candidate) {
            this.peer.addIceCandidate(new RTCIceCandidate({
                sdpMLineIndex: candidate.sdpMLineIndex,
                candidate: candidate.candidate
            }));
        }
    };

    // var answer = Answer.createAnswer(config);
    // answer.setRemoteDescription(sdp);
    // answer.addIceCandidate(candidate);
    var Answer = {
        createAnswer: function (config) {
            var peer = new RTCPeerConnection(iceServers);

            if ('addStream' in peer) {
                peer.onaddstream = function (event) {
                    config.onaddstream(event.stream, config.to);
                };

                if (config.stream) {
                    peer.addStream(config.stream);
                }
            }
            else if ('addTrack' in peer) {
                peer.onaddtrack = function (event) {
                    event.stream = event.streams.pop();

                    if (dontDuplicateOnAddTrack[event.stream.id] && adapter.browserDetails.browser !== 'safari') return;
                    dontDuplicateOnAddTrack[event.stream.id] = true;

                    config.onaddstream(event.stream, config.to);
                };

                if (config.stream) {
                    config.stream.getTracks().forEach(function (track) {
                        peer.addTrack(track, config.stream);
                    });
                }
            }
            else {
                throw new Error('WebRTC addStream/addTrack is not supported.');
            }

            peer.onicecandidate = function (event) {
                config.onicecandidate(event.candidate, config.to);
            };

            peer.oniceconnectionstatechange = peer.onsignalingstatechange = function () {
                if (peer && peer.iceConnectionState && peer.iceConnectionState.search(/disconnected|closed|failed/gi) !== -1) {
                    if (peers[config.to]) {
                        delete peers[config.to];
                    }

                    if (config.onuserleft) config.onuserleft(config.to);
                }
            };

            peer.setRemoteDescription(new RTCSessionDescription(config.sdp)).then(function () {
                peer.createAnswer(offerAnswerConstraints).then(function (sdp) {
                    // https://github.com/muaz-khan/RTCMultiConnection/blob/master/dev/CodecsHandler.js
                    if (typeof CodecsHandler !== 'undefined') {
                        sdp.sdp = CodecsHandler.preferCodec(sdp.sdp, 'vp9');
                    }

                    peer.setLocalDescription(sdp).then(function () {
                        config.onsdp(sdp, config.to);
                    }).catch(onSdpError);
                }).catch(onSdpError);
            }).catch(onSdpError);

            this.peer = peer;

            return this;
        },
        addIceCandidate: function (candidate) {
            this.peer.addIceCandidate(new RTCIceCandidate({
                sdpMLineIndex: candidate.sdpMLineIndex,
                candidate: candidate.candidate
            }));
        }
    };

    // swap arrays

    function swap(arr) {
        var swapped = [],
            length = arr.length;
        for (var i = 0; i < length; i++)
            if (arr[i] && arr[i] !== true)
                swapped[swapped.length] = arr[i];
        return swapped;
    }

    window.addStreamStopListener = function (stream, callback) {
        var streamEndedEvent = 'ended';
        if ('oninactive' in stream) {
            streamEndedEvent = 'inactive';
        }
        stream.addEventListener(streamEndedEvent, function () {
            callback();
            callback = function () { };
        }, false);
        stream.getAudioTracks().forEach(function (track) {
            track.addEventListener(streamEndedEvent, function () {
                callback();
                callback = function () { };
            }, false);
        });
        stream.getVideoTracks().forEach(function (track) {
            track.addEventListener(streamEndedEvent, function () {
                callback();
                callback = function () { };
            }, false);
        });
    };
})();

function updateWatching() {
    console.log(window.watching);
    if (window.watching || window.watching > -1) {
        console.log(window.watching);
        var streamId = window.channel.replace("#", "");
        var viewersRef = firebase.database().ref('streams/' + streamId);
        viewersRef.update({ viewers: window.watching });
    }
}

function startStream() {
    console.log("Start streaming");
    var meetingRoomName = makeid();
    ga('send', 'event', 'button', 'StartStream', window.channel, null, null);

    try {
        // navigator.getDisplayMedia({video: true}).then(onstream).catch(onerror);
        window.meeting.setup(meetingRoomName);
        console.log('<h2><a href=' + location.href + window.channel + ' target="_blank">View Link</a></h2>');

        var a = document.getElementById("stream-button").children[0]
        a.setAttribute("target", "_blank");
        a.innerHTML = "SHARE STREAM"
        a.href = location.href + window.channel;
        // a.className = "button";
        window.watching = 0;
    } catch (e) {
        console.log(e);
        ga('send', 'event', 'error', e.name, e.message, null, null);
        window.alert("Screen sharing is disabled, please visit 'chrome://flags/#enable-experimental-web-platform-features' and enable this flag");
    }
}

function makeid() {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 5; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}