// llm-agent.js
// Defines the MyLLM_Agent class for simulated Large Language Model agents.

// This class represents an individual LLM agent, handling its UI and communication with the coordinator.
export class MyLLM_Agent {
    myClientId;
    myClientName = null;
    myIsConnected = false;
    myServer; // Reference to the single coordinator instance
    myLogs = [];
    myConversationHistory = []; // Stores user queries, agent thoughts, tool calls/results, and agent responses
    myUiElements; // References to the dynamically created UI elements for this agent panel

    constructor(myServerInstance, myUiElements) {
        this.myServer = myServerInstance;
        this.myUiElements = myUiElements;
        this.myClientId = `llm-agent-${Math.random().toString(36).substring(2, 9)}`;
        this.myAddLog(`My LLM Agent instance created with ID: ${this.myClientId}`);

        // Event Listeners for dynamically created UI elements
        this.myUiElements.myConnectButton?.addEventListener('click', this.myHandleConnect);
        this.myUiElements.myClientNameInput?.addEventListener('input', this.myUpdateUIForConnectionStatus);
        this.myUiElements.myClientNameInput?.addEventListener('keydown', (myEvent) => {
            if (myEvent.key === 'Enter') {
                myEvent.preventDefault();
                this.myHandleConnect();
            }
        });

        this.myUiElements.mySendQueryButton?.addEventListener('click', this.myHandleSendQuery);
        this.myUiElements.myQueryInput?.addEventListener('input', this.myUpdateUIForConnectionStatus);
        this.myUiElements.myQueryInput?.addEventListener('keydown', (myEvent) => {
            if (myEvent.key === 'Enter') {
                myEvent.preventDefault();
                this.myHandleSendQuery();
            }
        });
        
        this.myUpdateUIForConnectionStatus(); // Set initial UI state
    }

    // Adds a log entry to the agent's log and updates its UI log box
    myAddLog = (myMessage) => {
        const myTimestamp = new Date().toLocaleTimeString();
        const myLogEntry = `[${myTimestamp}] AGENT (${this.myClientName || this.myClientId}): ${myMessage}`;
        this.myLogs.push(myLogEntry);
        if (this.myUiElements.myClientLogsDiv) {
            window.myAppendLog(this.myUiElements.myClientLogsDiv, myLogEntry);
        }
    }

    // Processes incoming messages from the coordinator
    myReceiveMessage = (myMsg) => {
        this.myAddLog(`Received message (${myMsg.type}): ${JSON.stringify(myMsg.payload).substring(0, 50)}...`);

        switch (myMsg.type) {
            case 'COORDINATOR_ACCEPTED_CONNECTION':
                this.myIsConnected = true;
                this.myClientName = myMsg.payload.assignedName;
                this.myAddLog(`Connection successful! Assigned name: ${this.myClientName}`);
                this.myConversationHistory.push({ type: 'system', text: `You are connected as ${this.myClientName}.` });
                this.myUpdateConversationUI();
                this.myUpdateUIForConnectionStatus();
                break;

            case 'COORDINATOR_REJECTED_CONNECTION':
                this.myIsConnected = false;
                this.myClientName = null;
                this.myAddLog(`Connection rejected: ${myMsg.payload.reason}`);
                this.myConversationHistory.push({ type: 'system', text: `Connection rejected: ${myMsg.payload.reason}` });
                this.myUpdateConversationUI();
                this.myUpdateUIForConnectionStatus();
                break;

            case 'COORDINATOR_BROADCAST_MESSAGE':
                this.myConversationHistory.push({
                    type: 'broadcast',
                    sender: myMsg.payload.senderName,
                    text: myMsg.payload.text,
                    timestamp: myMsg.timestamp
                });
                this.myUpdateConversationUI();
                break;

            case 'COORDINATOR_IMAGE_BROADCAST':
                this.myConversationHistory.push({
                    type: 'received_image',
                    sender: myMsg.payload.senderName,
                    imageUrl: myMsg.payload.imageUrl,
                    timestamp: myMsg.timestamp
                });
                this.myUpdateConversationUI();
                break;

            case 'COORDINATOR_IMU_BROADCAST':
                this.myConversationHistory.push({
                    type: 'imu_broadcast',
                    sender: myMsg.payload.senderName,
                    activity: myMsg.payload.activity,
                    duration: myMsg.payload.duration,
                    timestamp: myMsg.timestamp
                });
                this.myUpdateConversationUI();
                break;

            case 'AGENT_THOUGHT':
                this.myConversationHistory.push({ type: 'thought', text: myMsg.payload.thought, timestamp: myMsg.timestamp });
                this.myUpdateConversationUI();
                break;

            case 'TOOL_CALL':
                this.myConversationHistory.push({
                    type: 'tool_call',
                    toolName: myMsg.payload.toolName,
                    parameters: JSON.stringify(myMsg.payload.parameters),
                    timestamp: myMsg.timestamp
                });
                this.myUpdateConversationUI();
                break;

            case 'TOOL_RESULT':
                this.myConversationHistory.push({
                    type: 'tool_result',
                    toolName: myMsg.payload.toolName,
                    result: myMsg.payload.result,
                    timestamp: myMsg.timestamp
                });
                this.myUpdateConversationUI();
                break;

            case 'AGENT_RESPONSE':
                this.myConversationHistory.push({
                    type: 'agent_response',
                    response: myMsg.payload.response,
                    timestamp: myMsg.timestamp
                });
                this.myUpdateConversationUI();
                break;

            case 'COORDINATOR_DISCONNECTED_AGENT':
                if (myMsg.payload.agentId !== this.myClientId) {
                    this.myConversationHistory.push({ type: 'system', text: `${myMsg.payload.agentName} has left the swarm.` });
                    this.myUpdateConversationUI();
                }
                break;

            case 'COORDINATOR_SHUTDOWN':
                if (this.myIsConnected) {
                    this.myIsConnected = false;
                    this.myClientName = null;
                    this.myAddLog(`Coordinator disconnected: ${myMsg.payload.reason}`);
                    this.myConversationHistory.push({ type: 'system', text: `Coordinator disconnected: ${myMsg.payload.reason}` });
                    this.myUpdateConversationUI();
                    this.myUpdateUIForConnectionStatus();
                }
                break;

            default:
                this.myAddLog(`Unhandled message type: ${myMsg.type}`);
                break;
        }
    }

    // Sends a message to the coordinator instance
    mySendMessageToCoordinator = async (myType, myPayload) => {
        this.myAddLog(`Sending message (type: ${myType}): ${JSON.stringify(myPayload).substring(0, 50)}...`);
        if (this.myServer) {
            const myMessage = {
                source: 'agent',
                senderId: this.myClientId,
                type: myType,
                targetId: 'coordinator',
                payload: myPayload,
                timestamp: new Date().toISOString()
            };
            this.myServer.myHandleIncomingClientMessage(myMessage, this);
        } else {
            this.myAddLog(`(CRITICAL ERROR: No server instance available for message type ${myType})`);
        }
    }

    // Handles the 'Connect' button click
    myHandleConnect = async () => {
        const myName = this.myUiElements.myClientNameInput.value.trim();
        if (myName) {
            this.myAddLog(`Attempting to connect as "${myName}"...`);
            await this.mySendMessageToCoordinator('AGENT_CONNECT', { requestedName: myName });
        }
    }

    // Handles the 'Send Query' button click or Enter key press in query input
    myHandleSendQuery = async () => {
        const myQuery = this.myUiElements.myQueryInput.value.trim();
        if (myQuery) {
            await this.mySendMessageToCoordinator('USER_QUERY', { query: myQuery });
            this.myConversationHistory.push({ sender: this.myClientName, text: `You (Agent): "${myQuery}"`, type: 'user_query' });
            this.myUpdateConversationUI();
            this.myUiElements.myQueryInput.value = '';
        }
        this.myUpdateUIForConnectionStatus();
    }

    // Updates the UI elements' states based on connection status and input values
    myUpdateUIForConnectionStatus = () => {
        const { myClientTitle, myConnectionSection, myConversationSection, myClientNameInput, myConnectButton, mySendQueryButton, myQueryInput } = this.myUiElements;

        if (myClientTitle) {
            myClientTitle.textContent = this.myIsConnected ? `My LLM Agent (${this.myClientName})` : `My LLM Agent (Not Connected)`;
        }
        if (myConnectionSection) {
            myConnectionSection.style.display = this.myIsConnected ? 'none' : 'block';
        }
        if (myConversationSection) {
            myConversationSection.style.display = this.myIsConnected ? 'block' : 'none';
        }

        if (myClientNameInput) {
            myClientNameInput.disabled = this.myIsConnected;
        }
        if (myConnectButton) {
            myConnectButton.disabled = this.myIsConnected || (myClientNameInput ? !myClientNameInput.value.trim() : true);
        }
        if (mySendQueryButton) {
            mySendQueryButton.disabled = !this.myIsConnected || (myQueryInput ? !myQueryInput.value.trim() : true);
        }
    }

    // Updates the conversation display area
    myUpdateConversationUI = () => {
        const conversationDiv = this.myUiElements.myClientConversationDiv;
        if (!conversationDiv) return;

        conversationDiv.innerHTML = '';
        this.myConversationHistory.forEach(myMsg => {
            const myP = document.createElement('p');
            myP.classList.add('my-message');
            const myTimestampStr = new Date(myMsg.timestamp || Date.now()).toLocaleTimeString();

            switch (myMsg.type) {
                case 'system':
                    myP.textContent = myMsg.text;
                    break;
                case 'user_query':
                    myP.innerHTML = `<span class="my-sender">${myMsg.sender}:</span> ${myMsg.text} (${myTimestampStr})`;
                    break;
                case 'broadcast':
                    myP.innerHTML = `<span class="my-sender">${myMsg.sender}:</span> ${myMsg.text} (${myTimestampStr})`;
                    break;
                case 'received_image':
                    const img = document.createElement('img');
                    img.src = myMsg.imageUrl;
                    img.alt = `Image from ${myMsg.sender}`;
                    img.onerror = () => {
                        img.src = 'https://placehold.co/300x200/cccccc/333333?text=Image+Load+Error';
                        img.alt = 'Image Load Error';
                    };
                    myP.innerHTML = `<span class="my-sender">${myMsg.sender}:</span> Shared an image! (${myTimestampStr})`;
                    myP.appendChild(img);
                    break;
                case 'imu_broadcast':
                    myP.classList.add('my-imu-broadcast');
                    myP.innerHTML = `<span class="my-sender">IMU Broadcast (${myMsg.sender}):</span> Activity: ${myMsg.activity}, Duration: ${myMsg.duration}s (${myTimestampStr})`;
                    break;
                case 'thought':
                    myP.innerHTML = `<em>Agent Thought: ${myMsg.text}</em> (${myTimestampStr})`;
                    break;
                case 'tool_call':
                    myP.innerHTML = `<strong>Tool Call: ${myMsg.toolName}(${myMsg.parameters})</strong> (${myTimestampStr})`;
                    break;
                case 'tool_result':
                    myP.innerHTML = `<pre>${myMsg.result}</pre>`;
                    break;
                case 'agent_response':
                    myP.innerHTML = `<span class="my-sender">Agent Final Response:</span> ${myMsg.response} (${myTimestampStr})`;
                    break;
                default:
                    myP.textContent = JSON.stringify(myMsg);
                    break;
            }
            conversationDiv.appendChild(myP);
        });
        conversationDiv.scrollTop = conversationDiv.scrollHeight;
    }
}
