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
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Eye
} from 'lucide-react';
import { API_BASE_URL } from '@/config/api';

interface Document {
  documentId: string;
  filename: string;
  filePath: string;
}

interface RedFlag {
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  evidence: {
    document_1?: string;
    document_2?: string;
    discrepancy?: string;
  };
}

interface ComparisonCheck {
  status: string;
  verdict: string;
  [key: string]: any;
}

interface ComparisonResults {
  identity_matching?: ComparisonCheck;
  date_consistency?: ComparisonCheck;
  financial_reconciliation?: ComparisonCheck;
  content_consistency?: ComparisonCheck;
  quality_comparison?: any;
}

interface AnalysisResult {
  analysisId: string;
  timestamp: string;
  analysisType: string;
  document1: {
    name: string;
    type: string;
    path: string;
  };
  document2: {
    name: string;
    type: string;
    path: string;
  };
  verdict: 'CONSISTENT' | 'INCONSISTENT' | 'SUSPICIOUS' | 'FRAUDULENT' | 'UNKNOWN';
  confidenceScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary: string;
  documentAnalysis: any;
  comparisonResults: ComparisonResults;
  redFlags: RedFlag[];
  fraudIndicators: any[];
  recommendations: string[];
  detailedReasoning: string;
  metadata: any;
}

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'Medical Bill', label: 'Medical Bill' },
  { value: 'Prescription', label: 'Prescription' },
  { value: 'Lab Report', label: 'Lab Report' },
  { value: 'Salary Slip', label: 'Salary Slip' },
  { value: 'Offer Letter', label: 'Offer Letter' },
  { value: 'Appointment Letter', label: 'Appointment Letter' },
  { value: 'Bank Statement', label: 'Bank Statement' },
  { value: 'Invoice', label: 'Invoice' },
  { value: 'Purchase Order', label: 'Purchase Order' },
  { value: 'Agreement', label: 'Agreement' },
  { value: 'ID Document', label: 'ID Document' },
  { value: 'Other', label: 'Other' }
];

export default function CoDocumentAnalysis() {
  const [document1, setDocument1] = useState<Document | null>(null);
  const [document2, setDocument2] = useState<Document | null>(null);
  const [doc1Type, setDoc1Type] = useState('Medical Bill');
  const [doc2Type, setDoc2Type] = useState('Prescription');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']));
  const [showDocuments, setShowDocuments] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const uploadDocument = async (file: File, docNumber: 1 | 2) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      const docInfo = {
        documentId: data.documentId,
        filename: file.name,
        filePath: data.fileName,
      };

      if (docNumber === 1) {
        setDocument1(docInfo);
      } else {
        setDocument2(docInfo);
      }
    } catch (error) {
      console.error(`Upload error for document ${docNumber}:`, error);
      alert(`Failed to upload document ${docNumber}. Please try again.`);
    }
  };

  const onDrop1 = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      await uploadDocument(acceptedFiles[0], 1);
    }
  }, []);

  const onDrop2 = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      await uploadDocument(acceptedFiles[0], 2);
    }
  }, []);

  const dropzone1 = useDropzone({
    onDrop: onDrop1,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.bmp'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
  });

  const dropzone2 = useDropzone({
    onDrop: onDrop2,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.bmp'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
  });

  const startAnalysis = async () => {
    if (!document1 || !document2) return;

    setIsAnalyzing(true);
    setProgress(0);
    setResult(null);

    try {
      console.log('Starting co-document analysis');
      const response = await fetch(`${API_BASE_URL}/analyze/co-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          document1_id: document1.documentId,
          document2_id: document2.documentId,
          doc1_type: doc1Type,
          doc2_type: doc2Type
        }),
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
      case 'CONSISTENT': return 'text-success-600';
      case 'INCONSISTENT': return 'text-warning-600';
      case 'SUSPICIOUS': return 'text-warning-600';
      case 'FRAUDULENT': return 'text-danger-600';
      default: return 'text-gray-600';
    }
  };

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case 'CONSISTENT': return <CheckCircle className="w-6 h-6" />;
      case 'INCONSISTENT': return <AlertTriangle className="w-6 h-6" />;
      case 'SUSPICIOUS': return <AlertTriangle className="w-6 h-6" />;
      case 'FRAUDULENT': return <XCircle className="w-6 h-6" />;
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

  const getCheckIcon = (verdict: string) => {
    if (verdict === 'PASS') return <CheckCircle className="w-5 h-5 text-success-600" />;
    if (verdict === 'FAIL') return <XCircle className="w-5 h-5 text-danger-600" />;
    return <AlertTriangle className="w-5 h-5 text-warning-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-2">
          <ArrowLeftRight className="w-8 h-8 text-primary-600" />
          <h1 className="text-3xl font-bold text-gray-900">Co-Document Analysis</h1>
        </div>
        <p className="text-gray-600">
          Compare two related documents to detect fraud, inconsistencies, and discrepancies. Perfect for bill vs prescription, salary slip vs offer letter, invoice vs PO validation.
        </p>
      </div>

      {!result ? (
        <>
          {/* Upload Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Document 1 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-600" />
                Document 1
              </h2>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Document Type
                </label>
                <select
                  value={doc1Type}
                  onChange={(e) => setDoc1Type(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {DOCUMENT_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div {...dropzone1.getRootProps()}>
                <input {...dropzone1.getInputProps()} />
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors cursor-pointer">
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    {dropzone1.isDragActive ? 'Drop here...' : 'Drop or browse'}
                  </p>
                  <p className="text-xs text-gray-400">PDF, JPG, PNG, BMP</p>
                </div>
              </div>

              {document1 && (
                <div className="mt-3 p-3 bg-primary-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{document1.filename}</p>
                      <p className="text-xs text-gray-500">Ready</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Document 2 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-600" />
                Document 2
              </h2>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Document Type
                </label>
                <select
                  value={doc2Type}
                  onChange={(e) => setDoc2Type(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {DOCUMENT_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div {...dropzone2.getRootProps()}>
                <input {...dropzone2.getInputProps()} />
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors cursor-pointer">
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    {dropzone2.isDragActive ? 'Drop here...' : 'Drop or browse'}
                  </p>
                  <p className="text-xs text-gray-400">PDF, JPG, PNG, BMP</p>
                </div>
              </div>

              {document2 && (
                <div className="mt-3 p-3 bg-primary-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{document2.filename}</p>
                      <p className="text-xs text-gray-500">Ready</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Start Analysis Button */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <button
              onClick={startAnalysis}
              disabled={!document1 || !document2 || isAnalyzing}
              className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <Activity className="w-5 h-5" />
              {isAnalyzing ? 'Comparing Documents...' : 'Start Comparison Analysis'}
            </button>
          </div>

          {/* Progress */}
          {isAnalyzing && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Comparison Progress</span>
                <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Analyzing documents for inconsistencies and fraud indicators...
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Document Viewer Toggle */}
          {(document1 || document2) && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <button
                onClick={() => setShowDocuments(!showDocuments)}
                className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
              >
                <Eye className="w-5 h-5" />
                {showDocuments ? 'Hide Documents' : 'Show Documents'}
              </button>
            </div>
          )}

          {/* Document Viewer */}
          {showDocuments && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {document1 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{doc1Type}</h3>
                  <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height: '400px' }}>
                    {document1.filename.toLowerCase().endsWith('.pdf') ? (
                      <iframe
                        src={`${API_BASE_URL}/documents/${document1.documentId}/view`}
                        className="w-full h-full border-0"
                        title="Document 1 Preview"
                      />
                    ) : (
                      <img
                        src={`${API_BASE_URL}/documents/${document1.documentId}/view`}
                        alt="Document 1"
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-2 text-center">{document1.filename}</p>
                </div>
              )}
              {document2 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{doc2Type}</h3>
                  <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height: '400px' }}>
                    {document2.filename.toLowerCase().endsWith('.pdf') ? (
                      <iframe
                        src={`${API_BASE_URL}/documents/${document2.documentId}/view`}
                        className="w-full h-full border-0"
                        title="Document 2 Preview"
                      />
                    ) : (
                      <img
                        src={`${API_BASE_URL}/documents/${document2.documentId}/view`}
                        alt="Document 2"
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-2 text-center">{document2.filename}</p>
                </div>
              )}
            </div>
          )}

          {/* Results Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Comparison Results</h2>
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
                  <ShieldAlert className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-medium text-gray-600">Risk Level</span>
                </div>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold border ${getRiskBadge(result.riskLevel)}`}>
                  {result.riskLevel}
                </span>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-medium text-gray-600">Red Flags</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{result.redFlags.length}</p>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Executive Summary</h3>
              <p className="text-gray-700">{result.summary}</p>
            </div>
          </div>

          {/* Comparison Checks */}
          {result.comparisonResults && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Key Comparison Checks</h3>
              <div className="space-y-3">
                {result.comparisonResults.identity_matching && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {getCheckIcon(result.comparisonResults.identity_matching.verdict)}
                      <span className="font-medium text-gray-900">Identity Matching</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-600">
                      {result.comparisonResults.identity_matching.verdict}
                    </span>
                  </div>
                )}
                {result.comparisonResults.date_consistency && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {getCheckIcon(result.comparisonResults.date_consistency.verdict)}
                      <span className="font-medium text-gray-900">Date Consistency</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-600">
                      {result.comparisonResults.date_consistency.verdict}
                    </span>
                  </div>
                )}
                {result.comparisonResults.financial_reconciliation && result.comparisonResults.financial_reconciliation.status !== 'NOT_APPLICABLE' && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {getCheckIcon(result.comparisonResults.financial_reconciliation.verdict)}
                      <span className="font-medium text-gray-900">Financial Reconciliation</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-600">
                      {result.comparisonResults.financial_reconciliation.verdict}
                    </span>
                  </div>
                )}
                {result.comparisonResults.content_consistency && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {getCheckIcon(result.comparisonResults.content_consistency.verdict)}
                      <span className="font-medium text-gray-900">Content Consistency</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-600">
                      {result.comparisonResults.content_consistency.verdict}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Red Flags */}
          {result.redFlags && result.redFlags.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleSection('redflags')}
              >
                <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-danger-600" />
                  Red Flags ({result.redFlags.length})
                </h3>
                {expandedSections.has('redflags') ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {expandedSections.has('redflags') && (
                <div className="mt-4 space-y-3">
                  {result.redFlags.map((flag, index) => (
                    <div key={index} className="border-l-4 border-danger-500 bg-danger-50 p-4 rounded-r-lg">
                      <div className="flex items-start justify-between mb-2">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getSeverityBadge(flag.severity)}`}>
                          {flag.severity}
                        </span>
                        <span className="text-xs text-gray-500">{flag.category.toUpperCase()}</span>
                      </div>
                      <p className="font-medium text-gray-900 mb-2">{flag.description}</p>
                      {flag.evidence && flag.evidence.discrepancy && (
                        <p className="text-sm text-gray-700 bg-white p-2 rounded">
                          <strong>Discrepancy:</strong> {flag.evidence.discrepancy}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Recommendations</h3>
              <ul className="space-y-2">
                {result.recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-primary-600 font-bold">{index + 1}.</span>
                    <span className="text-gray-700">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Detailed Reasoning */}
          {result.detailedReasoning && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleSection('reasoning')}
              >
                <h3 className="text-xl font-semibold text-gray-900">Detailed Analysis</h3>
                {expandedSections.has('reasoning') ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {expandedSections.has('reasoning') && (
                <div className="mt-4 prose max-w-none text-gray-700 whitespace-pre-wrap">
                  <ReactMarkdown>
                    {result.detailedReasoning}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* New Analysis Button */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <button
              onClick={() => {
                setResult(null);
                setDocument1(null);
                setDocument2(null);
                setProgress(0);
              }}
              className="w-full bg-gray-600 text-white py-3 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
            >
              Analyze New Documents
            </button>
          </div>
        </>
      )}
    </div>
  );
}
