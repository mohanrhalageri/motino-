import React, { useState, useRef, useCallback, useEffect } from 'react';
import { analyzeMotion, detectObjectsInFrame } from './services/geminiService';
import { AnalysisResult, DetectedObject } from './types';
import Loader from './components/Loader';
import { CameraIcon, StopIcon, AnalyzeIcon, AlertTriangleIcon, TargetIcon } from './components/Icons';

type Mode = 'motion' | 'live';
const DETECTION_INTERVAL_MS = 3000; // 3 seconds
const BOX_COLORS = ['#34D399', '#FBBF24', '#60A5FA', '#F87171', '#A78BFA', '#EC4899'];


const App: React.FC = () => {
    const [mode, setMode] = useState<Mode>('motion');
    const [isCameraOn, setIsCameraOn] = useState<boolean>(false);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [isDetecting, setIsDetecting] = useState<boolean>(false);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [detections, setDetections] = useState<DetectedObject[]>([]);
    const [transientMessage, setTransientMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const detectionIntervalRef = useRef<number | null>(null);
    const transientMessageTimeoutRef = useRef<number | null>(null);


    useEffect(() => {
        return () => {
            if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
            if (transientMessageTimeoutRef.current) clearTimeout(transientMessageTimeoutRef.current);
        };
    }, []);

    const clearState = () => {
        setError(null);
        setAnalysisResult(null);
        setDetections([]);
        setTransientMessage(null);
    };

    const startCamera = async () => {
        clearState();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'environment' 
                } 
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsCameraOn(true);
            }
        } catch (err) {
            console.error("Error accessing camera:", err);
            setError("Could not access the camera. Please ensure permissions are granted and try again.");
            setIsCameraOn(false);
        }
    };

    const stopCamera = () => {
        if (detectionIntervalRef.current) {
            clearInterval(detectionIntervalRef.current);
            detectionIntervalRef.current = null;
        }
        setIsDetecting(false);
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsCameraOn(false);
        clearState();
    };

    const captureFrame = useCallback((): string => {
        if (!videoRef.current || !canvasRef.current) {
            throw new Error("Video or canvas ref not available");
        }
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error("Could not get 2D context from canvas");
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    }, []);

    const handleAnalyzeMotion = async () => {
        if (!isCameraOn) return;
        clearState();
        setIsAnalyzing(true);
        try {
            const frame1 = captureFrame();
            await new Promise(resolve => setTimeout(resolve, 500));
            const frame2 = captureFrame();
            const result = await analyzeMotion(frame1, frame2);
            setAnalysisResult(result);
            setTransientMessage(result.movementDescription);
            if(transientMessageTimeoutRef.current) clearTimeout(transientMessageTimeoutRef.current);
            transientMessageTimeoutRef.current = window.setTimeout(() => setTransientMessage(null), 5000);

        } catch (err) {
            const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
            setError(`Analysis failed: ${msg}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const runLiveDetection = useCallback(async () => {
        if (!isCameraOn || document.hidden) return; // a little performance saving
        try {
            const frame = captureFrame();
            const results = await detectObjectsInFrame(frame);
            setDetections(results);
            setError(null);
        } catch (err) {
             const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
             console.error(`Detection failed: ${msg}`);
             // Don't show a persistent error for transient network issues in live mode
        }
    }, [isCameraOn, captureFrame]);


    const toggleLiveDetection = () => {
        if (isDetecting) {
            if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
            detectionIntervalRef.current = null;
            setIsDetecting(false);
            setDetections([]);
        } else {
            clearState();
            setIsDetecting(true);
            runLiveDetection(); // run immediately
            detectionIntervalRef.current = window.setInterval(runLiveDetection, DETECTION_INTERVAL_MS);
        }
    };
    
    const BoundingBoxOverlay = () => (
        <div className="absolute inset-0 pointer-events-none">
            {detections.map((det, index) => {
                const { x_min, y_min, x_max, y_max } = det.boundingBox;
                const color = BOX_COLORS[index % BOX_COLORS.length];
                const style = {
                    left: `${x_min * 100}%`,
                    top: `${y_min * 100}%`,
                    width: `${(x_max - x_min) * 100}%`,
                    height: `${(y_max - y_min) * 100}%`,
                    borderColor: color,
                };
                return (
                    <div key={index} style={style} className="absolute border-2 rounded-md shadow-lg flex justify-start items-start animate-fade-in-box">
                         <p style={{ backgroundColor: color }} className="text-white text-xs font-semibold capitalize px-2 py-1 rounded-br-md rounded-tl-sm">
                            {det.objectName}
                        </p>
                    </div>
                );
            })}
        </div>
    );
    

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 font-sans">
            <div className="w-full max-w-5xl mx-auto flex flex-col items-center">
                <header className="text-center mb-6">
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
                        Visual AI Analyzer
                    </h1>
                     <p className="text-gray-400 mt-2">Explore real-time motion and object detection powered by Gemini</p>
                </header>
                
                <div className="mb-6 w-full max-w-md">
                    <div className="flex bg-gray-800 rounded-lg p-1 space-x-1">
                        <button onClick={() => { setMode('motion'); clearState();}} className={`w-full py-2 rounded-md text-sm font-medium transition-colors ${mode === 'motion' ? 'bg-purple-600 text-white shadow' : 'text-gray-300 hover:bg-gray-700'}`}>
                            Motion Analysis
                        </button>
                        <button onClick={() => { setMode('live'); clearState();}} className={`w-full py-2 rounded-md text-sm font-medium transition-colors ${mode === 'live' ? 'bg-purple-600 text-white shadow' : 'text-gray-300 hover:bg-gray-700'}`}>
                            Live Object Detection
                        </button>
                    </div>
                </div>

                <main className="w-full relative">
                    <div className="relative w-full aspect-video bg-black rounded-lg shadow-2xl overflow-hidden border-2 border-gray-700">
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                        {!isCameraOn && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70">
                                <CameraIcon className="w-16 h-16 text-gray-500 mb-4" />
                                <p className="text-gray-400">Camera is off</p>
                            </div>
                        )}
                        {isCameraOn && <BoundingBoxOverlay />}
                        {transientMessage && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in text-center">
                                {transientMessage}
                            </div>
                        )}
                        <canvas ref={canvasRef} className="hidden"></canvas>
                    </div>

                    <div className="mt-6 flex items-center justify-center space-x-4">
                        {!isCameraOn ? (
                             <button onClick={startCamera} className="flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-all duration-300 transform hover:scale-105">
                                <CameraIcon className="w-6 h-6 mr-2" /> Start Camera
                            </button>
                        ) : (
                             <button onClick={stopCamera} className="flex items-center justify-center px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition-all duration-300 transform hover:scale-105">
                                <StopIcon className="w-6 h-6 mr-2" /> Stop Camera
                            </button>
                        )}
                        
                        {isCameraOn && mode === 'motion' && (
                            <button onClick={handleAnalyzeMotion} disabled={isAnalyzing} className="flex items-center justify-center px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-md transition-all duration-300 disabled:bg-purple-900 disabled:cursor-not-allowed transform hover:scale-105">
                                {isAnalyzing ? <Loader /> : <AnalyzeIcon className="w-6 h-6 mr-2" />}
                                {isAnalyzing ? 'Analyzing...' : 'Analyze Motion'}
                            </button>
                        )}

                        {isCameraOn && mode === 'live' && (
                             <button onClick={toggleLiveDetection} className={`flex items-center justify-center px-6 py-3 font-semibold rounded-lg shadow-md transition-all duration-300 transform hover:scale-105 ${isDetecting ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} text-white`}>
                                {isDetecting ? <Loader /> : <TargetIcon className="w-6 h-6 mr-2" />}
                                {isDetecting ? 'Detecting...' : 'Start Live Detection'}
                            </button>
                        )}
                    </div>

                     <div className="mt-6 w-full min-h-[120px]">
                        {error && (
                            <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative flex items-start" role="alert">
                                <AlertTriangleIcon className="w-5 h-5 mr-3 mt-1 flex-shrink-0" />
                                <div>
                                    <strong className="font-bold">Error! </strong>
                                    <span className="block sm:inline">{error}</span>
                                </div>
                            </div>
                        )}

                        {mode === 'motion' && analysisResult && (
                            <div className="bg-gray-800 bg-opacity-80 backdrop-blur-sm border border-gray-700 rounded-lg p-6 shadow-lg animate-fade-in">
                                <h3 className="text-2xl font-bold text-cyan-300 mb-4">Analysis Result</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                                    <div>
                                        <p className="text-sm text-gray-400 font-semibold uppercase tracking-wider">Object Detected</p>
                                        <p className="text-xl font-medium text-white mt-1 capitalize">{analysisResult.objectName}</p>
                                    </div>
                                    <div className="md:col-span-2">
                                        <p className="text-sm text-gray-400 font-semibold uppercase tracking-wider">Movement Description</p>
                                        <p className="text-xl font-medium text-white mt-1">{analysisResult.movementDescription}</p>
                                    </div>
                                </div>
                                <div className="w-full bg-gray-700 rounded-full h-2.5 mt-6">
                                    <div className="bg-gradient-to-r from-purple-500 to-cyan-400 h-2.5 rounded-full" style={{ width: `${analysisResult.confidence * 100}%` }}></div>
                                </div>
                                <p className="text-center text-sm text-gray-400 mt-2">Confidence: {Math.round(analysisResult.confidence * 100)}%</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
             <style>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                    animation: fade-in 0.5s ease-out forwards;
                }
                 @keyframes fade-in-box {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in-box {
                    animation: fade-in-box 0.5s ease-out forwards;
                }
            `}</style>
        </div>
    );
};

export default App;
