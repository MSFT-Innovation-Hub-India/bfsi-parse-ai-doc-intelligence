'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import { 
  Upload, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle,
  XCircle,
  FileText,
  Activity,
  TrendingUp,
  Mail,
  Globe,
  CreditCard,
  ImageIcon
} from 'lucide-react';
import { API_BASE_URL } from '@/config/api';

interface RedFlag {
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  evidence: string;
}

interface DetailedFindings {
  email_analysis?: {
    emails_found: string[];
    legitimate: boolean;
    issues: string[];
    verdict: string;
  };
  pan_analysis?: {
    pan_numbers_found: string[];
    valid_format: boolean;
    issues: string[];
    verdict: string;
  };
  domain_analysis?: {
    domains_found: string[];
    legitimate_domains: string[];
    suspicious_domains: string[];
    issues: string[];
    verdict: string;
  };
  document_quality?: {
    visual_quality: string;
    formatting: string;
    completeness: string;
    issues: string[];
  };
}

interface AnalysisResult {
  analysisId: string;
  timestamp: string;
  analysisType: string;
  documentName: string;
  documentPath: string;
  verdict: 'FAKE' | 'LEGITIMATE' | 'SUSPICIOUS' | 'UNKNOWN';
  confidenceScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary: string;
  detailedFindings: DetailedFindings;
  redFlags: RedFlag[];
  recommendations: string[];
  reasoning: string;
  metadata: any;
}

interface Document {
  documentId: string;
  filename: string;
  filePath: string;
}

export default function FakeDocumentDetection() {
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showViewer, setShowViewer] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setSelectedDocument({
        documentId: data.documentId,
        filename: file.name,
        filePath: data.fileName,
      });
      setResult(null); // Clear previous results when new file is uploaded
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload document. Please try again.');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.bmp'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
  });

  const startAnalysis = async () => {
    if (!selectedDocument) return;

    setIsAnalyzing(true);
    setProgress(0);
    setResult(null);

    try {
      console.log('Starting analysis for document:', selectedDocument.documentId);
      const response = await fetch(`${API_BASE_URL}/analyze/fake-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: selectedDocument.documentId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Analysis start failed:', errorText);
        throw new Error('Analysis failed to start');
      }

      const data = await response.json();
      console.log('Analysis started, job ID:', data.jobId);
      const jobId = data.jobId;

      if (!jobId) {
        console.error('No job ID received:', data);
        throw new Error('No job ID received from server');
      }

      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`${API_BASE_URL}/analysis/${jobId}/status`);
          
          if (!statusResponse.ok) {
            console.error(`Status check failed (${statusResponse.status}):`, await statusResponse.text());
            return;
          }

          const statusData = await statusResponse.json();
          console.log('Job status:', statusData.status, 'Progress:', statusData.progress);

          if (statusData.status === 'completed') {
            clearInterval(pollInterval);
            setProgress(100);
            console.log('Analysis completed! Result:', statusData.result);
            setResult(statusData.result);
            setIsAnalyzing(false);
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            setIsAnalyzing(false);
            console.error('Analysis failed:', statusData.error);
            alert('Analysis failed: ' + (statusData.error || 'Unknown error'));
          } else if (statusData.status === 'processing') {
            setProgress(statusData.progress || 50);
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, 2000);
    } catch (error) {
      console.error('Analysis error:', error);
      setIsAnalyzing(false);
      alert('Failed to start analysis: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'FAKE': return 'text-danger-600';
      case 'LEGITIMATE': return 'text-success-600';
      case 'SUSPICIOUS': return 'text-warning-600';
      default: return 'text-gray-600';
    }
  };

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case 'FAKE': return <XCircle className="w-6 h-6" />;
      case 'LEGITIMATE': return <CheckCircle className="w-6 h-6" />;
      case 'SUSPICIOUS': return <AlertTriangle className="w-6 h-6" />;
      default: return <ShieldAlert className="w-6 h-6" />;
    }
  };

  const getRiskBadge = (risk: string) => {
    const colors = {
      LOW: 'bg-success-50 text-success-700 border-success-200',
      MEDIUM: 'bg-warning-50 text-warning-700 border-warning-200',
      HIGH: 'bg-danger-50 text-danger-700 border-danger-200',
      CRITICAL: 'bg-danger-100 text-danger-800 border-danger-300',
    };
    return colors[risk as keyof typeof colors] || 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      LOW: 'bg-blue-50 text-blue-700',
      MEDIUM: 'bg-warning-50 text-warning-700',
      HIGH: 'bg-danger-50 text-danger-700',
      CRITICAL: 'bg-danger-100 text-danger-800',
    };
    return colors[severity as keyof typeof colors] || 'bg-gray-50 text-gray-700';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-8 h-8 text-primary-600" />
          <h1 className="text-3xl font-bold text-gray-900">Fake Document Detection</h1>
        </div>
        <p className="text-gray-600">
          Advanced AI-powered detection of fraudulent documents, email typos, invalid PANs, fake domains, and document inconsistencies.
        </p>
      </div>

      {!result ? (
        <>
          {/* Upload Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary-600" />
              Upload Document for Fraud Detection
            </h2>

            <div {...getRootProps()}>
              <input {...getInputProps()} />
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors cursor-pointer">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900 mb-2">
                  {isDragActive ? 'Drop the file here...' : 'Drag & drop a document here'}
                </p>
                <p className="text-gray-500">
                  or <span className="text-primary-600 font-medium">browse files</span>
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Supports: JPG, PNG, BMP, PDF
                </p>
              </div>
            </div>

            {selectedDocument && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-primary-600" />
                  <div>
                    <p className="font-medium text-gray-900">{selectedDocument.filename}</p>
                    <p className="text-sm text-gray-500">Ready for analysis</p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={startAnalysis}
              disabled={!selectedDocument || isAnalyzing}
              className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 mt-4"
            >
              <Activity className="w-5 h-5" />
              {isAnalyzing ? 'Analyzing...' : 'Start Fraud Detection'}
            </button>
          </div>

          {/* Progress */}
          {isAnalyzing && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Analysis Progress</span>
                <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Analyzing document for fraud indicators...
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Document Viewer Toggle */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <button
              onClick={() => setShowViewer(!showViewer)}
              className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
            >
              {showViewer ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
              {showViewer ? 'Hide Document' : 'Show Document'}
            </button>
          </div>

          {/* Document Viewer */}
          {showViewer && selectedDocument && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Preview</h3>
              <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height: '600px' }}>
                {selectedDocument.filename.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={`${API_BASE_URL}/documents/${selectedDocument.documentId}/view`}
                    className="w-full h-full border-0"
                    title="Document Preview"
                  />
                ) : (
                  <img
                    src={`${API_BASE_URL}/documents/${selectedDocument.documentId}/view`}
                    alt="Document"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      const parent = (e.target as HTMLImageElement).parentElement;
                      if (parent) {
                        parent.innerHTML = '<div class="flex items-center justify-center h-full"><p class="text-gray-500">Document preview not available</p></div>';
                      }
                    }}
                  />
                )}
              </div>
              <p className="text-sm text-gray-500 mt-2 text-center">
                Viewing: {selectedDocument.filename}
              </p>
            </div>
          )}

          {/* Results */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Analysis Results</h2>
              <div className={`flex items-center gap-2 ${getVerdictColor(result.verdict)}`}>
                {getVerdictIcon(result.verdict)}
                <span className="text-xl font-bold">{result.verdict}</span>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-medium text-gray-600">Confidence</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{result.confidenceScore}%</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-warning-600" />
                  <span className="text-sm font-medium text-gray-600">Risk Level</span>
                </div>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold border ${getRiskBadge(result.riskLevel)}`}>
                  {result.riskLevel}
                </span>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="w-5 h-5 text-danger-600" />
                  <span className="text-sm font-medium text-gray-600">Red Flags</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{result.redFlags.length}</p>
              </div>
            </div>

            {/* Summary */}
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-primary-600">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Summary</h3>
              <p className="text-gray-700">{result.summary}</p>
            </div>

            {/* Detailed Findings */}
            {result.detailedFindings && (
              <div className="space-y-4 mb-6">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary-600" />
                  Detailed Findings
                </h3>

                {/* Email Analysis */}
                {result.detailedFindings.email_analysis && (
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Mail className="w-5 h-5 text-primary-600" />
                      <h4 className="text-lg font-semibold text-gray-900">Email Analysis</h4>
                      <span className={`ml-auto px-2 py-1 rounded text-xs font-semibold ${
                        result.detailedFindings.email_analysis.verdict === 'PASS' ? 'bg-success-100 text-success-700' :
                        result.detailedFindings.email_analysis.verdict === 'FAIL' ? 'bg-danger-100 text-danger-700' :
                        'bg-warning-100 text-warning-700'
                      }`}>
                        {result.detailedFindings.email_analysis.verdict}
                      </span>
                    </div>
                    {result.detailedFindings.email_analysis.emails_found && result.detailedFindings.email_analysis.emails_found.length > 0 && (
                      <div className="mb-2">
                        <p className="text-sm font-medium text-gray-700">Emails Found:</p>
                        <ul className="list-disc list-inside text-sm text-gray-600">
                          {result.detailedFindings.email_analysis.emails_found.map((email, idx) => (
                            <li key={idx}>{email}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.detailedFindings.email_analysis.issues && result.detailedFindings.email_analysis.issues.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Issues:</p>
                        <ul className="space-y-1">
                          {result.detailedFindings.email_analysis.issues.map((issue, idx) => (
                            <li key={idx} className="text-sm text-danger-600 flex items-start gap-1">
                              <span className="text-danger-500 mt-0.5">•</span>
                              <span>{issue}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* PAN Analysis */}
                {result.detailedFindings.pan_analysis && result.detailedFindings.pan_analysis.verdict !== 'NOT_APPLICABLE' && (
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CreditCard className="w-5 h-5 text-primary-600" />
                      <h4 className="text-lg font-semibold text-gray-900">PAN Analysis</h4>
                      <span className={`ml-auto px-2 py-1 rounded text-xs font-semibold ${
                        result.detailedFindings.pan_analysis.verdict === 'PASS' ? 'bg-success-100 text-success-700' :
                        result.detailedFindings.pan_analysis.verdict === 'FAIL' ? 'bg-danger-100 text-danger-700' :
                        'bg-warning-100 text-warning-700'
                      }`}>
                        {result.detailedFindings.pan_analysis.verdict}
                      </span>
                    </div>
                    {result.detailedFindings.pan_analysis.pan_numbers_found && result.detailedFindings.pan_analysis.pan_numbers_found.length > 0 && (
                      <div className="mb-2">
                        <p className="text-sm font-medium text-gray-700">PAN Numbers Found:</p>
                        <ul className="list-disc list-inside text-sm text-gray-600">
                          {result.detailedFindings.pan_analysis.pan_numbers_found.map((pan, idx) => (
                            <li key={idx}>{pan}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.detailedFindings.pan_analysis.issues && result.detailedFindings.pan_analysis.issues.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Issues:</p>
                        <ul className="space-y-1">
                          {result.detailedFindings.pan_analysis.issues.map((issue, idx) => (
                            <li key={idx} className="text-sm text-danger-600 flex items-start gap-1">
                              <span className="text-danger-500 mt-0.5">•</span>
                              <span>{issue}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Domain Analysis */}
                {result.detailedFindings.domain_analysis && (
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Globe className="w-5 h-5 text-primary-600" />
                      <h4 className="text-lg font-semibold text-gray-900">Domain Analysis</h4>
                      <span className={`ml-auto px-2 py-1 rounded text-xs font-semibold ${
                        result.detailedFindings.domain_analysis.verdict === 'PASS' ? 'bg-success-100 text-success-700' :
                        result.detailedFindings.domain_analysis.verdict === 'FAIL' ? 'bg-danger-100 text-danger-700' :
                        'bg-warning-100 text-warning-700'
                      }`}>
                        {result.detailedFindings.domain_analysis.verdict}
                      </span>
                    </div>
                    {result.detailedFindings.domain_analysis.domains_found && result.detailedFindings.domain_analysis.domains_found.length > 0 && (
                      <div className="mb-2">
                        <p className="text-sm font-medium text-gray-700">Domains Found:</p>
                        <ul className="list-disc list-inside text-sm text-gray-600">
                          {result.detailedFindings.domain_analysis.domains_found.map((domain, idx) => (
                            <li key={idx}>{domain}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.detailedFindings.domain_analysis.suspicious_domains && result.detailedFindings.domain_analysis.suspicious_domains.length > 0 && (
                      <div className="mb-2">
                        <p className="text-sm font-medium text-danger-700">Suspicious Domains:</p>
                        <ul className="list-disc list-inside text-sm text-danger-600">
                          {result.detailedFindings.domain_analysis.suspicious_domains.map((domain, idx) => (
                            <li key={idx}>{domain}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {result.detailedFindings.domain_analysis.issues && result.detailedFindings.domain_analysis.issues.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Issues:</p>
                        <ul className="space-y-1">
                          {result.detailedFindings.domain_analysis.issues.map((issue, idx) => (
                            <li key={idx} className="text-sm text-danger-600 flex items-start gap-1">
                              <span className="text-danger-500 mt-0.5">•</span>
                              <span>{issue}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Document Quality */}
                {result.detailedFindings.document_quality && (
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="w-5 h-5 text-primary-600" />
                      <h4 className="text-lg font-semibold text-gray-900">Document Quality</h4>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-gray-500">Visual Quality</p>
                        <p className="text-sm font-semibold text-gray-900">{result.detailedFindings.document_quality.visual_quality}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Formatting</p>
                        <p className="text-sm font-semibold text-gray-900">{result.detailedFindings.document_quality.formatting}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Completeness</p>
                        <p className="text-sm font-semibold text-gray-900">{result.detailedFindings.document_quality.completeness}</p>
                      </div>
                    </div>
                    {result.detailedFindings.document_quality.issues && result.detailedFindings.document_quality.issues.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Issues:</p>
                        <ul className="space-y-1">
                          {result.detailedFindings.document_quality.issues.map((issue, idx) => (
                            <li key={idx} className="text-sm text-gray-600 flex items-start gap-1">
                              <span className="text-primary-600 mt-0.5">•</span>
                              <span>{issue}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Red Flags */}
            {result.redFlags && result.redFlags.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-danger-600" />
                  Red Flags Detected
                </h3>
                <div className="space-y-3">
                  {result.redFlags.map((flag, idx) => (
                    <div key={idx} className="bg-white rounded-lg border-l-4 border-danger-500 p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${getSeverityBadge(flag.severity)}`}>
                            {flag.severity}
                          </span>
                          <span className="text-sm font-semibold text-gray-700 uppercase">{flag.category}</span>
                        </div>
                      </div>
                      <p className="text-gray-900 font-medium mb-1">{flag.description}</p>
                      {flag.evidence && (
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Evidence:</span> {flag.evidence}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {result.recommendations && result.recommendations.length > 0 && (
              <div className="mb-6 bg-blue-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Recommendations</h3>
                <ul className="space-y-2">
                  {result.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-gray-700">
                      <span className="text-primary-600 font-bold mt-1">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reasoning */}
            {result.reasoning && (
              <div className="mb-6 bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Detailed Reasoning</h3>
                <div className="prose prose-sm max-w-none text-gray-700">
                  <ReactMarkdown>{result.reasoning}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {/* Analyze Another Button */}
          <button
            onClick={() => {
              setResult(null);
              setSelectedDocument(null);
              setShowViewer(false);
            }}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors"
          >
            Analyze Another Document
          </button>
        </>
      )}
    </div>
  );
}
