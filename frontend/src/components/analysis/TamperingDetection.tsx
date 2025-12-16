'use client';

import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Upload, 
  FileSearch, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Info,
  TrendingUp,
  Activity,
  Eye,
  Zap,
  Image as ImageIcon,
  FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { API_BASE_URL } from '@/config/api';

interface DocumentInfo {
  documentId: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
}

interface ForensicAnalysis {
  score: number;
  verdict: string;
  reasons: string[];
  metrics: {
    ela_hot_pixels_ratio: number;
    mean_rgb_std: number;
    mean_local_variance: number;
    ssim_score: number;
  };
  outputDir: string;
  images: {
    ela: string;
    rgb_std: string;
    local_var: string;
  };
}

interface LLMAnalysis {
  tampering_detected: boolean;
  confidence_score: number;
  risk_level: string;
  document_identification?: {
    document_type: string;
    document_purpose: string;
    quality_assessment: string;
  };
  forensic_visual_correlation?: {
    overall_correlation: string;
  };
  tampering_regions?: Array<{
    region_id: number;
    exact_location: string;
    visual_description: string;
    suspected_tampering_method: string;
    confidence_this_region: number;
  }>;
  overall_assessment: string;
  detected_anomalies: Array<{
    category: string;
    issue: string;
    severity: string;
    location: string;
    detailed_evidence: string;
  }>;
  recommendations: string[];
  detailed_reasoning: string;
}

interface IntegratedVerdict {
  combined_score: number;
  verdict: string;
  risk_level: string;
  forensic_contribution: number;
  llm_contribution: number;
  agreement: string;
}

interface PageAnalysis {
  page: number;
  imagePath: string;
  forensicAnalysis: ForensicAnalysis;
  llmAnalysis: LLMAnalysis;
  integratedVerdict: IntegratedVerdict;
}

interface TamperingResult {
  analysisId: string;
  timestamp: string;
  analysisType: string;
  documentName: string;
  documentPath: string;
  totalPages: number;
  summary: {
    tampering_detected: boolean;
    highest_risk_level: string;
    pages_analyzed: number;
    total_anomalies_found: number;
    average_forensic_score: number;
    average_llm_confidence: number;
  };
  pageAnalyses: PageAnalysis[];
}

export default function TamperingDetection() {
  const [selectedDocument, setSelectedDocument] = useState<DocumentInfo | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TamperingResult | null>(null);
  const [selectedPage, setSelectedPage] = useState(0);
  const [showViewer, setShowViewer] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a valid image (JPG, PNG) or PDF file');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const uploadToast = toast.loading('Uploading document...');

    try {
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setSelectedDocument({
        documentId: data.documentId,
        fileName: data.fileName,
        fileSize: data.fileSize,
        uploadedAt: data.uploadedAt,
      });

      toast.success('Document uploaded successfully!', { id: uploadToast });
    } catch (error) {
      toast.error('Failed to upload document', { id: uploadToast });
      console.error('Upload error:', error);
    }
  };

  const startAnalysis = async () => {
    if (!selectedDocument) {
      toast.error('Please upload a document first');
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);
    setResult(null);

    const analysisToast = toast.loading('Starting tampering detection...');

    try {
      // Start analysis
      const response = await fetch(`${API_BASE_URL}/analyze/tampering`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: selectedDocument.documentId,
        }),
      });

      if (!response.ok) throw new Error('Failed to start analysis');

      const { jobId } = await response.json();

      // Poll for results
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`${API_BASE_URL}/analysis/${jobId}/status`);
          const statusData = await statusResponse.json();

          setProgress(statusData.progress);

          if (statusData.status === 'completed') {
            clearInterval(pollInterval);

            const resultResponse = await fetch(`${API_BASE_URL}/analysis/${jobId}/result`);
            const resultData = await resultResponse.json();

            setResult(resultData.result);
            setSelectedPage(0);
            setIsAnalyzing(false);
            toast.success('Tampering detection complete!', { id: analysisToast });
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            throw new Error(statusData.error || 'Analysis failed');
          }
        } catch (error) {
          clearInterval(pollInterval);
          throw error;
        }
      }, 2000);
    } catch (error) {
      setIsAnalyzing(false);
      toast.error('Tampering detection failed', { id: analysisToast });
      console.error('Analysis error:', error);
    }
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'CRITICAL':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'HIGH':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'MEDIUM':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'LOW':
        return 'text-green-600 bg-green-50 border-green-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getRiskIcon = (riskLevel: string) => {
    switch (riskLevel) {
      case 'CRITICAL':
      case 'HIGH':
        return <XCircle className="w-5 h-5" />;
      case 'MEDIUM':
        return <AlertTriangle className="w-5 h-5" />;
      case 'LOW':
        return <CheckCircle className="w-5 h-5" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const currentPage = result?.pageAnalyses[selectedPage];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-8 h-8 text-primary-600" />
          <h1 className="text-3xl font-bold text-gray-900">Document Fraud Detection</h1>
        </div>
        <p className="text-gray-600">
          Advanced tampering detection using forensic analysis and AI vision to identify document forgery, manipulation, and authenticity issues
        </p>
      </div>

      {/* Upload Section */}
      {!result && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary-600" />
            Upload Document for Fraud Detection
          </h2>

          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileUpload}
                className="hidden"
                id="document-upload"
              />
              <label
                htmlFor="document-upload"
                className="cursor-pointer flex flex-col items-center"
              >
                <FileSearch className="w-12 h-12 text-gray-400 mb-3" />
                <span className="text-sm font-medium text-gray-700 mb-1">
                  Click to upload or drag and drop
                </span>
                <span className="text-xs text-gray-500">
                  Supports: JPG, PNG, PDF (Max 16MB)
                </span>
              </label>
            </div>

            {selectedDocument && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{selectedDocument.fileName}</p>
                    <p className="text-sm text-gray-600">
                      {(selectedDocument.fileSize / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
              </div>
            )}

            <button
              onClick={startAnalysis}
              disabled={!selectedDocument || isAnalyzing}
              className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <Zap className="w-5 h-5" />
              {isAnalyzing ? 'Analyzing...' : 'Start Fraud Detection'}
            </button>

            {isAnalyzing && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Analyzing document...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className={`rounded-xl shadow-sm border-2 p-6 ${getRiskColor(result.summary.highest_risk_level)}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {getRiskIcon(result.summary.highest_risk_level)}
                <div>
                  <h2 className="text-2xl font-bold">
                    {result.summary.tampering_detected ? 'Tampering Detected' : 'No Tampering Detected'}
                  </h2>
                  <p className="text-sm opacity-80">Risk Level: {result.summary.highest_risk_level}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white bg-opacity-50 rounded-lg p-3">
                <div className="text-2xl font-bold">{result.summary.pages_analyzed}</div>
                <div className="text-xs opacity-80">Pages Analyzed</div>
              </div>
              <div className="bg-white bg-opacity-50 rounded-lg p-3">
                <div className="text-2xl font-bold">{result.summary.total_anomalies_found}</div>
                <div className="text-xs opacity-80">Anomalies Found</div>
              </div>
              <div className="bg-white bg-opacity-50 rounded-lg p-3">
                <div className="text-2xl font-bold">{(result.summary.average_forensic_score * 100).toFixed(0)}%</div>
                <div className="text-xs opacity-80">Forensic Score</div>
              </div>
              <div className="bg-white bg-opacity-50 rounded-lg p-3">
                <div className="text-2xl font-bold">{result.summary.average_llm_confidence.toFixed(0)}%</div>
                <div className="text-xs opacity-80">AI Confidence</div>
              </div>
            </div>
          </div>

          {/* Page Selector */}
          {result.totalPages > 1 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-700">Select Page:</span>
                {result.pageAnalyses.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedPage(idx)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      selectedPage === idx
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Page {idx + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Document Viewer Toggle */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <button
              onClick={() => setShowViewer(!showViewer)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <ImageIcon className="w-5 h-5 text-gray-700" />
                <span className="font-medium text-gray-900">
                  {showViewer ? 'Hide' : 'Show'} Document Preview
                </span>
              </div>
              <span className="text-sm text-gray-500">
                {showViewer ? '▼' : '▶'}
              </span>
            </button>

            {showViewer && (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <div className="bg-gray-900 rounded-lg p-4 flex items-center justify-center min-h-[400px]">
                  <img
                    src={`${API_BASE_URL}/documents/${selectedDocument?.documentId}/view`}
                    alt="Document preview"
                    className="max-w-full max-h-[600px] object-contain rounded shadow-lg"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="gray">Document unavailable</text></svg>';
                    }}
                  />
                </div>
                <p className="text-center text-sm text-gray-500 mt-2">
                  {result?.documentName} - Page {currentPage?.page || selectedPage + 1}
                </p>
              </div>
            )}
          </div>

          {/* Page Analysis */}
          {currentPage && (
            <>
              {/* Integrated Verdict */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary-600" />
                  Integrated Analysis - Page {currentPage.page}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Forensic Analysis */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      Forensic Analysis
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Score:</span>
                        <span className="font-medium">{(currentPage.forensicAnalysis.score * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Verdict:</span>
                        <span className="font-medium">{currentPage.forensicAnalysis.verdict}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">ELA Hot Pixels:</span>
                        <span className="font-medium">{(currentPage.forensicAnalysis.metrics.ela_hot_pixels_ratio * 100).toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">RGB Std Dev:</span>
                        <span className="font-medium">{currentPage.forensicAnalysis.metrics.mean_rgb_std.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">SSIM Score:</span>
                        <span className="font-medium">{currentPage.forensicAnalysis.metrics.ssim_score.toFixed(4)}</span>
                      </div>
                    </div>

                    {currentPage.forensicAnalysis.reasons.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-gray-700 mb-1">Forensic Indicators:</p>
                        <ul className="space-y-1">
                          {currentPage.forensicAnalysis.reasons.map((reason, idx) => (
                            <li key={idx} className="text-xs text-gray-600 flex items-start gap-1">
                              <span className="text-primary-600 mt-0.5">•</span>
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* AI Analysis */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      AI Visual Analysis
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Confidence:</span>
                        <span className="font-medium">{currentPage.llmAnalysis.confidence_score}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Risk Level:</span>
                        <span className={`font-medium ${getRiskColor(currentPage.llmAnalysis.risk_level).split(' ')[0]}`}>
                          {currentPage.llmAnalysis.risk_level}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tampering:</span>
                        <span className="font-medium">
                          {currentPage.llmAnalysis.tampering_detected ? 'Detected' : 'Not Detected'}
                        </span>
                      </div>
                    </div>

                    {currentPage.llmAnalysis.document_identification && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs font-semibold text-gray-700">Document Type:</p>
                        <p className="text-xs text-gray-600">{currentPage.llmAnalysis.document_identification.document_type}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Combined Verdict */}
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border-l-4 border-primary-600">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-gray-900">Final Verdict</h4>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRiskColor(currentPage.integratedVerdict.risk_level)}`}>
                      {currentPage.integratedVerdict.verdict}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Combined Score:</span>
                      <span className="ml-2 font-medium">{(currentPage.integratedVerdict.combined_score * 100).toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Agreement:</span>
                      <span className="ml-2 font-medium">{currentPage.integratedVerdict.agreement}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Risk:</span>
                      <span className={`ml-2 font-medium ${getRiskColor(currentPage.integratedVerdict.risk_level).split(' ')[0]}`}>
                        {currentPage.integratedVerdict.risk_level}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Assessment */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">AI Assessment</h3>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {currentPage.llmAnalysis.overall_assessment}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Tampering Regions */}
              {currentPage.llmAnalysis.tampering_regions && currentPage.llmAnalysis.tampering_regions.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-primary-600" />
                  Detected Tampering Regions
                </h3>
                  <div className="space-y-4">
                    {currentPage.llmAnalysis.tampering_regions.map((region) => (
                      <div key={region.region_id} className="border border-red-200 rounded-lg p-4 bg-red-50">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-gray-900">Region {region.region_id}</h4>
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                            {region.confidence_this_region}% confidence
                          </span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">Location: </span>
                            <span className="text-gray-600">{region.exact_location}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Method: </span>
                            <span className="text-gray-600">{region.suspected_tampering_method}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Description: </span>
                            <span className="text-gray-600">{region.visual_description}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detected Anomalies */}
              {currentPage.llmAnalysis.detected_anomalies && currentPage.llmAnalysis.detected_anomalies.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Detected Anomalies</h3>
                  <div className="space-y-3">
                    {currentPage.llmAnalysis.detected_anomalies.map((anomaly, idx) => (
                      <div key={idx} className="border-l-4 border-orange-400 bg-orange-50 p-4 rounded-r-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="text-xs font-semibold text-orange-700 uppercase">{anomaly.category}</span>
                            <h4 className="font-semibold text-gray-900">{anomaly.issue}</h4>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            anomaly.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                            anomaly.severity === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                            anomaly.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {anomaly.severity}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">
                          <span className="font-medium">Location: </span>{anomaly.location}
                        </p>
                        <p className="text-sm text-gray-600">{anomaly.detailed_evidence}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {currentPage.llmAnalysis.recommendations && currentPage.llmAnalysis.recommendations.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Recommendations</h3>
                  <ul className="space-y-2">
                    {currentPage.llmAnalysis.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-gray-700">
                        <span className="text-primary-600 font-bold mt-1">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Detailed Reasoning */}
              {currentPage.llmAnalysis.detailed_reasoning && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Detailed Analysis</h3>
                  <div className="prose prose-sm max-w-none text-gray-700">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {currentPage.llmAnalysis.detailed_reasoning}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </>
          )}

          {/* New Analysis Button */}
          <button
            onClick={() => {
              setResult(null);
              setSelectedDocument(null);
              setSelectedPage(0);
            }}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors"
          >
            Analyze Another Document
          </button>
        </div>
      )}
    </div>
  );
}
