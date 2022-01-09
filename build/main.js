"use strict";
/*
 * Created with @iobroker/create-adapter v1.31.0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const firebase = __importStar(require("firebase-admin"));
const webrtc_pubsub_server_1 = __importDefault(require("webrtc-pubsub-server"));
const requiredServiceAccountKeys = [
    'type',
    'project_id',
    'private_key_id',
    'private_key',
    'client_email',
    'client_id',
    'auth_uri',
    'token_uri',
    'auth_provider_x509_cert_url',
    'client_x509_cert_url',
];
function isSupportedState(state) {
    return typeof state === 'boolean' || typeof state === 'number' || typeof state === 'string';
}
function assertServiceAccount(obj) {
    const hasAllRequiredKeys = requiredServiceAccountKeys.every((key) => key in obj);
    if (!hasAllRequiredKeys) {
        throw new Error('Invalid service account');
    }
}
class WebrtcPubsub extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'webrtc-pubsub',
        });
        this.cleanups = new Set();
        this.pubsubServer = new webrtc_pubsub_server_1.default({
            webRTCConfig: {
                iceServers: [
                    {
                        urls: 'turn:3.68.69.247:3478',
                        credential: 'iob',
                        username: 'iob',
                    },
                ],
            },
        });
        this.subscribedStates = new Set();
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        const { serviceAccount } = this.config;
        if (!serviceAccount) {
            this.log.error('No Service account defined');
            return;
        }
        let parsedServiceAccount;
        try {
            parsedServiceAccount = JSON.parse(serviceAccount);
            assertServiceAccount(parsedServiceAccount);
        }
        catch (e) {
            this.log.error(`Failed to parse service account: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
            return;
        }
        try {
            firebase.initializeApp({
                credential: firebase.credential.cert(parsedServiceAccount),
            });
        }
        catch (e) {
            this.log.error(`Failed to initialize firebase: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
            this.log.info('Used service account: ' + serviceAccount);
            this.log;
            return;
        }
        const firestore = firebase.firestore();
        let initial = true;
        const unsubscribeFirestore = firestore
            .collection('connections')
            .where('signal.type', '==', 'offer')
            .onSnapshot((snapshot) => {
            if (initial) {
                initial = false;
                return;
            }
            const docChanges = snapshot.docChanges();
            for (const docChange of docChanges) {
                const { connectionId, signal } = docChange.doc.data();
                const peer = this.pubsubServer.createPeer();
                peer.on('signal', (signal) => {
                    firestore.collection('connections').add({
                        signal,
                        connectionId,
                    });
                });
                peer.on('close', () => {
                    peer.destroy();
                });
                peer.signal(signal);
            }
        });
        const messageListener = (topic, { state }) => {
            if (!isSupportedState(state))
                return;
            this.setForeignState(topic, state);
        };
        const subscriptionsListener = async (operation, topics) => {
            if (operation === 'subscribe') {
                for (const topic of topics) {
                    const currentState = await this.getForeignStateAsync(topic);
                    if (!currentState)
                        continue;
                    const { val } = currentState;
                    this.pubsubServer.publish(topic, { state: val });
                    if (this.subscribedStates.has(topic))
                        continue;
                    this.subscribedStates.add(topic);
                    this.subscribeForeignStatesAsync(topic);
                }
            }
        };
        this.pubsubServer.addMessageListener(messageListener);
        this.pubsubServer.addSubscriptionListener(subscriptionsListener);
        const cleanup = () => {
            this.pubsubServer.removeMessageListener(messageListener);
            this.pubsubServer.removeSubscriptionListener(subscriptionsListener);
            unsubscribeFirestore();
            this.pubsubServer.destroy();
        };
        this.cleanups.add(cleanup);
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            this.cleanups.forEach((fn) => fn());
            callback();
        }
        catch (e) {
            callback();
        }
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        if (state) {
            this.pubsubServer.publish(id, { state: state.val });
        }
    }
}
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options) => new WebrtcPubsub(options);
}
else {
    // otherwise start the instance directly
    (() => new WebrtcPubsub())();
}
