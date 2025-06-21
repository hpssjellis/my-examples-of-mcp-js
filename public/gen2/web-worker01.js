// web-worker.js
// This script runs as a Web Worker for both LLM and IMU agents.
// It cannot directly access the DOM or window.opener.
// It communicates with its parent page via postMessage.

let myAgentType = null;     // To store whether it's an 'llm' or 'imu' worker
let myAgentName = "Worker"; // To store the agent's provided name
let myIntervalId = null;    // To store the interval ID for clearing later if needed

/**
 * Handles messages sent to the worker.
 * The first message is expected to set the agent type and name.
 * @param {MessageEvent} myEvent - The message event object from the parent page.
 */
self.onmessage = async function(myEvent) {
    if (myEvent.data && myEvent.data.type === 'init_agent') {
        myAgentType = myEvent.data.agentType;
        myAgentName = myEvent.data.agentName || "Worker"; // Use provided name or default
        console.log(`My: Web Worker initialized for agent type: ${myAgentType}, name: ${myAgentName}`);

        // If an interval is already running, clear it before starting a new one
        if (myIntervalId) {
            clearInterval(myIntervalId);
        }

        // Start sending fake chat messages every 2 minutes (120,000 milliseconds)
        myIntervalId = setInterval(async () => {
            let myFakeMessage = '';
            if (myAgentType === 'llm') {
                myFakeMessage = `Fake LLM response.`;
            } else if (myAgentType === 'imu') {
                myFakeMessage = `Fake IMU data.`;
            } else {
                myFakeMessage = `Unknown agent type message.`;
            }
            // Add current time for context
            myFakeMessage += ` Current time: ${new Date().toLocaleTimeString()}`;

            // Send the fake message back to the parent page (llm-agent.html or imu-agent.html)
            self.postMessage(myFakeMessage);
        }, 120000); // 2 minutes

    } else {
        console.warn('My: Web Worker received unknown message:', myEvent.data);
    }
};

console.log('My: Combined Web Worker script loaded.');
