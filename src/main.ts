/*
 * Created with @iobroker/create-adapter v1.31.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import * as firebase from 'firebase-admin';
import WebRTCPubSubServer from 'webrtc-pubsub-server';
import { MessageListener, SubscriptionListener } from 'webrtc-pubsub-server/types';
// Load your modules here, e.g.:
// import * as fs from "fs";

type CleanUpFn = () => void;

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

function isSupportedState(state: any): state is boolean | number | string {
    return typeof state === 'boolean' || typeof state === 'number' || typeof state === 'string';
}

function assertServiceAccount(obj: any): asserts obj is firebase.ServiceAccount {
    const hasAllRequiredKeys = requiredServiceAccountKeys.every((key) => key in obj);

    if (!hasAllRequiredKeys) {
        throw new Error('Invalid service account');
    }
}

class WebrtcPubsub extends utils.Adapter {
    private cleanups = new Set<CleanUpFn>();
    private pubsubServer = new WebRTCPubSubServer({
        webRTCConfig: {
            iceServers: [
                {
                    urls: 'turn:relay.backups.cz',
                    credential: 'webrtc',
                    username: 'webrtc',
                },
                {
                    urls: 'turn:numb.viagenie.ca',
                    credential: 'muazkh',
                    username: 'webrtc@live.com',
                },
            ],
        },
    });
    private subscribedStates = new Set<string>();

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'webrtc-pubsub',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        const { serviceAccount } = this.config;
        if (!serviceAccount) {
            this.log.error('No Service account defined');
            return;
        }

        let parsedServiceAccount;

        try {
            parsedServiceAccount = JSON.parse(serviceAccount);
            assertServiceAccount(parsedServiceAccount);
        } catch (e: any) {
            this.log.error(`Failed to parse service account: ${e?.message || e}`);
            return;
        }

        try {
            firebase.initializeApp({
                credential: firebase.credential.cert(parsedServiceAccount!),
            });
        } catch (e: any) {
            this.log.error(`Failed to initialize firebase: ${e?.message || e}`);
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

        const messageListener: MessageListener = (topic, { state }) => {
            if (!isSupportedState(state)) return;

            this.setForeignState(topic, state);
        };
        const subscriptionsListener: SubscriptionListener = async (operation, topics) => {
            if (operation === 'subscribe') {
                for (const topic of topics) {
                    const currentState = await this.getForeignStateAsync(topic);
                    if (!currentState) continue;
                    const { val } = currentState;
                    this.pubsubServer.publish(topic, { state: val });

                    if (this.subscribedStates.has(topic)) continue;

                    this.subscribedStates.add(topic);
                    this.subscribeForeignStatesAsync(topic);
                }
            } else {
                for (const topic of topics) {
                    if (this.pubsubServer.subscribedTopics.has(topic) || !this.subscribedStates.has(topic)) continue;

                    this.subscribedStates.delete(topic);
                    this.unsubscribeForeignStatesAsync(topic);
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
    private onUnload(callback: () => void): void {
        try {
            this.cleanups.forEach((fn) => fn());
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (state) {
            this.pubsubServer.publish(id, { state: state.val });
        }
    }
}

if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new WebrtcPubsub(options);
} else {
    // otherwise start the instance directly
    (() => new WebrtcPubsub())();
}
