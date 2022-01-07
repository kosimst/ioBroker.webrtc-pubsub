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
            iceCandidatePoolSize: 10,
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

                    this.log.info(`New connection request "${connectionId}"`);

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
            this.log.info(`New message "${topic}: ${state}"`);

            if (!isSupportedState(state)) return;

            this.setForeignState(topic, state);
        };
        const subscriptionsListener: SubscriptionListener = async (operation, topics) => {
            if (operation) {
                for (const topic of topics) {
                    const currentState = await this.getForeignStateAsync(topic);
                    if (!currentState) continue;
                    const { val } = currentState;
                    this.pubsubServer.publish(topic, { state: val });
                }
            }

            const newSubscribedStates = new Set(topics);
            const currentSubscribedStates = new Set(this.subscribedStates);

            const diff = new Set([...currentSubscribedStates].filter((topic) => !newSubscribedStates.has(topic)));

            for (const topic of diff) {
                if (operation === 'subscribe') {
                    this.subscribedStates.add(topic);
                    this.subscribeForeignStatesAsync(topic);
                } else {
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

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (state) {
            this.pubsubServer.publish(id, { state: state.val });
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  */
    // private onMessage(obj: ioBroker.Message): void {
    //     if (typeof obj === 'object' && obj.message) {
    //         if (obj.command === 'send') {
    //             // e.g. send email or pushover or whatever
    //             this.log.info('send command');

    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    //         }
    //     }
    // }
}

if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new WebrtcPubsub(options);
} else {
    // otherwise start the instance directly
    (() => new WebrtcPubsub())();
}
