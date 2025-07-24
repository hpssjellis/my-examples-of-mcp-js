// web-worker.js
// This script runs as a Web Worker. It now primarily serves as a placeholder
// or for future offloaded tasks. It no longer generates random messages.
// It communicates only with its parent page.

let myAgentType = null;
let myAgentName = "Worker";

/**
 * Handles messages sent to the worker.
 * The first message is expected to set the agent type and name.
 * @param {MessageEvent} myEvent - The message event object from the parent page.
 */
self.onmessage = async function(myEvent) {
    if (myEvent.data && myEvent.data.type === 'init_agent') {
        myAgentType = myEvent.data.agentType;
        myAgentName = myEvent.data.agentName || "Worker";
        console.log(`My: Web Worker initialized for agent type: ${myAgentType}, name: ${myAgentName}`);
        // Send a confirmation back to the parent page that the worker is ready.
        self.postMessage(`Web Worker for ${myAgentName} is ready.`);
    } else {
        console.warn('My: Web Worker received unknown message:', myEvent.data);
    }
};

console.log('My: Combined Web Worker script loaded.');
