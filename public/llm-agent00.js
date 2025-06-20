// llm-agent.js
// Defines the MyLLM_Agent class for simulated Large Language Model agents,
// now enhanced with actual LLM loading and generation capabilities using Hugging Face Transformers.

// Import necessary modules from Hugging Face Transformers.
// These are client-side imports, so they need to be accessible via CDN or local setup.
import { pipeline, TextStreamer, InterruptableStoppingCriteria } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';

export class MyLLM_Agent {
    myClientId;
    myClientName = null;
    myIsConnected = false;
    myServer; // Reference to the single coordinator instance
    myLogs = [];
    myConversationHistory = [];
    myUiElements; // References to the dynamically created UI elements for this agent panel

    // LLM-specific properties
    generator; // Hugging Face Transformers pipeline
    streamer = null;
    stoppingCriteria = new InterruptableStoppingCriteria();
    myTimerRender = null; // For MathJax rendering interval
    myContent = ""; // Stores the user's question for the LLM
    myMaxTokens = 512; // Default max tokens
    myDoSample = true; // Default do_sample
    myTopP = 0.9;      // Default top_p
    myTemperature = 0.7; // Default temperature
    myChainOfThought = true; // Default chain_of_thought
    myTopK = 50;       // Default top_k
    myMinLength = 20;  // Default min_length
    myRepetitionPenalty = 1.2; // Default repetition_penalty
    myLengthPenalty = 1.5; // Default length_penalty
    myEarlyStopping = true; // Default early_stopping
    
    // Add startTime here so it's scoped to the agent instance
    startTime = null; 

    constructor(myServerInstance, myUiElements) {
        this.myServer = myServerInstance;
        this.myUiElements = myUiElements;
        this.myClientId = `llm-agent-${Math.random().toString(36).substring(2, 9)}`;
        this.myAddLog(`My LLM Agent instance created with ID: ${this.myClientId}`);

        // Event Listeners for MCP communication
        this.myUiElements.myConnectButton?.addEventListener('click', this.myHandleConnect);
        this.myUiElements.myClientNameInput?.addEventListener('input', this.myUpdateUIForConnectionStatus);
        this.myUiElements.myClientNameInput?.addEventListener('keydown', (myEvent) => {
            if (myEvent.key === 'Enter') {
                myEvent.preventDefault();
                this.myHandleConnect();
            }
        });

        // Event Listeners for LLM functionality
        this.myUiElements.myLoadModelButton?.addEventListener('click', this.myLoadModel);
        this.myUiElements.myAskButton?.addEventListener('click', this.myAskQuestion);
        this.myUiElements.myStopButton?.addEventListener('click', this.myStopGeneration);
        this.myUiElements.myRenderMathButton?.addEventListener('click', this.myRenderMath);
        this.myUiElements.myCopyRenderedButton?.addEventListener('click', this.myCopyRendered);
        this.myUiElements.myCopyRegularButton?.addEventListener('click', this.myCopyRegular);
        this.myUiElements.myClearButton?.addEventListener('click', this.myClearKeepArea);

        // Update UI initially for all elements
        this.myUpdateUIForConnectionStatus();
        this.updateLLMUIState(); // Set initial state for LLM controls
        this.loadHyperparametersFromUI(); // Load initial values from UI
    }

    // Helper to add logs to the agent's specific log area
    myAddLog = (myMessage) => {
        const myTimestamp = new Date().toLocaleTimeString();
        const myLogEntry = `[${myTimestamp}] AGENT (${this.myClientName || this.myClientId}): ${myMessage}`;
        this.myLogs.push(myLogEntry);
        if (this.myUiElements.myClientLogsDiv) {
            window.myAppendLog(this.myUiElements.myClientLogsDiv, myLogEntry);
        }
    }

    // Load hyperparameter values from the UI input elements
    loadHyperparametersFromUI = () => {
        this.myMaxTokens = parseInt(this.myUiElements.myMaxTokensInput?.value) || 512;
        this.myDoSample = this.myUiElements.myDoSampleCheckbox?.checked || false;
        this.myTopP = parseFloat(this.myUiElements.myTopPInput?.value) || 0.9;
        this.myTemperature = parseFloat(this.myUiElements.myTemperatureInput?.value) || 0.7;
        this.myChainOfThought = this.myUiElements.myChainOfThoughtCheckbox?.checked || false;
        this.myTopK = parseInt(this.myUiElements.myTopKInput?.value) || 50;
        this.myMinLength = parseInt(this.myUiElements.myMinLengthInput?.value) || 20;
        this.myRepetitionPenalty = parseFloat(this.myUiElements.myRepetitionPenaltyInput?.value) || 1.2;
        this.myLengthPenalty = parseFloat(this.myUiElements.myLengthPenaltyInput?.value) || 1.5;
        this.myEarlyStopping = this.myUiElements.myEarlyStoppingCheckbox?.checked || false;
    }

    // Updates the LLM-specific UI elements' states
    updateLLMUIState = () => {
        const isModelLoaded = !!this.generator; // True if generator is initialized
        
        if (this.myUiElements.myLoadModelButton) {
            this.myUiElements.myLoadModelButton.disabled = isModelLoaded;
            this.myUiElements.myLoadModelButton.style.backgroundColor = isModelLoaded ? 'gray' : 'lime';
        }
        if (this.myUiElements.myAskButton) {
            this.myUiElements.myAskButton.disabled = !isModelLoaded;
            this.myUiElements.myAskButton.style.backgroundColor = isModelLoaded ? 'lime' : 'gray';
        }
        if (this.myUiElements.myStopButton) {
            this.myUiElements.myStopButton.disabled = true; // Initially disabled until generation starts
        }
    }

    // --- LLM Core Functions (adapted from provided HTML) ---

    async myLoadModel() {
        if (!this.myUiElements.myModelInput) {
            this.myAddLog("Error: Model input element not found.");
            return;
        }
        const modelName = this.myUiElements.myModelInput.value;
        this.myAddLog(`Loading model: ${modelName}...`);

        const progressCallback = (progress) => {
            const myProg = parseInt(progress.progress);
            if (this.myUiElements.myProgressDiv) {
                this.myUiElements.myProgressDiv.textContent = `Loading: ${progress.file} at ${myProg}%`;
            }
        };

        try {
            this.generator = await pipeline("text-generation", modelName, { 
                dtype: "q4f16", 
                device: "webgpu", 
                progress_callback: progressCallback 
            });
            this.myAddLog(`Model ${modelName} loaded successfully.`);
            if (this.myUiElements.myProgressDiv) {
                this.myUiElements.myProgressDiv.textContent = `Loading: Done!`;
            }
        } catch (error) {
            this.myAddLog(`Error loading model: ${error.message}`);
            if (this.myUiElements.myProgressDiv) {
                this.myUiElements.myProgressDiv.textContent = `Error loading model!`;
            }
            console.error("LLM Model Loading Error:", error);
            this.generator = null; // Ensure generator is null on failure
        } finally {
            this.updateLLMUIState();
        }
    }

    async myAskQuestion() {
        if (!this.generator) {
            this.myAddLog("Error: Model not loaded. Please load a model first.");
            return;
        }
        if (!this.myUiElements.myArea01 || !this.myUiElements.myTextarea01) {
            this.myAddLog("Error: Query or response textarea not found.");
            return;
        }

        this.startTime = performance.now();
        this.myTimerRender = setInterval(this.myRenderMath, 3000);
        this.myUiElements.myTextarea01.value = '';
        this.myUiElements.myAskButton.disabled = true;
        this.myUiElements.myStopButton.disabled = false;
        
        this.myContent = this.myUiElements.myArea01.value;
        const messages = [{ role: "user", content: this.myContent }];

        // Load hyperparameters just before generation
        this.loadHyperparametersFromUI();

        let myTemp = "";
        let myCount = 0;
        let myTextarea = this.myUiElements.myTextarea01;

        this.streamer = new TextStreamer(this.generator.tokenizer, {
            skip_prompt: true,
            callback_function: (text) => {
                const currentTime = performance.now();
                const elapsedTime = (currentTime - this.startTime) / 1000;

                myTemp += text;
                myCount++;
                if (myCount >= 5) { // Update textarea every 5 tokens
                    myTextarea.value += myTemp;
                    myTemp = "";
                    myCount = 0;
                    if (document.activeElement !== myTextarea) {
                        myTextarea.scrollTop = myTextarea.scrollHeight;
                    }
                }

                const generatedTokens = myTextarea.value.length;
                const tokensPerSecond = generatedTokens / elapsedTime;
                const progress = parseInt((generatedTokens * 100) / this.myMaxTokens); // Corrected progress calculation
                if (this.myUiElements.myProgressDiv) {
                    this.myUiElements.myProgressDiv.textContent = `Answer progress: ~${progress}%, Tokens per second: ${tokensPerSecond.toFixed(0)}, elapsed time: ${elapsedTime.toFixed(0)} seconds`;
                }

                if (progress >= 100) {
                    this.startTime = null;
                }
            },
        });

        this.stoppingCriteria = new InterruptableStoppingCriteria();

        try {
            const output = await this.generator(messages, {
                max_new_tokens: this.myMaxTokens,
                do_sample: this.myDoSample,
                top_p: this.myTopP,
                temperature: this.myTemperature,
                chain_of_thought: this.myChainOfThought,
                top_k: this.myTopK,
                min_length: this.myMinLength,
                repetition_penalty: this.myRepetitionPenalty,
                length_penalty: this.myLengthPenalty,
                early_stopping: this.myEarlyStopping,
                num_return_sequences: 1,
                streamer: this.streamer,
                stopping_criteria: this.stoppingCriteria,
            });

            if (!this.stoppingCriteria.interrupted) {
                // Ensure remaining text in buffer is appended
                if (myTemp.length > 0) {
                    myTextarea.value += myTemp;
                    myTemp = "";
                }

                let fullReply = output[0].generated_text.at(-1).content;
                let myReply = fullReply.replace(/<think>/g, "").replace(/<\/think>/g, "\r\n\r\nResponse: ").replace(/```/g, "");
                myTextarea.value = `Asking: ${this.myContent}\r\n\r\nAnswer: ${myReply}`;

                // Send the final response to the coordinator
                this.mySendMessageToCoordinator('AGENT_RESPONSE', { response: myReply });
            }

        } catch (error) {
            if (this.stoppingCriteria.interrupted) {
                this.myAddLog('Generation was stopped.');
            } else {
                this.myAddLog(`Error during generation: ${error.message}`);
                console.error('LLM Generation Error:', error);
            }
        } finally {
            clearInterval(this.myTimerRender);
            this.myRenderMath(); // One last render to ensure all MathJax is processed
            this.myUiElements.myAskButton.disabled = false;
            this.myUiElements.myStopButton.disabled = true;
            if (this.myUiElements.myProgressDiv) {
                this.myUiElements.myProgressDiv.textContent = `Generation complete.`;
            }
        }
    }

    myRenderMath = async () => {
        if (!this.myUiElements.myTextarea01 || !this.myUiElements.myMathOutputDiv) return;

        let myMathText = this.myUiElements.myTextarea01.value;
        myMathText = myMathText.replace(/^###\s*(.*)$/gm, "<h2>$1</h2>");
        myMathText = myMathText.replace(/\r\n|\n|\r/g, ' <br> ');
        myMathText = myMathText.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");

        this.myUiElements.myMathOutputDiv.innerHTML = myMathText;

        // MathJax might not be globally available if the HTML doesn't load it.
        // Assuming MathJax is loaded globally via the main HTML for simplicity.
        if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
            await MathJax.typesetPromise([this.myUiElements.myMathOutputDiv]);
        } else {
            this.myAddLog("Warning: MathJax not loaded. Math rendering disabled.");
        }
    }

    myStopGeneration = () => {
        if (this.stoppingCriteria) {
            this.stoppingCriteria.interrupt();
            clearInterval(this.myTimerRender);
            this.myAddLog('Generation stopped by user.');
            if (this.myUiElements.myProgressDiv) {
                this.myUiElements.myProgressDiv.textContent = 'Generation stopped.';
            }
            this.myUiElements.myAskButton.disabled = false;
            this.myUiElements.myStopButton.disabled = true;
        }
    }

    myCopyRendered = () => {
        if (this.myUiElements.myMathOutputDiv) {
            const range = document.createRange();
            range.selectNode(this.myUiElements.myMathOutputDiv);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
            window.getSelection().removeAllRanges(); // Deselect
            this.myAddLog("Copied rendered output to clipboard.");
        }
    }

    myCopyRegular = () => {
        if (this.myUiElements.myTextarea01 && this.myUiElements.myKeepArea01) {
            this.myUiElements.myTextarea01.select();
            document.execCommand('copy');
            this.myUiElements.myKeepArea01.value += '\r\n\r\n' + this.myUiElements.myTextarea01.value;
            this.myAddLog("Copied raw output to clipboard and appended to history.");
        }
    }

    myClearKeepArea = () => {
        if (this.myUiElements.myKeepArea01) {
            this.myUiElements.myKeepArea01.value = '';
            this.myAddLog("Cleared output history.");
        }
    }


    // --- MCP Communication Functions (original) ---
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
                // This agent received its own response from the coordinator (after processing)
                // Or a response from another agent
                this.myConversationHistory.push({
                    type: 'agent_response',
                    sender: myMsg.senderId === this.myClientId ? this.myClientName : myMsg.senderName,
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

    myHandleConnect = async () => {
        const myName = this.myUiElements.myClientNameInput.value.trim();
        if (myName) {
            this.myAddLog(`Attempting to connect as "${myName}"...`);
            await this.mySendMessageToCoordinator('AGENT_CONNECT', { requestedName: myName });
        }
    }
    
    // Updates the UI elements' states based on connection status and input values
    myUpdateUIForConnectionStatus = () => {
        const { myClientTitle, myConnectionSection, myConversationSection, myClientNameInput, myConnectButton, myQueryInput, mySendQueryButton,
            myLlmSection } = this.myUiElements;

        if (myClientTitle) {
            myClientTitle.textContent = this.myIsConnected ? `My LLM Agent (${this.myClientName})` : `My LLM Agent (Not Connected)`;
        }
        if (myConnectionSection) {
            myConnectionSection.style.display = this.myIsConnected ? 'none' : 'block';
        }
        // Conversation and LLM sections only show if connected
        if (myConversationSection) {
            myConversationSection.style.display = this.myIsConnected ? 'block' : 'none';
        }
        if (myLlmSection) {
            myLlmSection.style.display = this.myIsConnected ? 'block' : 'none';
        }

        if (myClientNameInput) {
            myClientNameInput.disabled = this.myIsConnected;
        }
        if (myConnectButton) {
            myConnectButton.disabled = this.myIsConnected || (myClientNameInput ? !myClientNameInput.value.trim() : true);
        }
        // Query input and send button enabled only if connected AND input has text
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
                        img.src = '[https://placehold.co/300x200/cccccc/333333?text=Image+Load+Error](https://placehold.co/300x200/cccccc/333333?text=Image+Load+Error)';
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
