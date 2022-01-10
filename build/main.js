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
            webRTCConfig: JSON.parse(this.config.serviceAccount),
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
                credential: firebase.credential.cert({
                    type: 'service_account',
                    project_id: 'iobroker-pubsub',
                    private_key_id: '979694b1967563f37174d161cc276b1ac1e49166',
                    private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCeRhF23PGh8CCj\nk3ajeIIKMGAyWCrH90ftgVBcTdTTM50UpbW9Kc0Es8AQZxgEUS2Uh/+b+slocFbR\nXyU2ENsQlhnYpJA+xohbQkNOktRgSa3ajaNCVuvJO/9jRQKb7b7V/yV7ichnp7NS\nVKy6HAiM0RvuGt8XzKqlFcoqt/cTScbV7T/BeWsD1vlrHjQrj18PmhpHx/1bBOrw\nhysLhAyGq0UnG+hSTAQvkmUTLbXnmwTCmVtlvJ1gFzG0GF8qX+nqA+o7E1+BCPwx\np/jrKYo2dIFHWsgfQIOPEbhHYVeFe/UZS1CSihoa8C1Q1atUGYEJ4CwurznmoSVS\n7YE0x5vDAgMBAAECggEAGNHUakcyjdpPRqeDdWtv5QjPWlsQy7k06oNFUVGT5tIo\nt19XFRoUKuvEhNijNQYajONuIOKJKVtjL0O+3PAevPFKOKVxyKOvKAnHmUTq5fXt\nO/Z1xsZFBRJnYFn8PeyLPm6w942p7iCnvROcieDchwyXAdXtQdkCsjmtBtmWIXbI\neO9y0Gpe7NmoEwtq4mW3dyjKk8CBnHzs3esSVXP+g6DR9lqggaQDl6A/YwgPvFeJ\nzvxa+8a/4bnQNtb3FhMRu5RieKnixmO6wSiQ/oJR1WgJaGroYBNJuVoJhUm15lvo\nYrYxsdqsQPHAZumseQfnFz6VS7vkcad07KzyHF/gPQKBgQDabzDuvHeic8wd+rfh\n4CP/F7lrPT/PxxfeDKNFahcwWFMQcDtsCYbTcTM4JrQHEofsjMouYwYGHAKSxyGX\nsTonVpmbCutU5Kb9IGnfSCtMEQrAdiFPoanEG459RYjGxB3vcu5j0WA8t4t4Awka\nkAGI9ZiGCV5lkx4E94iuIgRJhQKBgQC5fj1iKjaQAhwUc7zfITY2gmS8bdC5+gq7\n1po8ufDINoPO0k3lYjPULzZJPB3hWwPSPRIL35fdeFcUwbMp+Rqr+qiPr6bCECmW\n0tHH+Q5miirVAOTCIL4bGTJHCvtlluWmEIviyQz7zMklwzAS57ranrXpCWZdC6V4\nebypObrupwKBgQDNIeLIMMIBE9I6zTtmqkHjy/nbVffZPtWRODkUdR81zZykMWH8\nga3WX9aEAwTKJ4LyiP1ONrxvfFqGUO+hL1S3oMI8MjLy1JBl4szKXVIb6103hTif\nOejePCrCRky+rWqXdk2d/ADuxEf7+o3QHjDy2AHWznGR3mkwrO306gkwqQKBgQCI\nJg+aCM/pnZLMtDKyN+dZ1RVpdNUaXFwaiSbGYdhIrDLM0HHaZt0R5eFbmaN48Fv6\nqVagnmoSZazNEGuX6D5acu3cIRouILzV9kGCHN0kCE/t7ez6TBwdOb48hOQHKd2/\nqS9zswwzmZkefYjAp5PvuUReGscmjlDS/8+pCjWZywKBgQDGcvDWN6zEIVWFE7sm\niW3RsgiIWYKk7H8ed0JZIzylm/LwVoS8kMfEVtC601DRBag96Jt9HX/gskh/rDqe\nSgA8Y1Ahfq7cJS/Fa1sSLccSCxvF8HSbqmmAHBz07Z3wqTxd60RTJyvw9YnIePON\nCK8sn8+p87SV5KxpzG6uO5V/Gw==\n-----END PRIVATE KEY-----\n',
                    client_email: 'firebase-adminsdk-xc2t2@iobroker-pubsub.iam.gserviceaccount.com',
                    client_id: '100595837461968176262',
                    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
                    token_uri: 'https://oauth2.googleapis.com/token',
                    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
                    client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xc2t2%40iobroker-pubsub.iam.gserviceaccount.com',
                }),
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
