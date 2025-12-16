'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  XMarkIcon,
  DocumentMagnifyingGlassIcon,
  DocumentTextIcon,
  ShieldExclamationIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DocumentViewer from './DocumentViewer';
import { API_BASE_URL } from '@/config/api';

interface AnalysisResultViewerProps {
  result: any;
  analysisType: 'clinical' | 'comprehensive' | 'fraud-detection' | 'revenue-leakage';
  onClose: () => void;
  documents?: { id: string; name: string; blobPath: string; documentId?: string }[];
}

const AnalysisResultViewer: React.FC<AnalysisResultViewerProps> = ({ result, analysisType, onClose, documents }) => {
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{ name: string; url: string } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleViewDocument = (doc: { id: string; name: string; blobPath: string; documentId?: string }) => {
    // Use documentId if available, otherwise fall back to id
    const docId = doc.documentId || doc.id;
    const docUrl = `${API_BASE_URL}/documents/${docId}/view`;
    setSelectedDocument({ name: doc.name, url: docUrl });
    setShowDocumentViewer(true);
    setShowDropdown(false);
  };

  const getIcon = () => {
    switch (analysisType) {
      case 'clinical':
        return DocumentMagnifyingGlassIcon;
      case 'comprehensive':
        return DocumentTextIcon;
      case 'fraud-detection':
        return ShieldExclamationIcon;
      case 'revenue-leakage':
        return CurrencyDollarIcon;
    }
  };

  const getTitle = () => {
    switch (analysisType) {
      case 'clinical':
        return 'Handwritten Document Analysis';
      case 'comprehensive':
        return 'Comprehensive Analysis';
      case 'fraud-detection':
        return 'Fraud Detection Analysis';
      case 'revenue-leakage':
        return 'Revenue Leakage Analysis';
    }
  };

  const Icon = getIcon();

  const renderClinicalAnalysis = () => {
    let medicalAnalysis = result.medical_analysis || result.medicalAnalysis;
    
    if (typeof medicalAnalysis === 'object' && medicalAnalysis !== null) {
      medicalAnalysis = medicalAnalysis.medical_analysis || medicalAnalysis.medicalAnalysis || JSON.stringify(medicalAnalysis, null, 2);
    }

    return (
      <div className="space-y-4">
        {/* Document Information */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">Document Information</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">File Name:</span>
              <p className="font-medium">{result.image_name || result.imageName || 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-600">Analysis Time:</span>
              <p className="font-medium">
                {(result.analysis_timestamp || result.analysisTimestamp) ? 
                  new Date(result.analysis_timestamp || result.analysisTimestamp).toLocaleString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Medical Analysis */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h4 className="font-medium text-gray-900 mb-3">Medical Analysis</h4>
          
          <div className="text-gray-700 leading-relaxed max-h-[60vh] overflow-y-auto">
            {typeof medicalAnalysis === 'string' && medicalAnalysis.trim() ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({node, ...props}) => <h1 className="text-xl font-bold text-gray-900 mb-4 mt-6" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-lg font-bold text-gray-900 mb-3 mt-5" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-base font-semibold text-gray-900 mb-2 mt-4" {...props} />,
                    h4: ({node, ...props}) => <h4 className="text-sm font-semibold text-gray-900 mb-2 mt-3" {...props} />,
                    p: ({node, ...props}) => <p className="mb-3 text-gray-700 leading-relaxed" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc ml-6 mb-3 space-y-1" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal ml-6 mb-3 space-y-1" {...props} />,
                    li: ({node, ...props}) => <li className="text-gray-700" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-semibold text-gray-900" {...props} />,
                    em: ({node, ...props}) => <em className="italic text-gray-700" {...props} />,
                    hr: ({node, ...props}) => <hr className="my-6 border-gray-300" {...props} />,
                    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-400 pl-4 italic text-gray-700 my-4" {...props} />,
                    code: ({node, ...props}: any) => {
                      const isInline = !props.className?.includes('language-');
                      return isInline ? (
                        <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono text-gray-800" {...props} />
                      ) : (
                        <code className="block bg-gray-100 p-3 rounded text-sm font-mono text-gray-800 overflow-x-auto" {...props} />
                      );
                    }
                  }}
                >
                  {medicalAnalysis}
                </ReactMarkdown>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap text-sm bg-gray-100 p-3 rounded overflow-auto max-h-96">
                {JSON.stringify(medicalAnalysis, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderComprehensiveAnalysis = () => {
    // Check if it's a structured comprehensive report (with reportMetadata, executiveSummary, etc.)
    if (result.reportMetadata || result.executiveSummary || result.clinicalOverview || result.detailedAnalysis) {
      // Render structured format (existing ComprehensiveAnalysis format)
      return (
        <div className="space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Report Header */}
          {result.reportMetadata && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="border-b-2 border-gray-800 pb-2 mb-4">
                <h4 className="text-xl font-bold text-center text-gray-900 tracking-wide">
                  COMPREHENSIVE DOCUMENT REPORT ANALYSIS
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Report Generated:</span>
                  <span className="ml-2 text-gray-800">
                    {result.reportMetadata.generationTimestamp ? 
                      new Date(result.reportMetadata.generationTimestamp).toLocaleString() : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Documents Analyzed:</span>
                  <span className="ml-2 text-gray-800">{result.reportMetadata.totalDocumentsAnalyzed || 0}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Successful Analyses:</span>
                  <span className="ml-2 text-gray-800">{result.reportMetadata.successfulAnalyses || 0}</span>
                </div>
              </div>
            </div>
          )}

          {/* Executive Summary */}
          {result.executiveSummary && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center mb-4">
                <div className="text-2xl mr-3">📋</div>
                <h5 className="text-lg font-bold text-gray-900">EXECUTIVE SUMMARY</h5>
              </div>
              <div className="border-t border-gray-300 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="flex items-center">
                    <span className="text-blue-600 mr-2 font-bold">•</span>
                    <span className="text-sm">
                      <span className="font-medium">Unique Diagnoses:</span> {result.executiveSummary.totalUniqueDiagnoses || 0}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-blue-600 mr-2 font-bold">•</span>
                    <span className="text-sm">
                      <span className="font-medium">Medications:</span> {result.executiveSummary.totalMedications || 0}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-blue-600 mr-2 font-bold">•</span>
                    <span className="text-sm">
                      <span className="font-medium">Symptoms:</span> {result.executiveSummary.totalSymptomsReported || 0}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-blue-600 mr-2 font-bold">•</span>
                    <span className="text-sm">
                      <span className="font-medium">Critical Alerts:</span> {result.executiveSummary.criticalAlerts || 0}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-blue-600 mr-2 font-bold">•</span>
                    <span className="text-sm">
                      <span className="font-medium">Key Findings:</span> {result.executiveSummary.totalFindings || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Clinical Overview */}
          {result.clinicalOverview && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center mb-4">
                <div className="text-2xl mr-3">🏥</div>
                <h5 className="text-lg font-bold text-gray-900">CLINICAL OVERVIEW</h5>
              </div>
              <div className="border-t border-gray-300 pt-4 space-y-6">
                {/* Primary Diagnoses */}
                <div>
                  <div className="flex items-center mb-3">
                    <div className="text-lg mr-2">📊</div>
                    <h6 className="font-bold text-gray-800">PRIMARY DIAGNOSES:</h6>
                  </div>
                  {result.clinicalOverview.primaryDiagnoses && result.clinicalOverview.primaryDiagnoses.length > 0 ? (
                    <div className="ml-6 space-y-1">
                      {result.clinicalOverview.primaryDiagnoses.map((diagnosis: string, idx: number) => (
                        <div key={idx} className="text-sm text-gray-700">
                          <span className="font-medium">{idx + 1}.</span> {diagnosis}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="ml-6 text-sm text-gray-500">No diagnoses clearly identified</div>
                  )}
                </div>

                {/* Key Symptoms */}
                <div>
                  <div className="flex items-center mb-3">
                    <div className="text-lg mr-2">🔍</div>
                    <h6 className="font-bold text-gray-800">KEY SYMPTOMS:</h6>
                  </div>
                  {result.clinicalOverview.keySymptoms && result.clinicalOverview.keySymptoms.length > 0 ? (
                    <div className="ml-6 space-y-1">
                      {result.clinicalOverview.keySymptoms.map((symptom: string, idx: number) => (
                        <div key={idx} className="text-sm text-gray-700">
                          <span className="font-medium">{idx + 1}.</span> {symptom}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="ml-6 text-sm text-gray-500">No symptoms clearly identified</div>
                  )}
                </div>

                {/* Current Medications */}
                <div>
                  <div className="flex items-center mb-3">
                    <div className="text-lg mr-2">💊</div>
                    <h6 className="font-bold text-gray-800">CURRENT MEDICATIONS:</h6>
                  </div>
                  {result.clinicalOverview.currentMedications && result.clinicalOverview.currentMedications.length > 0 ? (
                    <div className="ml-6 space-y-2">
                      {result.clinicalOverview.currentMedications.map((med: any, idx: number) => (
                        <div key={idx} className="text-sm text-gray-700">
                          <div>
                            <span className="font-medium">{idx + 1}.</span> 
                            {typeof med === 'object' ? (
                              <>
                                <span className="font-medium"> {med.name || 'Unknown'}</span>
                                {med.dosage && <span> - {med.dosage}</span>}
                                {med.frequency && <div className="ml-4 text-xs text-gray-600">Frequency: {med.frequency}</div>}
                                {med.indication && <div className="ml-4 text-xs text-gray-600">Indication: {med.indication}</div>}
                              </>
                            ) : (
                              <span> {med}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="ml-6 text-sm text-gray-500">No medications clearly identified</div>
                  )}
                </div>

                {/* Critical Findings */}
                {result.clinicalOverview.criticalFindings && result.clinicalOverview.criticalFindings.length > 0 && (
                  <div>
                    <div className="flex items-center mb-3">
                      <div className="text-lg mr-2">🚨</div>
                      <h6 className="font-bold text-blue-800">CRITICAL FINDINGS & RED FLAGS:</h6>
                    </div>
                    <div className="border-t border-blue-300 pt-4">
                      <div className="ml-6 space-y-1">
                        {result.clinicalOverview.criticalFindings.map((finding: string, idx: number) => (
                          <div key={idx} className="text-sm text-blue-700 bg-blue-50 p-2 rounded">
                            <span className="font-medium">{idx + 1}.</span> {finding}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Key Findings */}
                <div>
                  <div className="flex items-center mb-3">
                    <div className="text-lg mr-2">🔬</div>
                    <h6 className="font-bold text-gray-800">KEY FINDINGS:</h6>
                  </div>
                  <div className="border-t border-gray-300 pt-4">
                    {result.clinicalOverview.keyMedicalFindings && result.clinicalOverview.keyMedicalFindings.length > 0 ? (
                      <div className="ml-6 space-y-1">
                        {result.clinicalOverview.keyMedicalFindings.map((finding: string, idx: number) => (
                          <div key={idx} className="text-sm text-gray-700">
                            <span className="font-medium">{idx + 1}.</span> {finding}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="ml-6 text-sm text-gray-500">No specific key findings identified</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Document Summaries */}
          {result.documentSummaries && result.documentSummaries.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center mb-4">
                <div className="text-2xl mr-3">📄</div>
                <h5 className="text-lg font-bold text-gray-900">DOCUMENT SUMMARIES</h5>
              </div>
              <div className="border-t border-gray-300 pt-4 space-y-4">
                {result.documentSummaries.map((doc: any, idx: number) => (
                  <div key={idx} className="border-l-4 border-blue-500 pl-4">
                    <div className="flex items-center mb-2">
                      <div className="text-base mr-2">📋</div>
                      <h6 className="font-bold text-gray-800">
                        {doc.documentName || doc.document || `Document ${idx + 1}`}
                      </h6>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed ml-6">{doc.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    
    // Otherwise, handle as simple text analysis
    let analysis = result.analysis || 
                   result.comprehensive_analysis || 
                   result.comprehensiveAnalysis ||
                   result.medical_analysis ||
                   result.medicalAnalysis;
    
    // If it's an object, try to extract the text content
    if (typeof analysis === 'object' && analysis !== null) {
      analysis = analysis.analysis || 
                 analysis.comprehensive_analysis || 
                 analysis.comprehensiveAnalysis ||
                 analysis.medical_analysis ||
                 analysis.medicalAnalysis ||
                 JSON.stringify(analysis, null, 2);
    }
    
    // If still no analysis, try to get it from the root result
    if (!analysis || (typeof analysis === 'string' && !analysis.trim())) {
      analysis = JSON.stringify(result, null, 2);
    }

    return (
      <div className="space-y-4">
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h4 className="font-medium text-gray-900 mb-3">Comprehensive Medical Analysis</h4>
          
          <div className="text-gray-700 leading-relaxed max-h-[60vh] overflow-y-auto">
            {typeof analysis === 'string' && analysis.trim() ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({node, ...props}) => <h1 className="text-xl font-bold text-gray-900 mb-4 mt-6" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-lg font-bold text-gray-900 mb-3 mt-5" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-base font-semibold text-gray-900 mb-2 mt-4" {...props} />,
                    h4: ({node, ...props}) => <h4 className="text-sm font-semibold text-gray-900 mb-2 mt-3" {...props} />,
                    p: ({node, ...props}) => <p className="mb-3 text-gray-700 leading-relaxed" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc ml-6 mb-3 space-y-1" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal ml-6 mb-3 space-y-1" {...props} />,
                    li: ({node, ...props}) => <li className="text-gray-700" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-semibold text-gray-900" {...props} />,
                    em: ({node, ...props}) => <em className="italic text-gray-700" {...props} />,
                    hr: ({node, ...props}) => <hr className="my-6 border-gray-300" {...props} />,
                    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-400 pl-4 italic text-gray-700 my-4" {...props} />,
                    code: ({node, ...props}: any) => {
                      const isInline = !props.className?.includes('language-');
                      return isInline ? (
                        <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono text-gray-800" {...props} />
                      ) : (
                        <code className="block bg-gray-100 p-3 rounded text-sm font-mono text-gray-800 overflow-x-auto" {...props} />
                      );
                    }
                  }}
                >
                  {analysis}
                </ReactMarkdown>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap text-sm bg-gray-100 p-3 rounded overflow-auto max-h-96">
                {JSON.stringify(analysis, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderFraudDetection = () => {
    // Backend structure: { fraudRiskLevel, totalFraudIndicators, fraudIndicators: { medicationsBilledButNotInRecords, proceduresBilledButNotDocumented }, recommendations, detailedAnalysis }
    const fraudRisk = result.fraudRiskLevel || 'UNKNOWN';
    const totalIndicators = result.totalFraudIndicators || 0;
    const medications = result.fraudIndicators?.medicationsBilledButNotInRecords || [];
    const procedures = result.fraudIndicators?.proceduresBilledButNotDocumented || [];
    const recommendations = result.recommendations || [];
    const detailedAnalysis = result.detailedAnalysis;

    return (
      <div className="space-y-6 max-h-[60vh] overflow-y-auto">
        {/* Fraud Risk Summary */}
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-red-900 mb-1">Fraud Risk Level</h4>
              <p className="text-2xl font-bold text-red-700">{fraudRisk}</p>
            </div>
            <div className="text-right">
              <h4 className="font-semibold text-red-900 mb-1">Total Indicators</h4>
              <p className="text-2xl font-bold text-red-700">{totalIndicators}</p>
            </div>
          </div>
        </div>

        {/* Medications Billed But Not In Records */}
        {medications.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">
              Medications Billed But Not In Medical Records ({medications.length})
            </h4>
            <div className="space-y-3">
              {medications.map((med: any, idx: number) => {
                // Handle both string and object formats
                const medName = typeof med === 'string' ? med : (med.medication || med.name || JSON.stringify(med));
                const billedIn = typeof med === 'object' ? med.billed_in : null;
                const concern = typeof med === 'object' ? med.concern : null;
                const status = typeof med === 'object' ? med.status : null;
                
                return (
                  <div key={idx} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-red-900">{medName}</p>
                        {billedIn && <p className="text-xs text-red-700 mt-1">Billed in: {billedIn}</p>}
                        {status && <p className="text-xs text-red-700 mt-1">Status: {status}</p>}
                        {concern && <p className="text-sm text-red-800 mt-2">{concern}</p>}
                      </div>
                      <span className="px-3 py-1 bg-red-600 text-white text-xs rounded-full font-medium ml-2">
                        Fraud Risk
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Procedures Billed But Not Documented */}
        {procedures.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">
              Procedures Billed But Not Documented ({procedures.length})
            </h4>
            <div className="space-y-3">
              {procedures.map((proc: any, idx: number) => {
                // Handle both string and object formats
                const procName = typeof proc === 'string' ? proc : (proc.procedure || proc.name || JSON.stringify(proc));
                const billedIn = typeof proc === 'object' ? proc.billed_in : null;
                const concern = typeof proc === 'object' ? proc.concern : null;
                const status = typeof proc === 'object' ? proc.status : null;
                
                return (
                  <div key={idx} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-red-900">{procName}</p>
                        {billedIn && <p className="text-xs text-red-700 mt-1">Billed in: {billedIn}</p>}
                        {status && <p className="text-xs text-red-700 mt-1">Status: {status}</p>}
                        {concern && <p className="text-sm text-red-800 mt-2">{concern}</p>}
                      </div>
                      <span className="px-3 py-1 bg-red-600 text-white text-xs rounded-full font-medium ml-2">
                        Fraud Risk
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-3">Fraud Investigation Recommendations</h4>
            <ul className="space-y-2">
              {recommendations.map((rec: string, idx: number) => (
                <li key={idx} className="text-sm text-blue-800 flex items-start">
                  <span className="mr-2">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Detailed Analysis from backend mismatch result */}
        {detailedAnalysis && (
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3">Detailed Mismatch Analysis</h4>
            <div className="space-y-4">
              {/* Bill vs Medical Mismatches */}
              {detailedAnalysis.bill_vs_medical_mismatches && (
                <div>
                  <h5 className="font-medium text-gray-800 mb-2">Bill vs Medical Record Analysis</h5>
                  {detailedAnalysis.bill_vs_medical_mismatches.medications_billed_but_not_in_medical_records?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-red-700 mb-1">Medications Billed But Not In Records:</p>
                      <ul className="list-disc ml-6 text-sm text-gray-700 space-y-1">
                        {detailedAnalysis.bill_vs_medical_mismatches.medications_billed_but_not_in_medical_records.map((item: any, i: number) => {
                          const medName = typeof item === 'string' ? item : (item.medication || item.name || '');
                          const concern = typeof item === 'object' ? item.concern : null;
                          return (
                            <li key={i}>
                              <span className="font-medium">{medName}</span>
                              {concern && <span className="text-gray-600"> - {concern}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {detailedAnalysis.bill_vs_medical_mismatches.procedures_billed_but_not_documented?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-red-700 mb-1">Procedures Billed But Not Documented:</p>
                      <ul className="list-disc ml-6 text-sm text-gray-700 space-y-1">
                        {detailedAnalysis.bill_vs_medical_mismatches.procedures_billed_but_not_documented.map((item: any, i: number) => {
                          const procName = typeof item === 'string' ? item : (item.procedure || item.name || '');
                          const concern = typeof item === 'object' ? item.concern : null;
                          return (
                            <li key={i}>
                              <span className="font-medium">{procName}</span>
                              {concern && <span className="text-gray-600"> - {concern}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Revenue Impact */}
              {detailedAnalysis.revenue_impact_analysis && (
                <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                  <h5 className="font-medium text-gray-800 mb-2">Revenue Impact Analysis</h5>
                  {detailedAnalysis.revenue_impact_analysis.potential_fraud_indicators && (
                    <div className="text-sm text-gray-700">
                      <p><strong>Risk Level:</strong> {detailedAnalysis.revenue_impact_analysis.potential_fraud_indicators.risk_level}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRevenueLeakage = () => {
    // Backend structure: { revenueImpactLevel, totalLeakageOpportunities, leakageOpportunities: { unbilledMedications, unbilledServices }, recommendations, detailedAnalysis }
    const revenueImpact = result.revenueImpactLevel || 'UNKNOWN';
    const totalOpportunities = result.totalLeakageOpportunities || 0;
    const unbilledMeds = result.leakageOpportunities?.unbilledMedications || [];
    const unbilledServices = result.leakageOpportunities?.unbilledServices || [];
    const recommendations = result.recommendations || [];
    const detailedAnalysis = result.detailedAnalysis;

    return (
      <div className="space-y-6 max-h-[60vh] overflow-y-auto">
        {/* Revenue Impact Summary */}
        <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-yellow-900 mb-1">Revenue Impact Level</h4>
              <p className="text-2xl font-bold text-yellow-700">{revenueImpact}</p>
            </div>
            <div className="text-right">
              <h4 className="font-semibold text-yellow-900 mb-1">Total Opportunities</h4>
              <p className="text-2xl font-bold text-yellow-700">{totalOpportunities}</p>
            </div>
          </div>
        </div>

        {/* Unbilled Medications */}
        {unbilledMeds.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">
              Unbilled Medications ({unbilledMeds.length})
            </h4>
            <div className="space-y-3">
              {unbilledMeds.map((med: any, idx: number) => {
                // Handle both string and object formats
                const medName = typeof med === 'string' ? med : (med.medication || med.name || JSON.stringify(med));
                const searchedIn = typeof med === 'object' ? med.searched_in : null;
                const concern = typeof med === 'object' ? med.concern : null;
                const status = typeof med === 'object' ? med.status : null;
                
                return (
                  <div key={idx} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-yellow-900">{medName}</p>
                        {searchedIn && <p className="text-xs text-yellow-700 mt-1">Searched in: {searchedIn}</p>}
                        {status && <p className="text-xs text-yellow-700 mt-1">Status: {status}</p>}
                        {concern && <p className="text-sm text-yellow-800 mt-2">{concern}</p>}
                      </div>
                      <span className="px-3 py-1 bg-yellow-600 text-white text-xs rounded-full font-medium ml-2">
                        Unbilled
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unbilled Services */}
        {unbilledServices.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">
              Unbilled Services ({unbilledServices.length})
            </h4>
            <div className="space-y-3">
              {unbilledServices.map((service: any, idx: number) => {
                // Handle both string and object formats
                const serviceName = typeof service === 'string' ? service : (service.service || service.name || JSON.stringify(service));
                const searchedIn = typeof service === 'object' ? service.searched_in : null;
                const concern = typeof service === 'object' ? service.concern : null;
                const status = typeof service === 'object' ? service.status : null;
                
                return (
                  <div key={idx} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-yellow-900">{serviceName}</p>
                        {searchedIn && <p className="text-xs text-yellow-700 mt-1">Searched in: {searchedIn}</p>}
                        {status && <p className="text-xs text-yellow-700 mt-1">Status: {status}</p>}
                        {concern && <p className="text-sm text-yellow-800 mt-2">{concern}</p>}
                      </div>
                      <span className="px-3 py-1 bg-yellow-600 text-white text-xs rounded-full font-medium ml-2">
                        Unbilled
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-3">Revenue Recovery Recommendations</h4>
            <ul className="space-y-2">
              {recommendations.map((rec: string, idx: number) => (
                <li key={idx} className="text-sm text-blue-800 flex items-start">
                  <span className="mr-2">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Detailed Analysis from backend mismatch result */}
        {detailedAnalysis && (
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3">Detailed Mismatch Analysis</h4>
            <div className="space-y-4">
              {/* Bill vs Medical Mismatches */}
              {detailedAnalysis.bill_vs_medical_mismatches && (
                <div>
                  <h5 className="font-medium text-gray-800 mb-2">Bill vs Medical Record Analysis</h5>
                  {detailedAnalysis.bill_vs_medical_mismatches.medications_in_medical_records_but_not_billed?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-yellow-700 mb-1">Medications In Records But Not Billed:</p>
                      <ul className="list-disc ml-6 text-sm text-gray-700 space-y-1">
                        {detailedAnalysis.bill_vs_medical_mismatches.medications_in_medical_records_but_not_billed.map((item: any, i: number) => {
                          const medName = typeof item === 'string' ? item : (item.medication || item.name || '');
                          const concern = typeof item === 'object' ? item.concern : null;
                          return (
                            <li key={i}>
                              <span className="font-medium">{medName}</span>
                              {concern && <span className="text-gray-600"> - {concern}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {detailedAnalysis.bill_vs_medical_mismatches.services_documented_but_not_billed?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-yellow-700 mb-1">Services Documented But Not Billed:</p>
                      <ul className="list-disc ml-6 text-sm text-gray-700 space-y-1">
                        {detailedAnalysis.bill_vs_medical_mismatches.services_documented_but_not_billed.map((item: any, i: number) => {
                          const serviceName = typeof item === 'string' ? item : (item.service || item.name || '');
                          const concern = typeof item === 'object' ? item.concern : null;
                          return (
                            <li key={i}>
                              <span className="font-medium">{serviceName}</span>
                              {concern && <span className="text-gray-600"> - {concern}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Revenue Impact */}
              {detailedAnalysis.revenue_impact_analysis && (
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <h5 className="font-medium text-gray-800 mb-2">Revenue Impact Analysis</h5>
                  {detailedAnalysis.revenue_impact_analysis.potential_revenue_leakage && (
                    <div className="text-sm text-gray-700">
                      <p><strong>Estimated Impact:</strong> {detailedAnalysis.revenue_impact_analysis.potential_revenue_leakage.estimated_impact}</p>
                      {detailedAnalysis.revenue_impact_analysis.potential_revenue_leakage.estimated_amount && (
                        <p><strong>Estimated Amount:</strong> {detailedAnalysis.revenue_impact_analysis.potential_revenue_leakage.estimated_amount}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (analysisType) {
      case 'clinical':
        return renderClinicalAnalysis();
      case 'comprehensive':
        return renderComprehensiveAnalysis();
      case 'fraud-detection':
        return renderFraudDetection();
      case 'revenue-leakage':
        return renderRevenueLeakage();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-600 to-blue-600 text-white p-6 flex items-center justify-between">
            <div className="flex items-center">
              <Icon className="h-8 w-8 mr-3" />
              <div>
                <h2 className="text-2xl font-bold">{getTitle()}</h2>
                <p className="text-blue-100 text-sm">Analysis Results</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 180px)' }}>
            {renderContent()}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 p-4 flex items-center justify-between border-t border-gray-200">
            <div className="flex items-center">
              <CheckCircleIcon className="w-5 h-5 text-blue-600 mr-2" />
              <span className="text-blue-600 font-medium">Analysis completed successfully</span>
            </div>
            <div className="flex gap-3">
              {documents && documents.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center"
                  >
                    <EyeIcon className="w-5 h-5 mr-2" />
                    View Documents ({documents.length})
                  </button>
                  {showDropdown && (
                    <div className="absolute bottom-full right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-xl p-2 min-w-[250px] z-50 max-h-[300px] overflow-y-auto">
                      {documents.map((doc) => (
                        <button
                          key={doc.id}
                          onClick={() => handleViewDocument(doc)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 rounded text-sm text-gray-700 hover:text-blue-600 transition-colors flex items-center"
                        >
                          <DocumentTextIcon className="w-4 h-4 mr-2 flex-shrink-0" />
                          <span className="truncate">{doc.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Document Viewer Modal */}
      {showDocumentViewer && selectedDocument && (
        <DocumentViewer
          documentUrl={selectedDocument.url}
          documentName={selectedDocument.name}
          analysisData={result}
          onClose={() => {
            setShowDocumentViewer(false);
            setSelectedDocument(null);
          }}
        />
      )}
    </AnimatePresence>
  );
};

export default AnalysisResultViewer;
