import React, { useState, useRef, useEffect } from 'react';
import { streamContent, ChatMessage, createLiveSession } from './services/geminiService';
import { Part, LiveSession } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { Spinner } from './components/Spinner';
import { PaperAirplaneIcon } from './components/icons/PaperAirplaneIcon';
import { ArrowUpTrayIcon } from './components/icons/ArrowUpTrayIcon';
import { ComputerDesktopIcon } from './components/icons/ComputerDesktopIcon';
import { DocumentMagnifyingGlassIcon } from './components/icons/DocumentMagnifyingGlassIcon';
import { GlobeAltIcon } from './components/icons/GlobeAltIcon';
import { HandRaisedIcon } from './components/icons/HandRaisedIcon';
import { MicrophoneIcon } from './components/icons/MicrophoneIcon';
import { StopIcon } from './components/icons/StopIcon';

const App: React.FC = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'model',
            parts: [{ text: 'سلام! من دستیار هوشمند شما هستم. می‌توانم به اینترنت دسترسی داشته باشم، به صدای شما گوش دهم و صفحه شما را ببینم. چطور می‌توانم کمکتان کنم؟' }],
        }
    ]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('');
    const [uploadedImage, setUploadedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // State for live session
    const [isSessionActive, setIsSessionActive] = useState(false);
    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const screenIntervalRef = useRef<number | null>(null);
    const videoRef = useRef<HTMLVideoElement>(document.createElement('video'));
    const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));


    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setUploadedImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = (error) => reject(error);
        });
    };

    const handleSubmit = async (currentPrompt: string) => {
        if ((!currentPrompt || !currentPrompt.trim()) && !uploadedImage) return;
        if (isSessionActive) return;

        setIsLoading(true);
        setError(null);

        const userParts: Part[] = [];

        if (uploadedImage) {
            try {
                const base64Image = await fileToBase64(uploadedImage);
                userParts.push({
                    inlineData: {
                        mimeType: uploadedImage.type,
                        data: base64Image,
                    },
                });
            } catch (e) {
                setError('خطا در پردازش تصویر.');
                setIsLoading(false);
                return;
            }
        }

        if (currentPrompt && currentPrompt.trim()) {
            userParts.push({ text: currentPrompt.trim() });
        }

        const newMessages: ChatMessage[] = [
            ...messages,
            { role: 'user', parts: userParts },
        ];
        setMessages(newMessages);
        setPrompt('');
        setUploadedImage(null);
        setImagePreview(null);
        
        setMessages(prev => [...prev, { role: 'model', parts: [{ text: '' }], citations: [] }]);

        try {
            const history = newMessages.slice(0, -1);
            const model = 'gemini-2.5-flash';
            const stream = await streamContent(model, history, userParts);

            let fullResponse = '';
            for await (const chunk of stream) {
                const chunkText = chunk.text;
                fullResponse += chunkText;
                
                const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
                const citations = groundingMetadata?.groundingChunks;

                setMessages(prev => {
                    const lastMessage = prev[prev.length - 1];
                    const updatedLastMessage = {
                        ...lastMessage,
                        parts: [{ text: fullResponse }],
                        citations: citations || lastMessage.citations,
                    };
                    return [...prev.slice(0, -1), updatedLastMessage];
                });
            }
        } catch (e: any) {
            setError(e.message || 'یک خطای ناشناخته رخ داد.');
            setMessages(prev => {
                const lastMessage = prev[prev.length - 1];
                if (lastMessage.role === 'model' && lastMessage.parts.every(p => !p.text)) {
                    return prev.slice(0, -1);
                }
                return prev;
            });
        } finally {
            setIsLoading(false);
        }
    };

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };
    
    const handleToggleSession = async () => {
        if (isSessionActive) {
            // Stop session
            if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(session => session.close());
                sessionPromiseRef.current = null;
            }
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
                mediaStreamRef.current = null;
            }
            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach(track => track.stop());
                screenStreamRef.current = null;
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            if(scriptProcessorRef.current) {
                scriptProcessorRef.current.disconnect();
                scriptProcessorRef.current = null;
            }
            if(screenIntervalRef.current) {
                clearInterval(screenIntervalRef.current);
                screenIntervalRef.current = null;
            }
            setIsSessionActive(false);
        } else {
            // Start session
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaStreamRef.current = audioStream;
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                screenStreamRef.current = screenStream;

                videoRef.current.srcObject = screenStream;
                videoRef.current.play();

                setIsSessionActive(true);
                setError(null);

                let currentUserTranscription = '';
                let currentModelTranscription = '';

                sessionPromiseRef.current = createLiveSession(
                  (transcription, isFinal, isUser) => {
                    // Update UI with transcription
                    setMessages(prev => {
                        const last = prev[prev.length-1];
                        let currentText = '';
                        if (isUser) {
                           currentUserTranscription = isFinal ? '' : transcription;
                           currentText = currentUserTranscription;
                        } else {
                           currentModelTranscription = isFinal ? '' : transcription;
                           currentText = currentModelTranscription;
                        }

                        if(last.role === (isUser ? 'user' : 'model')) {
                           const updatedLast = {...last, parts: [{text: currentText}]};
                           return [...prev.slice(0, -1), updatedLast];
                        } else {
                           return [...prev, {role: isUser ? 'user' : 'model', parts: [{text: currentText}]}];
                        }
                    });
                });
                
                // Audio processing
                // FIX: Cast window to `any` to allow access to the vendor-prefixed `webkitAudioContext` for broader browser compatibility.
                const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                audioContextRef.current = context;
                const source = context.createMediaStreamSource(audioStream);
                const processor = context.createScriptProcessor(4096, 1, 1);
                scriptProcessorRef.current = processor;
                
                processor.onaudioprocess = (e) => {
                    const inputData = e.inputBuffer.getChannelData(0);
                    sessionPromiseRef.current?.then(session => session.sendAudio(inputData));
                };
                source.connect(processor);
                processor.connect(context.destination);

                // Screen processing
                const ctx = canvasRef.current.getContext('2d');
                screenIntervalRef.current = window.setInterval(() => {
                    const video = videoRef.current;
                    if (ctx && video.readyState >= 2) {
                        canvasRef.current.width = video.videoWidth;
                        canvasRef.current.height = video.videoHeight;
                        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                        canvasRef.current.toBlob(async (blob) => {
                            if (blob) {
                                const base64 = await blobToBase64(blob);
                                sessionPromiseRef.current?.then(session => session.sendImage(base64));
                            }
                        }, 'image/jpeg', 0.5);
                    }
                }, 1000); // Send frame every second


            } catch (err) {
                console.error(err);
                setError('دسترسی به میکروفون یا صفحه نمایش رد شد. برای استفاده از حالت صوتی، لطفاً در تنظیمات مرورگر خود این دسترسی‌ها را برای این سایت فعال کرده و دوباره امتحان کنید.');
                setIsSessionActive(false);
            }
        }
    };
    
    const handleSuggestion = (suggestion: string) => {
        handleSubmit(suggestion);
    }

    return (
        <div className="flex flex-col h-screen bg-gray-800 text-white font-sans">
            <header className="bg-gray-900 p-4 shadow-md flex items-center">
                <ComputerDesktopIcon className="h-8 w-8 ml-3 text-blue-400" />
                <h1 className="text-xl font-bold">دستیار هوشمند شما</h1>
            </header>

            <main ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-6">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0 text-lg">✨</div>}
                        <div className={`max-w-2xl p-3 rounded-lg prose prose-invert ${msg.role === 'user' ? 'bg-blue-600' : 'bg-gray-700'}`}>
                            {msg.parts.map((part, partIndex) => {
                                if (part.text) {
                                    return <ReactMarkdown key={partIndex}>{part.text}</ReactMarkdown>;
                                }
                                if (part.inlineData) {
                                    const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                                    return <img key={partIndex} src={imageUrl} alt="uploaded content" className="max-w-xs rounded-lg" />;
                                }
                                return null;
                            })}
                             {msg.citations && msg.citations.length > 0 && (
                                <div className="mt-4 pt-2 border-t border-gray-500">
                                    <h4 className="text-xs font-bold text-gray-400 mb-2">منابع:</h4>
                                    <ul className="list-disc pr-5 space-y-1">
                                        {msg.citations.map((citation, idx) => (
                                            citation.web && (
                                                <li key={idx} className="text-sm">
                                                    <a href={citation.web.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                                                        {citation.web.title || citation.web.uri}
                                                    </a>
                                                </li>
                                            )
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {isLoading && index === messages.length - 1 && msg.role === 'model' && msg.parts.every(p => !p.text) && (
                                <Spinner />
                            )}
                        </div>
                        {msg.role === 'user' && <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 text-lg">👤</div>}
                    </div>
                ))}
            </main>

            <footer className="bg-gray-900 p-4">
                {error && <p className="text-red-500 text-center mb-2">{error}</p>}
                
                {imagePreview && (
                    <div className="relative w-32 mb-2">
                        <img src={imagePreview} alt="upload preview" className="rounded-lg" />
                        <button
                            onClick={() => {
                                setUploadedImage(null);
                                setImagePreview(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="absolute top-0 right-0 bg-red-600 text-white rounded-full h-6 w-6 flex items-center justify-center -mt-2 -mr-2"
                        >
                            &times;
                        </button>
                    </div>
                )}

                {!isSessionActive && (
                    <div className="flex items-center space-x-2 space-x-reverse mb-2">
                        <button onClick={() => handleSuggestion('این صفحه را برایم خلاصه کن')} className="flex items-center space-x-1 space-x-reverse px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-full text-sm">
                            <DocumentMagnifyingGlassIcon className="h-4 w-4" />
                            <span>خلاصه کن</span>
                        </button>
                        <button onClick={() => handleSuggestion('در اینترنت جستجو کن:')} className="flex items-center space-x-1 space-x-reverse px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-full text-sm">
                            <GlobeAltIcon className="h-4 w-4" />
                            <span>جستجوی وب</span>
                        </button>
                        <button onClick={() => handleSuggestion('برای انجام این کار به من کمک کن:')} className="flex items-center space-x-1 space-x-reverse px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-full text-sm">
                            <HandRaisedIcon className="h-4 w-4" />
                            <span>راهنمایی کن</span>
                        </button>
                    </div>
                )}


                <div className="flex items-start bg-gray-700 rounded-lg p-2">
                    {!isSessionActive && (
                        <>
                            <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); handleSubmit(prompt); }}
                                disabled={isLoading || (!prompt.trim() && !uploadedImage)}
                                className="p-2 text-gray-400 hover:text-white disabled:opacity-50"
                                aria-label="ارسال پیام"
                            >
                                {isLoading ? <Spinner /> : <PaperAirplaneIcon className="h-6 w-6" />}
                            </button>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit(prompt);
                                    }
                                }}
                                onInput={(e) => {
                                    const target = e.currentTarget;
                                    target.style.height = 'auto';
                                    target.style.height = `${target.scrollHeight}px`;
                                }}
                                placeholder="پیام خود را تایپ کنید یا یک تصویر آپلود نمایید..."
                                className="flex-1 bg-transparent text-white focus:outline-none resize-none max-h-48 text-right"
                                rows={1}
                            />
                             <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2 text-gray-400 hover:text-white"
                                aria-label="آپلود تصویر"
                            >
                                <ArrowUpTrayIcon className="h-6 w-6" />
                            </button>
                             <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept="image/*"
                            />
                        </>
                    )}
                   
                    <button
                        type="button"
                        onClick={handleToggleSession}
                        className={`p-2 ${isSessionActive ? 'text-red-500 animate-pulse' : 'text-gray-400'} hover:text-white`}
                        aria-label={isSessionActive ? 'پایان جلسه' : 'شروع جلسه صوتی'}
                    >
                        {isSessionActive ? <StopIcon className="h-6 w-6" /> : <MicrophoneIcon className="h-6 w-6" />}
                    </button>
                    {isSessionActive && <div className='flex-1 text-center text-gray-400'>در حال گوش دادن... برای پایان کلیک کنید.</div>}
                </div>
            </footer>
        </div>
    );
};

export default App;