const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

const JSON_HEADERS = {
  'Content-Type': 'application/json'
};

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UploadResponse {
  documentId: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  [key: string]: unknown;
}

export interface JobResponse {
  jobId: string;
  status: string;
  message?: string;
}

export interface AnalysisStatusResponse {
  jobId: string;
  status: string;
  progress?: number;
  jobType?: string;
  createdAt?: string;
  completedAt?: string | null;
  error?: string | null;
  result?: unknown;
}

export interface AnalysisResultResponse<T = unknown> {
  jobId: string;
  status: string;
  result: T;
}

export interface SampleDocumentSummary {
  id: string;
  name: string;
  size: number;
  blobPath: string;
  category: string;
}

export interface SampleDocumentsResponse {
  category: string;
  samples: SampleDocumentSummary[];
  count: number;
}

export interface CustomAnalysisPayload {
  document_ids: string[];
  custom_instructions: string;
  model_name?: string;
  temperature?: number;
  max_tokens?: number;
  document_type?: string;
  output_format?: string;
}

const withBase = (path: string) => {
  const normalizedBase = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  return `${normalizedBase}${path.startsWith('/') ? path : `/${path}`}`;
};

const encodeBlobPath = (path: string) =>
  path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = options.headers instanceof Headers
    ? options.headers
    : new Headers(options.headers as HeadersInit);

  const response = await fetch(withBase(path), {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody && typeof errorBody.error === 'string') {
        message = errorBody.error;
      }
    } catch {
      const fallbackMessage = await response.text();
      if (fallbackMessage) {
        message = fallbackMessage;
      }
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function wrapRequest<T>(path: string, options?: RequestInit): Promise<ApiResult<T>> {
  try {
    const data = await fetchJson<T>(path, options);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export class ApiService {
  static uploadDocument(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return wrapRequest<UploadResponse>('/upload', {
      method: 'POST',
      body: formData
    });
  }

  static startComprehensiveAnalysis(documentIds: string[]) {
    return wrapRequest<JobResponse>('/analyze/comprehensive', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ document_ids: documentIds })
    });
  }

  static startSingleDocumentAnalysis(documentId: string) {
    return wrapRequest<JobResponse>('/analyze/single', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ document_id: documentId })
    });
  }

  static startBatchAnalysis(documentIds: string[]) {
    return wrapRequest<JobResponse>('/analyze/batch', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ document_ids: documentIds })
    });
  }

  static startFraudAnalysis(billId: string, medicalRecordIds: string[]) {
    return wrapRequest<JobResponse>('/analyze/fraud', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ bill_id: billId, medical_record_ids: medicalRecordIds })
    });
  }

  static startFraudDetectionAnalysis(billId: string, medicalRecordIds: string[]) {
    return wrapRequest<JobResponse>('/analyze/fraud-detection', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ bill_id: billId, medical_record_ids: medicalRecordIds })
    });
  }

  static startRevenueLeakageAnalysis(billId: string, medicalRecordIds: string[]) {
    return wrapRequest<JobResponse>('/analyze/revenue-leakage', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ bill_id: billId, medical_record_ids: medicalRecordIds })
    });
  }

  static startMismatchAnalysis(billId: string, medicalRecordIds: string[]) {
    return wrapRequest<JobResponse>('/analyze/mismatch', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ bill_id: billId, medical_record_ids: medicalRecordIds })
    });
  }

  static getAnalysisStatus(jobId: string) {
    return wrapRequest<AnalysisStatusResponse>(`/analysis/${jobId}/status`, {
      method: 'GET'
    });
  }

  static getAnalysisResult(jobId: string) {
    return wrapRequest<AnalysisResultResponse>(`/analysis/${jobId}/result`, {
      method: 'GET'
    });
  }
}

export const api = {
  uploadDocument(formData: FormData) {
    return fetchJson<UploadResponse>('/upload', {
      method: 'POST',
      body: formData
    });
  },
  startGeneralAnalysis(documentIds: string[]) {
    return fetchJson<JobResponse>('/analyze/general', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ document_ids: documentIds })
    });
  },
  startCustomAnalysis(payload: CustomAnalysisPayload) {
    return fetchJson<JobResponse>('/analyze/custom', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload)
    });
  },
  getAnalysisStatus(jobId: string) {
    return fetchJson<AnalysisStatusResponse>(`/analysis/${jobId}/status`, {
      method: 'GET'
    });
  },
  getAnalysisResult(jobId: string) {
    return fetchJson<AnalysisResultResponse>(`/analysis/${jobId}/result`, {
      method: 'GET'
    });
  },
  getSampleDocuments(category: string) {
    return fetchJson<SampleDocumentsResponse>(`/samples/${encodeURIComponent(category)}`);
  },
  downloadSampleDocument(category: string, blobPath: string) {
    const encodedCategory = encodeURIComponent(category);
    const encodedPath = encodeBlobPath(blobPath);
    return fetchJson<UploadResponse>(`/samples/${encodedCategory}/${encodedPath}/download`);
  }
};
