// llm-worker.js
// This script runs in a Shared Web Worker, allowing a single LLM instance
// to be loaded and shared across multiple browser tabs from the same origin.

// Import necessary modules from Hugging Face Transformers.
// These are client-side imports, so they need to be accessible via CDN or local setup.
import { pipeline, TextStreamer, InterruptableStoppingCriteria } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';

let generator = null; // The Hugging Face pipeline instance
let currentStreamer = null; // To manage streaming output
let currentStoppingCriteria = null; // To manage stopping generation
let isModelLoading = false;
let isGenerating = false;

// Map to hold MessagePorts for all connected tabs
const connectedPorts = new Map();

// --- Worker Lifecycle ---
// This event fires when a new tab connects to this Shared Worker.
self.onconnect = (event) => {
    const port = event.ports[0];
    const clientId = `worker-port-${Math.random().toString(36).substring(2, 9)}`; // Unique ID for this port
    connectedPorts.set(clientId, port);

    console.log(`Worker: New connection established. Client ID: ${clientId}`);
    port.postMessage({ type: 'workerConnected', clientId: clientId });

    // Listen for messages from this specific connected tab
    port.onmessage = async (e) => {
        const { type, payload } = e.data;
        // console.log(`Worker: Received message from ${clientId} - Type: ${type}`);

        switch (type) {
            case 'loadModel':
                if (generator || isModelLoading) {
                    port.postMessage({ type: 'error', message: 'Model is already loading or loaded.' });
                    return;
                }
                isModelLoading = true;
                port.postMessage({ type: 'workerStatus', status: 'loading', message: 'Model loading started...' });
                await loadModel(payload.modelName, port);
                isModelLoading = false;
                break;

            case 'askQuestion':
                if (!generator) {
                    port.postMessage({ type: 'error', message: 'Model not loaded. Please load model first.' });
                    return;
                }
                if (isGenerating) {
                    port.postMessage({ type: 'error', message: 'Another generation is in progress. Please wait or stop.' });
                    return;
                }
                isGenerating = true;
                port.postMessage({ type: 'workerStatus', status: 'generating', message: 'Text generation started...' });
                await askQuestion(payload.content, payload.hyperparameters, port);
                isGenerating = false;
                break;

            case 'stopGeneration':
                stopGeneration(port);
                break;

            case 'ping':
                port.postMessage({ type: 'pong' });
                break;

            default:
                console.warn(`Worker: Unknown message type received: ${type}`);
                port.postMessage({ type: 'error', message: `Unknown command: ${type}` });
        }
    };

    // Handle disconnection of a port
    port.onmessageerror = (e) => {
        console.error('Worker: Message Error:', e);
    };

    port.onclose = () => {
        console.log(`Worker: Client ${clientId} disconnected.`);
        connectedPorts.delete(clientId);
        if (connectedPorts.size === 0 && generator) {
            console.log('Worker: All clients disconnected. Considering model unloading (not implemented yet).');
            // Here you might implement logic to unload the model if no clients are connected
            // to free up memory, but it's often better to keep it loaded for quick re-connections.
        }
    };
};

// --- LLM Model Loading Function ---
async function loadModel(modelName, portToRespond) {
    try {
        const progressCallback = (progress) => {
            portToRespond.postMessage({ 
                type: 'progress', 
                data: { 
                    file: progress.file, 
                    progress: parseInt(progress.progress) 
                } 
            });
        };

        generator = await pipeline("text-generation", modelName, { 
            dtype: "q4f16", 
            device: "webgpu", // Ensure WebGPU is used if available
            progress_callback: progressCallback 
        });
        portToRespond.postMessage({ type: 'workerStatus', status: 'loaded', message: `Model ${modelName} loaded.` });
    } catch (error) {
        console.error('Worker: Error loading model:', error);
        portToRespond.postMessage({ type: 'error', message: `Failed to load model: ${error.message}` });
        generator = null; // Ensure generator is null on failure
    }
}

// --- LLM Question Asking Function ---
async function askQuestion(content, hyperparameters, portToRespond) {
    const messages = [{ role: "user", content: content }];

    currentStoppingCriteria = new InterruptableStoppingCriteria();
    currentStreamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        callback_function: (text) => {
            if (currentStoppingCriteria.interrupted) return; // Stop if interrupted

            // Send streamed text back to the specific tab
            portToRespond.postMessage({ type: 'streamData', text: text });
        },
    });

    try {
        const output = await generator(messages, {
            max_new_tokens: hyperparameters.myMaxTokens,
            do_sample: hyperparameters.myDoSample,
            top_p: hyperparameters.myTopP,
            temperature: hyperparameters.myTemperature,
            chain_of_thought: hyperparameters.myChainOfThought,
            top_k: hyperparameters.myTopK,
            min_length: hyperparameters.myMinLength,
            repetition_penalty: hyperparameters.myRepetitionPenalty,
            length_penalty: hyperparameters.myLengthPenalty,
            early_stopping: hyperparameters.myEarlyStopping,
            num_return_sequences: 1,
            streamer: currentStreamer,
            stopping_criteria: currentStoppingCriteria,
        });

        if (!currentStoppingCriteria.interrupted) {
            let fullReply = output[0].generated_text.at(-1).content;
            let myReply = fullReply.replace(/<think>/g, "").replace(/<\/think>/g, "\r\n\r\nResponse: ").replace(/```/g, "");
            portToRespond.postMessage({ type: 'finalResult', result: myReply });
        } else {
            portToRespond.postMessage({ type: 'generationStopped', message: 'Generation stopped by user.' });
        }
    } catch (error) {
        if (currentStoppingCriteria.interrupted) {
            portToRespond.postMessage({ type: 'generationStopped', message: 'Generation interrupted due to error.' });
        } else {
            console.error('Worker: Error during generation:', error);
            portToRespond.postMessage({ type: 'error', message: `Generation failed: ${error.message}` });
        }
    } finally {
        currentStreamer = null;
        currentStoppingCriteria = null;
        portToRespond.postMessage({ type: 'workerStatus', status: 'ready' });
    }
}

// --- LLM Stop Generation Function ---
function stopGeneration(portToRespond) {
    if (currentStoppingCriteria) {
        currentStoppingCriteria.interrupt();
        portToRespond.postMessage({ type: 'generationStopped', message: 'Generation stopped by worker (user request).' });
    } else {
        portToRespond.postMessage({ type: 'info', message: 'No active generation to stop.' });
    }
}

console.log('LLM Shared Web Worker initialized.');
