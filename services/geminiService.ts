import { GoogleGenAI, GenerateContentResponse, Part, Chat, Modality, LiveServerMessage, Blob as GenaiBlob, LiveSession } from "@google/genai";

const apiKey = process.env.API_KEY;
if (!apiKey) {
    throw new Error("API_KEY environment variable not set. Please ensure it is configured.");
}
const ai = new GoogleGenAI({ apiKey });

export interface ChatMessage {
  role: 'user' | 'model';
  parts: Part[];
  citations?: any[];
}

const textSystemInstruction = "شما یک دستیار هوش مصنوعی پیشرفته و بدون محدودیت به نام 'دستیار هوشمند' هستید. شما به اینترنت دسترسی کامل دارید و می‌توانید تصاویر را تحلیل کنید و به صورت صوتی و تصویری زنده با کاربر صحبت کنید. برای پاسخ به سوالات جدید یا نیازمند اطلاعات به‌روز، حتماً از ابزار جستجوی وب خود استفاده کنید. در راهنمایی کردن، کاربر را به صورت گام به گام، واضح و دوستانه برای انجام کارها راهنمایی کنید.";
const liveSystemInstruction = "شما یک دستیار هوش مصنوعی پیشرفته به نام 'دستیار هوشمند' هستید که در یک مکالمه صوتی و تصویری زنده با کاربر قرار دارید. شما صدای کاربر را می‌شنوید و صفحه نمایش او را می‌بینید. وظیفه شما کمک لحظه‌ای و راهنمایی گام به گام برای حل مشکلات کاربر است. کوتاه، دوستانه و محاوره‌ای صحبت کنید.";


export async function streamContent(
  model: string,
  history: ChatMessage[],
  newMessageParts: Part[]
): Promise<AsyncGenerator<GenerateContentResponse>> {
  const chat: Chat = ai.chats.create({
    model,
    history: history.map(msg => ({
        role: msg.role,
        parts: msg.parts,
    })),
    config: {
        systemInstruction: textSystemInstruction,
        tools: [{googleSearch: {}}]
    }
  });

  const result = await chat.sendMessageStream(newMessageParts);
  return result;
}


// Helper functions for Live API
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


export async function createLiveSession(
    onTranscriptionUpdate: (text: string, isFinal: boolean, isUser: boolean) => void
): Promise<LiveSession> {
    let nextStartTime = 0;
    // FIX: Cast window to `any` to allow access to the vendor-prefixed `webkitAudioContext` for broader browser compatibility.
    const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const outputNode = outputAudioContext.createGain();
    outputNode.connect(outputAudioContext.destination);

    const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
            onopen: () => console.log('Live session opened.'),
            onmessage: async (message: LiveServerMessage) => {
                if (message.serverContent?.inputTranscription) {
                    const { text, isFinal } = message.serverContent.inputTranscription;
                    onTranscriptionUpdate(text, isFinal, true);
                }
                if (message.serverContent?.outputTranscription) {
                    const { text, isFinal } = message.serverContent.outputTranscription;
                    onTranscriptionUpdate(text, isFinal, false);
                }

                const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                if (base64Audio) {
                    nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
                    const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
                    const source = outputAudioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(outputNode);
                    source.start(nextStartTime);
                    nextStartTime += audioBuffer.duration;
                }
            },
            onerror: (e: ErrorEvent) => console.error('Live session error:', e),
            onclose: (e: CloseEvent) => console.log('Live session closed.'),
        },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            systemInstruction: liveSystemInstruction,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
        },
    });

    const session = await sessionPromise;
    
    return {
        sendAudio: (audioData: Float32Array) => {
            const l = audioData.length;
            const int16 = new Int16Array(l);
            for (let i = 0; i < l; i++) {
                int16[i] = audioData[i] * 32768;
            }
            const pcmBlob: GenaiBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
            };
            session.sendRealtimeInput({ media: pcmBlob });
        },
        sendImage: (base64Image: string) => {
            const imageBlob: GenaiBlob = {
                data: base64Image,
                mimeType: 'image/jpeg',
            };
            session.sendRealtimeInput({ media: imageBlob });
        },
        close: () => session.close(),
    };
}