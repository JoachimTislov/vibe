/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from '@google/genai';
import JSZip from 'jszip';
import React, { useCallback, useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// --- TYPE DEFINITIONS ---
interface FileObject {
  name: string;
  content: string;
}

interface Message {
  id: number;
  type: 'user' | 'ai';
  prompt?: string;
  inputFiles?: FileObject[];
  explanation?: string;
  outputFiles?: FileObject[];
  isLoading?: boolean;
  error?: string | null;
}

// --- SVG ICONS ---
const AttachmentIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.59a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
  </svg>
);

const SendIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
        <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
);

const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
    </svg>
);

// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
  const [currentInputFiles, setCurrentInputFiles] = useState<FileObject[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const fileReadPromises = files.map(file => {
        return new Promise<FileObject>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({ name: file.name, content: reader.result as string });
          };
          reader.onerror = reject;
          reader.readAsText(file);
        });
      });

      Promise.all(fileReadPromises).then(newFiles => {
        setCurrentInputFiles(prevFiles => [...prevFiles, ...newFiles]);
      });
      // Reset file input to allow uploading the same file again
      if(e.target) e.target.value = '';
    }
  };

  const removeFile = (fileName: string) => {
    setCurrentInputFiles(prev => prev.filter(f => f.name !== fileName));
  };
  
  const constructFullPrompt = useCallback((promptText: string, files: FileObject[]) => {
    const filesString = files
      .map(file => `// FILE: ${file.name}\n\`\`\`\n${file.content}\n\`\`\``)
      .join('\n\n');

    return `PROMPT:
${promptText}

--- EXISTING FILES ---
${filesString}
`;
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim() && currentInputFiles.length === 0) return;

    setIsGenerating(true);

    const userMessage: Message = {
        id: Date.now(),
        type: 'user',
        prompt,
        inputFiles: currentInputFiles,
    };

    const aiMessage: Message = {
        id: Date.now() + 1,
        type: 'ai',
        isLoading: true,
    };
    
    setMessages(prev => [...prev, userMessage, aiMessage]);
    const promptForApi = prompt;
    const filesForApi = currentInputFiles;
    
    setPrompt('');
    setCurrentInputFiles([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const fullPrompt = constructFullPrompt(promptForApi, filesForApi);

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: {
          systemInstruction:
            'You are an expert software engineer. The user will provide you with a set of existing files and a prompt describing the changes they want. Your task is to first provide a textual explanation of the changes you are about to make, and then return a complete, updated set of files for the application. You must return the response in a JSON format that adheres to the provided schema. The JSON object should contain an `explanation` string and a `files` array, where each object in the array represents a file with its `filename` and `content`. Do not skip any files, return all files that make up the application.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
                explanation: {
                  type: Type.STRING,
                  description: "A detailed explanation of the changes made to the files."
                },
                files: {
                  type: Type.ARRAY,
                  description: "The complete set of updated or new files for the application.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      filename: { type: Type.STRING },
                      content: { type: Type.STRING },
                    },
                    required: ['filename', 'content'],
                  },
                }
            },
            required: ['explanation', 'files'],
          },
        },
      });

      const responseText = response.text.trim();
      const parsedResponse = JSON.parse(responseText);
      const explanation = parsedResponse.explanation || '';
      const parsedFiles = parsedResponse.files || [];
      
      const formattedFiles = parsedFiles.map((file: {filename: string, content: string}) => ({
        name: file.filename,
        content: file.content
      }));

      setMessages(prev => prev.map(msg => msg.id === aiMessage.id ? { ...msg, isLoading: false, outputFiles: formattedFiles, explanation: explanation } : msg));

    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(e);
      setMessages(prev => prev.map(msg => msg.id === aiMessage.id ? { ...msg, isLoading: false, error: `An error occurred: ${errorMsg}` } : msg));
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadFile = (file: FileObject) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllAsZip = (files: FileObject[]) => {
    if (files.length === 0) return;
    const zip = new JSZip();
    files.forEach(file => {
      zip.file(file.name, file.content);
    });
    zip.generateAsync({ type: 'blob' }).then(content => {
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'application.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-200 font-sans">
        <header className="p-4 border-b border-gray-700 shadow-md">
            <h1 className="text-xl font-bold text-center">AI Application Generator</h1>
        </header>

        <main className="flex-1 overflow-y-auto p-4 space-y-8">
            {messages.length === 0 && (
                <div className="text-center text-gray-400 mt-8">
                    <h2 className="text-2xl font-semibold">Welcome!</h2>
                    <p className="mt-2">Start by attaching files and describing the changes you want to make.</p>
                </div>
            )}
            {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-2xl w-full">
                        <div className={`rounded-lg p-4 ${msg.type === 'user' ? 'bg-blue-900/50' : 'bg-gray-800'}`}>
                            {msg.type === 'user' && (
                                <>
                                    {msg.inputFiles && msg.inputFiles.length > 0 && (
                                        <div className="mb-2">
                                            <h3 className="font-semibold text-gray-300 mb-2 border-b border-gray-600 pb-1">Attached Files:</h3>
                                            <ul className="text-sm space-y-1 font-mono">
                                                {msg.inputFiles.map(f => <li key={f.name} className="text-gray-400">{f.name}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    <p className="whitespace-pre-wrap">{msg.prompt}</p>
                                </>
                            )}
                            {msg.type === 'ai' && (
                                <>
                                    {msg.isLoading && <div className="flex justify-center items-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400"></div></div>}
                                    {msg.error && <div className="text-red-400 bg-red-900/50 p-3 rounded">{msg.error}</div>}
                                    {!msg.isLoading && !msg.error && (
                                        <>
                                            {msg.explanation && (
                                                <div className="text-gray-300 whitespace-pre-wrap mb-4">
                                                    {msg.explanation}
                                                </div>
                                            )}
                                            {msg.outputFiles && msg.outputFiles.length > 0 && (
                                                <div className={msg.explanation ? "pt-4 border-t border-gray-700" : ""}>
                                                    <div className="flex justify-between items-center mb-3">
                                                        <h3 className="font-semibold text-gray-300">Generated Files:</h3>
                                                        <button onClick={() => downloadAllAsZip(msg.outputFiles!)} className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-1 px-3 rounded-md transition-colors">
                                                            Download All (.zip)
                                                        </button>
                                                    </div>
                                                    <ul className="space-y-2 font-mono">
                                                        {msg.outputFiles.map(file => (
                                                            <li key={file.name} className="flex justify-between items-center bg-gray-700 p-2 rounded-md">
                                                                <span className="text-sm text-gray-300 truncate pr-2">{file.name}</span>
                                                                <button onClick={() => downloadFile(file)} className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                                                                    <DownloadIcon />
                                                                    Download
                                                                </button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ))}
            <div ref={messagesEndRef} />
        </main>
        
        <footer className="p-4 bg-gray-800/80 backdrop-blur-sm border-t border-gray-700">
            <div className="max-w-2xl mx-auto">
                {currentInputFiles.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                        {currentInputFiles.map(file => (
                            <div key={file.name} className="inline-flex items-center bg-gray-700 rounded-full px-3 py-1 text-sm font-mono">
                                <span>{file.name}</span>
                                <button onClick={() => removeFile(file.name)} className="ml-2 text-gray-400 hover:text-white"> &times; </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex items-start bg-gray-700 rounded-lg p-2">
                    <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-gray-600 rounded-full transition-colors self-center">
                        <AttachmentIcon />
                    </button>
                    <input id="file-upload" type="file" multiple onChange={handleFileChange} ref={fileInputRef} className="hidden" />
                    <textarea
                        ref={textareaRef}
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        onKeyDown={e => {if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate();}}}
                        placeholder="Describe the changes or new features..."
                        aria-label="Prompt for AI"
                        rows={1}
                        className="flex-1 bg-transparent p-2 text-gray-200 placeholder-gray-400 focus:outline-none resize-none max-h-40"
                    />
                    <button onClick={handleGenerate} disabled={isGenerating || (!prompt.trim() && currentInputFiles.length === 0)} className="p-2 bg-indigo-600 rounded-full disabled:bg-gray-500 disabled:cursor-not-allowed hover:bg-indigo-500 transition-colors self-end">
                        <SendIcon />
                    </button>
                </div>
            </div>
        </footer>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
