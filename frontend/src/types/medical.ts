// Medical Document Analysis Types

export interface MedicalDocument {
  id: string;
  name: string;
  path: string;
  type: DocumentType;
  uploadedAt: string;
  size: number;
  status: AnalysisStatus;
}

export type DocumentType = 
  | 'prescription'
  | 'lab_report'
  | 'discharge_summary'
  | 'consultation_note'
  | 'imaging_report'
  | 'medical_bill'
  | 'other';

export type AnalysisStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface PatientInfo {
  ageGroup: string;
  gender: string;
  patientId?: string;
  relevantDemographics?: string;
}

export interface MedicalSummary {
  primaryDiagnosis: string;
  secondaryDiagnoses: string[];
  chiefComplaint: string;
  currentSymptoms: string[];
  medicalHistory: string[];
  severityAssessment: string;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  indication: string;
  route: string;
}

export interface TestResult {
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  status: 'normal' | 'abnormal' | 'critical';
}

export interface VitalSigns {
  bloodPressure?: string;
  heartRate?: string;
  temperature?: string;
  respiratoryRate?: string;
  oxygenSaturation?: string;
}

export interface SingleDocumentAnalysis {
  documentNumber: number;
  documentName: string;
  documentPath: string;
  analysisTimestamp: string;
  analysisSuccessful: boolean;
  documentMetadata: {
    documentType: DocumentType;
    date: string;
    healthcareFacility: string;
    documentQuality: string;
    language: string;
  };
  patientInformation: PatientInfo;
  medicalSummary: MedicalSummary;
  medicationsAndTreatments: {
    currentMedications: Medication[];
    discontinuedMedications: string[];
    allergies: string[];
    treatmentPlan: string[];
  };
  testResults: {
    laboratoryResults: TestResult[];
    imagingResults: string[];
    vitalSigns: VitalSigns;
  };
  clinicalAssessment: {
    clinicalImpression: string;
    prognosis: string;
    riskFactors: string[];
    complications: string[];
    differentialDiagnosis: string[];
  };
  keyFindings: {
    significantFindings: string[];
    abnormalResults: string[];
    notableObservations: string[];
    documentInsights: string[];
  };
  redFlags: string[];
  keyInsights: string[];
  documentSummary: string;
}

export interface ComprehensiveReport {
  reportMetadata: {
    generationTimestamp: string;
    totalDocumentsAnalyzed: number;
    successfulAnalyses: number;
    failedAnalyses: number;
    analysisType: string;
  };
  executiveSummary: {
    totalUniqueDiagnoses: number;
    totalMedications: number;
    totalSymptomsReported: number;
    criticalAlerts: number;
    totalFindings: number;
  };
  clinicalOverview?: {
    primaryDiagnoses: string[];
    keySymptoms?: string[];
    currentMedications: Medication[];
    criticalFindings: string[];
    keyMedicalFindings?: string[];
  };
  documentSummaries?: Array<{
    documentName: string;
    documentType: string;
    summary: string;
  }>;
  detailedAnalysis: SingleDocumentAnalysis[];
  documentAnalyses?: any[]; // For backward compatibility
}

// Mismatch Analysis Types
export interface DocumentItem {
  name: string;
  type: string;
  indication?: string;
  route?: string;
  genericName?: string;
}

export interface DocumentExtract {
  documentType: string;
  documentDate: string;
  provider: string;
  medications: DocumentItem[];
  procedures: DocumentItem[];
  services: DocumentItem[];
  diagnoses: DocumentItem[];
  summary: string;
}

export interface MismatchAnalysis {
  analysisId: string;
  timestamp: string;
  billDocument: DocumentExtract;
  medicalDocuments: DocumentExtract[];
  billVsMedicalMismatches: {
    medicationsBilledButNotInMedicalRecords: string[];
    medicationsInMedicalRecordsButNotBilled: string[];
    proceduresBilledButNotDocumented: string[];
    servicesDocumentedButNotBilled: string[];
  };
  medicationNameDiscrepancies: Array<{
    billedName: string;
    medicalRecordName: string;
    possibleMatch: boolean;
  }>;
  billingCompletenessAssessment: {
    totalMedicationsInMedicalRecords: number;
    totalMedicationsInBill: number;
    medicationsProperlyBilled: number;
    billingCoveragePercentage: string;
    documentationCoveragePercentage: string;
  };
  revenueImpactAnalysis: {
    potentialRevenueLeakage: {
      estimatedImpact: string;
      unbilledMedications: string[];
    };
    potentialFraudIndicators: {
      riskLevel: string;
      phantomBilling: string[];
    };
  };
  recommendations: {
    billingCorrections: string[];
    revenueRecoveryActions: string[];
    fraudInvestigationItems: string[];
  };
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface UploadResponse {
  documentId: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
}

export interface AnalysisJob {
  jobId: string;
  status: AnalysisStatus;
  progress: number;
  estimatedTimeRemaining?: number;
  result?: any;
  error?: string;
}
