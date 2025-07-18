export interface AnalysisResult {
  objectName: string;
  movementDescription: string;
  confidence: number;
}

export interface BoundingBox {
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
}

export interface DetectedObject {
    objectName: string;
    boundingBox: BoundingBox;
}
