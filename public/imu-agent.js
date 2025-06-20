// imu-agent.js
// Defines the MyIMU_Agent class for simulated TinyML IMU devices.

// This class simulates an IMU device and its interaction with the real MCP server.
export class MyIMU_Agent {
    myClientId;
    myClientName = null;
    myIsConnected = false;
    myServer; // Reference to the single coordinator instance
    myLogs = [];
    myConversationHistory = [];
    myUiElements;
    myImuIntervalId = null;

    myActivityLabels = [
        'other', 'standing', 'sitting', 'lying down (any direction)',
        'walking', 'jogging', 'running', 'sprinting'
    ];

    constructor(myServerInstance, myUiElements) {
        this.myServer = myServerInstance;
        this.myUiElements = myUiElements;
        this.myClientId = `imu-device-${Math.random().toString(36).substring(2, 9)}`;
        this.myAddLog(`Fake IMU Device instance created with ID: ${this.myClientId}`);

        // Event Listeners for UI elements
        this.myUiElements.myImuConnectButton?.addEventListener('click', this.myHandleConnect);
        this.myUiElements.myImuNameInput?.addEventListener('input', this.myUpdateUIForConnectionStatus);
        this.myUiElements.myImuNameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.myHandleConnect(); }
        });

        this.myUiElements.myStartImuButton?.addEventListener('click', this.startIMUBroadcast);
        this.myUiElements.myStopImuButton?.addEventListener('click', this.stopIMUBroadcast);

        this.myUiElements.myImuSendQueryButton?.addEventListener('click', this.myHandleSendQuery);
        this.myUiElements.myImuQueryInput?.addEventListener('input', this.myUpdateUIForConnectionStatus);
        this.myUiElements.myImuQueryInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.myHandleSendQuery(); }
        });
        
        this.myUpdateUIForConnectionStatus();
    }

    myAddLog = (message) => {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] IMU Device (${this.myClientName || this.myClientId}): ${message}`;
        this.myLogs.push(logEntry);
        if (this.myUiElements.myImuLogsDiv) {
            window.myAppendLog(this.myUiElements.myImuLogsDiv, logEntry);
        }
    }

    myReceiveMessage = (msg) => {
        this.myAddLog(`Received message (${msg.type}): ${JSON.stringify(msg.payload).substring(0, 50)}...`);

        switch (msg.type) {
            case 'COORDINATOR_ACCEPTED_CONNECTION':
                this.myIsConnected = true;
                this.myClientName = msg.payload.assignedName;
                this.myAddLog(`Connection successful! Assigned name: ${this.myClientName}`);
                this.myConversationHistory.push({ type: 'system', text: `Connected as ${this.myClientName}.` });
                this.myUpdateConversationUI();
                this.myUpdateUIForConnectionStatus();
                break;
            case 'COORDINATOR_REJECTED_CONNECTION':
                this.myIsConnected = false;
                this.myClientName = null;
                this.myAddLog(`Connection rejected: ${msg.payload.reason}`);
                this.myConversationHistory.push({ type: 'system', text: `Connection rejected: ${msg.payload.reason}` });
                this.myUpdateConversationUI();
                this.myUpdateUIForConnectionStatus();
                break;
            case 'COORDINATOR_BROADCAST_MESSAGE':
                this.myConversationHistory.push({
                    type: 'broadcast',
                    sender: msg.payload.senderName,
                    text: msg.payload.text,
                    timestamp: msg.timestamp
                });
                this.myUpdateConversationUI();
                break;
            case 'AGENT_RESPONSE': // Response to a query from this IMU device
                this.myConversationHistory.push({
                    type: 'agent_response',
                    response: msg.payload.response,
                    timestamp: msg.timestamp
                });
                this.myUpdateConversationUI();
                break;
            case 'COORDINATOR_IMU_BROADCAST':
                if (msg.payload.senderId !== this.myClientId) { // Only display if it's from another IMU device
                    this.myConversationHistory.push({
                        type: 'imu_broadcast',
                        sender: msg.payload.senderName, // This will now correctly receive the senderName from coordinator
                        activity: msg.payload.activity,
                        duration: msg.payload.duration,
                        timestamp: msg.timestamp
                    });
                    this.myUpdateConversationUI();
                }
                break;
            default:
                this.myAddLog(`Unhandled message type: ${msg.type}`);
                break;
        }
    }

    mySendMessageToCoordinator = async (type, payload) => {
        this.myAddLog(`Sending message (type: ${type}): ${JSON.stringify(payload).substring(0, 50)}...`);

        if (this.myServer) {
            const message = {
                source: 'agent',
                senderId: this.myClientId,
                type: type,
                targetId: 'coordinator',
                payload: payload,
                timestamp: new Date().toISOString()
            };
            this.myServer.myHandleIncomingClientMessage(message, this);
        } else {
            this.myAddLog(`(CRITICAL ERROR: No server instance available for message type ${type})`);
        }
    }

    myHandleConnect = async () => {
        const name = this.myUiElements.myImuNameInput.value.trim();
        if (name) {
            this.myAddLog(`Attempting to connect as "${name}"...`);
            await this.mySendMessageToCoordinator('AGENT_CONNECT', { requestedName: name });
        }
    }

    myHandleSendQuery = async () => {
        const query = this.myUiElements.myImuQueryInput.value.trim();
        if (query) {
            this.myConversationHistory.push({ sender: this.myClientName, text: `You (IMU Device): "${query}"`, type: 'user_query' });
            this.myUpdateConversationUI();
            await this.mySendMessageToCoordinator('USER_QUERY', { query: query });
            this.myUiElements.myImuQueryInput.value = '';
        }
        this.myUpdateUIForConnectionStatus();
    }

    generateRandomActivity = () => {
        const randomIndex = Math.floor(Math.random() * this.myActivityLabels.length);
        return this.myActivityLabels[randomIndex];
    }

    generateRandomDuration = () => {
        const minSeconds = 10;
        const maxSeconds = 8 * 60 * 60; // 8 hours in seconds
        return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
    }

    startIMUBroadcast = () => {
        if (!this.myIsConnected) {
            this.myAddLog("Not connected to coordinator. Cannot start IMU broadcast.");
            return;
        }
        if (this.myImuIntervalId !== null) {
            this.myAddLog("IMU broadcast already running.");
            return;
        }

        this.myAddLog("Starting IMU data broadcast...");
        this.myImuIntervalId = setInterval(this.sendIMUData, 5000); // Broadcast every 5 seconds
        this.myUiElements.myStartImuButton.disabled = true;
        this.myUiElements.myStopImuButton.disabled = false;
    }

    stopIMUBroadcast = () => {
        if (this.myImuIntervalId !== null) {
            clearInterval(this.myImuIntervalId);
            this.myImuIntervalId = null;
            this.myAddLog("Stopped IMU data broadcast.");
            this.myUiElements.myStartImuButton.disabled = false;
            this.myUiElements.myStopImuButton.disabled = true;
        }
    }

    sendIMUData = async () => {
        const activity = this.generateRandomActivity();
        const duration = this.generateRandomDuration();
        this.myAddLog(`Broadcasting IMU data: Activity='${activity}', Duration=${duration}s`);

        // Display in own IMU data box
        this.myUiElements.myImuDataDisplay.innerHTML += `<p class="my-imu-broadcast">Activity: ${activity}, Duration: ${duration}s</p>`;
        this.myUiElements.myImuDataDisplay.scrollTop = this.myUiElements.myImuDataDisplay.scrollHeight;

        // Send to coordinator, explicitly including the client name in the payload
        await this.mySendMessageToCoordinator('IMU_DATA_BROADCAST', {
            activity: activity,
            duration: duration,
            senderName: this.myClientName || this.myClientId // Ensure senderName is always present
        });
    }

    myUpdateUIForConnectionStatus = () => {
        const { myImuTitle, myConnectionSection, myControlsSection, myImuNameInput, myImuConnectButton, myImuSendQueryButton, myImuQueryInput, myStartImuButton, myStopImuButton } = this.myUiElements;

        if (myImuTitle) {
            // Display client name and ID in the title once connected
            myImuTitle.textContent = this.myIsConnected ? 
                `Fake TinyML IMU Device (${this.myClientName || 'Not Connected'}) (ID: ${this.myClientId.substring(0, 8)}...)` : 
                `Fake TinyML IMU Device`;
        }
        if (myConnectionSection) {
            myConnectionSection.style.display = this.myIsConnected ? 'none' : 'block';
        }
        if (myControlsSection) {
            myControlsSection.style.display = this.myIsConnected ? 'block' : 'none';
        }

        if (myImuNameInput) {
            myImuNameInput.disabled = this.myIsConnected;
        }
        if (myImuConnectButton) {
            myImuConnectButton.disabled = this.myIsConnected || (myImuNameInput ? !myImuNameInput.value.trim() : true);
        }
        if (myImuSendQueryButton) {
            myImuSendQueryButton.disabled = !this.myIsConnected || (myImuQueryInput ? !myImuQueryInput.value.trim() : true);
        }

        if (myStartImuButton) {
            myStartImuButton.disabled = !this.myIsConnected || (this.myImuIntervalId !== null);
        }
        if (myStopImuButton) {
            myStopImuButton.disabled = !this.myIsConnected || (this.myImuIntervalId === null);
        }
    }

    myUpdateConversationUI = () => {
        const conversationDiv = this.myUiElements.myImuConversationDiv;
        if (!conversationDiv) return;

        conversationDiv.innerHTML = '';
        this.myConversationHistory.forEach(msg => {
            const p = document.createElement('p');
            const timestampStr = new Date(msg.timestamp || Date.now()).toLocaleTimeString();

            switch (msg.type) {
                case 'system':
                    p.classList.add('my-system-message');
                    p.textContent = msg.text;
                    break;
                case 'user_query':
                    p.innerHTML = `<span class="my-sender">${msg.sender}:</span> ${msg.text} (${timestampStr})`;
                    break;
                case 'broadcast':
                    p.innerHTML = `<span class="my-sender">${msg.sender}:</span> ${msg.text} (${timestampStr})`;
                    break;
                case 'imu_broadcast':
                    p.classList.add('my-imu-broadcast');
                    p.innerHTML = `<span class="my-sender">IMU Broadcast (${msg.sender}):</span> Activity: ${msg.activity}, Duration: ${msg.duration}s (${timestampStr})`;
                    break;
                case 'agent_response':
                    p.innerHTML = `<span class="my-sender">Server Response:</span> ${msg.response} (${timestampStr})`;
                    break;
                default:
                    p.textContent = JSON.stringify(msg);
                    break;
            }
            conversationDiv.appendChild(p);
        });
        conversationDiv.scrollTop = conversationDiv.scrollHeight;
    }
}
