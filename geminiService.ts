import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, DetectedObject } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const motionAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        objectName: {
            type: Type.STRING,
            description: "A string identifying the moving object (e.g., 'blue ball', 'person', 'no moving object')."
        },
        movementDescription: {
            type: Type.STRING,
            description: "A concise string describing the movement (e.g., 'rolling from left to right', 'walking towards the camera', 'no movement detected')."
        },
        confidence: {
            type: Type.NUMBER,
            description: "A number between 0 and 1 indicating your confidence in the analysis."
        }
    },
    required: ["objectName", "movementDescription", "confidence"]
};

const liveDetectionSchema = {
    type: Type.OBJECT,
    properties: {
        detections: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    objectName: {
                        type: Type.STRING,
                        description: "Name of the detected object.",
                    },
                    boundingBox: {
                        type: Type.OBJECT,
                        description: "Normalized bounding box of the object [x_min, y_min, x_max, y_max].",
                        properties: {
                            x_min: { type: Type.NUMBER },
                            y_min: { type: Type.NUMBER },
                            x_max: { type: Type.NUMBER },
                            y_max: { type: Type.NUMBER },
                        },
                        required: ["x_min", "y_min", "x_max", "y_max"],
                    },
                },
                required: ["objectName", "boundingBox"],
            },
        },
    },
    required: ["detections"],
};


export const analyzeMotion = async (frame1B64: string, frame2B64: string): Promise<AnalysisResult> => {
    try {
        const prompt = `You are a visual analysis expert. These are two sequential frames from a video, captured approximately half a second apart. Your task is to identify the main object that has moved between frame 1 and frame 2. Describe the object and its movement (e.g., 'A red car moving to the left', 'A person's hand waving up'). If no object has moved, state that. Provide your analysis in the requested JSON format.`;

        const frame1Part = {
            inlineData: { mimeType: 'image/jpeg', data: frame1B64 },
        };

        const frame2Part = {
            inlineData: { mimeType: 'image/jpeg', data: frame2B64 },
        };

        const textPart = { text: prompt };

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [textPart, frame1Part, frame2Part] },
            config: {
                responseMimeType: "application/json",
                responseSchema: motionAnalysisSchema,
            }
        });

        return JSON.parse(response.text) as AnalysisResult;

    } catch (error) {
        console.error("Error analyzing motion:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to analyze motion with Gemini API: ${error.message}`);
        }
        throw new Error("An unknown error occurred during motion analysis.");
    }
};


export const detectObjectsInFrame = async (frameB64: string): Promise<DetectedObject[]> => {
     try {
        const prompt = "You are an expert object detector. Analyze this image and identify all significant objects. For each object, provide its name and a normalized bounding box (coordinates from 0 to 1 for x_min, y_min, x_max, y_max). If no objects are found, return an empty array for the 'detections' property.";

        const framePart = {
            inlineData: { mimeType: 'image/jpeg', data: frameB64 },
        };
        
        const textPart = { text: prompt };

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [textPart, framePart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: liveDetectionSchema,
            }
        });
        
        const result = JSON.parse(response.text);
        return (result.detections || []) as DetectedObject[];

    } catch (error) {
        console.error("Error detecting objects:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to detect objects with Gemini API: ${error.message}`);
        }
        throw new Error("An unknown error occurred during object detection.");
    }
}
