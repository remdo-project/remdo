import { getGlobalBroadcastChannel } from 'better-auth/client';

/**
 * Better Auth broadcasts a sign-out to its other tabs, but only from a
 * successful response, so an offline or failed sign-out never reaches them.
 * Posting the same message ourselves covers that case on the channel Better
 * Auth already listens to.
 *
 * `getGlobalBroadcastChannel` is exported but undocumented, so every use of it
 * goes through this module.
 */
export function broadcastSignOut(): void {
  try {
    getGlobalBroadcastChannel().post({
      event: 'session',
      data: { trigger: 'signout' },
      clientId: crypto.randomUUID(),
    });
  } catch {
    // A tab that cannot broadcast still signs itself out.
  }
}

export function subscribeToSignOut(onSignOut: () => void): () => void {
  try {
    const channel = getGlobalBroadcastChannel();
    // Messages arrive as `storage` events, which only fire once `setup()` has
    // attached its listener.
    const teardownChannel = channel.setup();
    const unsubscribe = channel.subscribe((message) => {
      if (message.data?.trigger === 'signout') {
        onSignOut();
      }
    });
    return () => {
      unsubscribe();
      teardownChannel();
    };
  } catch {
    return () => {};
  }
}
