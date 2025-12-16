'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { 
  CloudArrowUpIcon,
  DocumentTextIcon,
  PlayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  TrashIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { MedicalDocument, ComprehensiveReport } from '@/types/medical';
import { ApiService } from '@/lib/api';
import { API_BASE_URL } from '@/config/api';
import DocumentViewer from './DocumentViewer';
import SampleDocumentsButton from './SampleDocumentsButton';

interface ComprehensiveAnalysisProps {
  onAnalysisComplete?: (report: ComprehensiveReport) => void;
}

export default function ComprehensiveAnalysis({ onAnalysisComplete }: ComprehensiveAnalysisProps) {
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<Record<string, string>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<ComprehensiveReport | null>(null);
  const [documentPreviewUrls, setDocumentPreviewUrls] = useState<Record<string, string>>({});
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [selectedDocumentForViewing, setSelectedDocumentForViewing] = useState<{
    url: string;
    name: string;
    analysis: any;
  } | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newDocuments: MedicalDocument[] = acceptedFiles.map((file, index) => ({
      id: `temp-${Date.now()}-${index}`,
      name: file.name,
      path: file.name,
      type: getDocumentType(file.name),
      uploadedAt: new Date().toISOString(),
      size: file.size,
      status: 'pending'
    }));

    // Create preview URLs for all files
    const newPreviewUrls: Record<string, string> = {};
    acceptedFiles.forEach((file, index) => {
      const tempId = newDocuments[index].id;
      newPreviewUrls[tempId] = URL.createObjectURL(file);
    });
    setDocumentPreviewUrls(prev => ({ ...prev, ...newPreviewUrls }));

    setDocuments(prev => [...prev, ...newDocuments]);
    
    // Upload files immediately
    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      const tempDoc = newDocuments[i];
      
      try {
        // Update status to processing
        setDocuments(prev => prev.map(doc => 
          doc.id === tempDoc.id ? { ...doc, status: 'processing' as const } : doc
        ));

        const uploadResult = await ApiService.uploadDocument(file);
        
        if (uploadResult.success && uploadResult.data) {
          const newDocId = uploadResult.data!.documentId;
          
          // Store the mapping of temp ID to real document ID
          setUploadedDocuments(prev => ({
            ...prev,
            [tempDoc.id]: newDocId
          }));
          
          // Transfer preview URL from temp ID to new ID
          setDocumentPreviewUrls(prev => {
            const updated = { ...prev };
            if (updated[tempDoc.id]) {
              updated[newDocId] = updated[tempDoc.id];
              delete updated[tempDoc.id];
            }
            return updated;
          });
          
          // Update document with real ID and mark as completed
          setDocuments(prev => prev.map(doc => 
            doc.id === tempDoc.id ? { 
              ...doc, 
              id: newDocId,
              status: 'completed' as const 
            } : doc
          ));
          
          toast.success(`Uploaded: ${file.name}`);
        } else {
          throw new Error(uploadResult.error || 'Upload failed');
        }
      } catch (error) {
        console.error('Upload error:', error);
        setDocuments(prev => prev.map(doc => 
          doc.id === tempDoc.id ? { ...doc, status: 'failed' as const } : doc
        ));
        toast.error(`Failed to upload: ${file.name}`);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'],
      'application/pdf': ['.pdf']
    },
    multiple: true
  });

  const getDocumentType = (fileName: string) => {
    const name = fileName.toLowerCase();
    if (name.includes('prescription') || name.includes('rx')) return 'prescription';
    if (name.includes('lab') || name.includes('test')) return 'lab_report';
    if (name.includes('discharge')) return 'discharge_summary';
    if (name.includes('consultation') || name.includes('consult')) return 'consultation_note';
    if (name.includes('bill') || name.includes('invoice')) return 'medical_bill';
    return 'other';
  };

  const handleSamplesLoaded = async (documentIds: string[], _filenameMap?: Record<string, string>) => {
    for (const docId of documentIds) {
      try {
        const response = await fetch(`${API_BASE_URL}/documents/${docId}/view`);
        const blob = await response.blob();
        const fileName = `medical_${Date.now()}.pdf`;
        
        const newDoc: MedicalDocument = {
          id: docId,
          name: fileName,
          path: fileName,
          type: 'medical_record',
          uploadedAt: new Date().toISOString(),
          size: blob.size,
          status: 'completed'
        };
        
        const previewUrl = URL.createObjectURL(blob);
        setDocumentPreviewUrls(prev => ({ ...prev, [docId]: previewUrl }));
        setDocuments(prev => [...prev, newDoc]);
        setUploadedDocuments(prev => ({ ...prev, [docId]: docId }));
      } catch (error) {
        console.error(`Error loading sample ${docId}:`, error);
        toast.error('Failed to load sample document');
      }
    }
  };

  const removeDocument = (id: string) => {
    // Clean up preview URL
    if (documentPreviewUrls[id]) {
      URL.revokeObjectURL(documentPreviewUrls[id]);
      setDocumentPreviewUrls(prev => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
    }
    
    setDocuments(prev => prev.filter(doc => doc.id !== id));
    toast.success('Document removed');
  };

  const viewDocument = (docName: string, docAnalysis: any) => {
    console.log('viewDocument called with:', docName);
    console.log('Available documents:', documents);
    console.log('Available preview URLs:', documentPreviewUrls);
    
    // Try multiple matching strategies
    let doc = documents.find(d => d.name === docName);
    
    // If not found by exact name, try to find by partial match
    if (!doc) {
      doc = documents.find(d => 
        d.name.includes(docName) || docName.includes(d.name)
      );
    }
    
    // If still not found, try by index if we have the same number of documents
    if (!doc && analysisResult?.documentSummaries) {
      const docIndex = analysisResult.documentSummaries.findIndex(
        summary => (summary.documentName || (summary as any).document) === docName
      );
      if (docIndex >= 0 && docIndex < documents.length) {
        doc = documents[docIndex];
      }
    }
    
    if (!doc) {
      console.error('Document not found:', docName);
      toast.error('Document preview not available - document not found');
      return;
    }

    const previewUrl = documentPreviewUrls[doc.id];
    console.log('Found document:', doc);
    console.log('Preview URL:', previewUrl);
    
    if (!previewUrl) {
      console.error('Preview URL not found for document ID:', doc.id);
      toast.error('Document preview not available - no preview URL');
      return;
    }

    setSelectedDocumentForViewing({
      url: previewUrl,
      name: docName,
      analysis: docAnalysis
    });
    setShowDocumentViewer(true);
  };

  const startAnalysis = async () => {
    const completedDocs = documents.filter(doc => doc.status === 'completed');
    if (completedDocs.length === 0) {
      toast.error('Please upload at least one document');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    try {
      // Get the real document IDs
      const documentIds = completedDocs.map(doc => doc.id);
      
      // Start comprehensive analysis via API
      const analysisResponse = await ApiService.startComprehensiveAnalysis(documentIds);

      if (!analysisResponse.success || !analysisResponse.data) {
        throw new Error(analysisResponse.error || 'Failed to start analysis');
      }

      const { jobId } = analysisResponse.data;
      
      // Update document statuses
      setDocuments(prev => prev.map(doc => 
        doc.status === 'completed' ? { ...doc, status: 'processing' as const } : doc
      ));

      // Poll for results
      await pollForResults(jobId);
      
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Analysis failed. Please try again.');
      setDocuments(prev => prev.map(doc => 
        doc.status === 'processing' ? { ...doc, status: 'failed' as const } : doc
      ));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const pollForResults = async (jobId: string) => {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;
    
    const poll = async () => {
      try {
        const statusResponse = await ApiService.getAnalysisStatus(jobId);
        
        if (!statusResponse.success || !statusResponse.data) {
          throw new Error(statusResponse.error || 'Failed to get status');
        }
        
        const status = statusResponse.data;
        setAnalysisProgress(status.progress || 0);
        
        if (status.status === 'completed') {
          // Get the result
          const resultResponse = await ApiService.getAnalysisResult(jobId);
          
          if (!resultResponse.success || !resultResponse.data) {
            throw new Error(resultResponse.error || 'Failed to get result');
          }
          
          console.log('Comprehensive Analysis Result:', resultResponse.data.result);
          setAnalysisResult(resultResponse.data.result);
          setDocuments(prev => prev.map(doc => 
            doc.status === 'processing' ? { ...doc, status: 'completed' as const } : doc
          ));
          toast.success('Analysis completed successfully!');
          
          if (onAnalysisComplete && resultResponse.data.result) {
            onAnalysisComplete(resultResponse.data.result);
          }
          return;
        }
        
        if (status.status === 'failed') {
          throw new Error(status.error || 'Analysis failed');
        }
        
        // Continue polling if still processing
        if (attempts < maxAttempts && status.status === 'processing') {
          attempts++;
          setTimeout(poll, 2000); // Poll every 2 seconds
        } else if (attempts >= maxAttempts) {
          throw new Error('Analysis timeout');
        }
        
      } catch (error) {
        console.error('Polling error:', error);
        throw error;
      }
    };
    
    await poll();
  };

  const simulateComprehensiveAnalysis = async (docs: MedicalDocument[]): Promise<ComprehensiveReport> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return {
      reportMetadata: {
        generationTimestamp: new Date().toISOString(),
        totalDocumentsAnalyzed: docs.length,
        successfulAnalyses: docs.length,
        failedAnalyses: 0,
        analysisType: 'Comprehensive Medical Report Analysis'
      },
      executiveSummary: {
        totalUniqueDiagnoses: 5,
        totalMedications: 12,
        totalSymptomsReported: 8,
        criticalAlerts: 2,
        totalFindings: 15
      },
      clinicalOverview: {
        primaryDiagnoses: ['Hypertension', 'Type 2 Diabetes', 'Chronic Kidney Disease'],
        keySymptoms: ['Fatigue', 'Shortness of breath', 'Swelling'],
        currentMedications: [
          {
            name: 'Metformin',
            dosage: '500mg',
            frequency: 'Twice daily',
            duration: 'Ongoing',
            indication: 'Diabetes management',
            route: 'oral'
          },
          {
            name: 'Lisinopril',
            dosage: '10mg',
            frequency: 'Once daily',
            duration: 'Ongoing',
            indication: 'Blood pressure control',
            route: 'oral'
          }
        ],
        criticalFindings: ['Elevated creatinine levels', 'Uncontrolled blood pressure'],
        keyMedicalFindings: ['Microalbuminuria', 'Left ventricular hypertrophy']
      },
      documentSummaries: docs.map(doc => ({
        documentName: doc.name,
        documentType: doc.type,
        summary: `Comprehensive analysis of ${doc.type} document revealing significant medical findings.`
      })),
      detailedAnalysis: []
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-blue-600';
      case 'processing': return 'text-primary-600';
      case 'failed': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return CheckCircleIcon;
      case 'failed': return ExclamationCircleIcon;
      default: return DocumentTextIcon;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Comprehensive Document Analysis</h2>
        <p className="text-gray-600">
          Upload multiple medical documents for comprehensive analysis including diagnoses, medications, 
          symptoms, and clinical insights across all documents.
        </p>
      </div>

      {/* File Upload Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Upload Medical Documents</h3>
          <SampleDocumentsButton
            category="medical"
            onSamplesLoaded={handleSamplesLoaded}
            disabled={isAnalyzing}
            multiple={true}
          />
        </div>
        
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            isDragActive
              ? 'border-primary-400 bg-primary-50'
              : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <CloudArrowUpIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-2">
            {isDragActive ? 'Drop the files here...' : 'Drag & drop medical documents here'}
          </p>
          <p className="text-gray-500">
            or <span className="text-primary-600 font-medium">browse files</span>
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Supports: JPG, PNG, BMP, TIFF images
          </p>
        </div>
      </div>

      {/* Document List */}
      {documents.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Uploaded Documents ({documents.length})
            </h3>
            <button
              onClick={startAnalysis}
              disabled={isAnalyzing}
              className="inline-flex items-center px-4 py-2 rounded-lg font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <PlayIcon className="w-4 h-4 mr-2" />
              <span>{isAnalyzing ? 'Analyzing...' : 'Start Analysis'}</span>
            </button>
          </div>

          {/* Progress Bar */}
          {isAnalyzing && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Analysis Progress</span>
                <span className="text-sm text-gray-500">{Math.round(analysisProgress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <motion.div
                  className="bg-primary-600 h-2 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${analysisProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}

          {/* Document Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => {
              const StatusIcon = getStatusIcon(doc.status);
              return (
                <motion.div
                  key={doc.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <StatusIcon className={`w-5 h-5 ${getStatusColor(doc.status)}`} />
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {doc.name}
                      </span>
                    </div>
                    <button
                      onClick={() => removeDocument(doc.id)}
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                      disabled={isAnalyzing}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1 text-sm text-gray-500">
                    <p>Type: {doc.type.replace('_', ' ')}</p>
                    <p>Size: {(doc.size / 1024 / 1024).toFixed(2)} MB</p>
                    <p className={`capitalize ${getStatusColor(doc.status)}`}>
                      Status: {doc.status}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Comprehensive Medical Report */}
      {analysisResult && analysisResult.detailedAnalysis && analysisResult.detailedAnalysis.length > 0 && (
            <div className="mt-6">
              <div className="bg-gray-50 rounded-lg p-6">
                {/* Report Header */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
                  <div className="border-b-2 border-gray-800 pb-2 mb-4">
                    <h4 className="text-xl font-bold text-center text-gray-900 tracking-wide">
                      COMPREHENSIVE MEDICAL REPORT ANALYSIS
                    </h4>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">Report Generated:</span>
                      <span className="ml-2 text-gray-800">
                        {analysisResult.reportMetadata?.generationTimestamp ? 
                          new Date(analysisResult.reportMetadata.generationTimestamp).toLocaleString() : 
                          'Not available'
                        }
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Documents Analyzed:</span>
                      <span className="ml-2 text-gray-800">{analysisResult.reportMetadata?.totalDocumentsAnalyzed || 0}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Successful Analyses:</span>
                      <span className="ml-2 text-gray-800">{analysisResult.reportMetadata?.successfulAnalyses || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Executive Summary */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
                  <div className="flex items-center mb-4">
                    <div className="text-2xl mr-3">📋</div>
                    <h5 className="text-lg font-bold text-gray-900">EXECUTIVE SUMMARY</h5>
                  </div>
                  <div className="border-t border-gray-300 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="flex items-center">
                        <span className="text-blue-600 mr-2 font-bold">•</span>
                        <span className="text-sm">
                          <span className="font-medium">Unique Diagnoses Found:</span> {analysisResult.executiveSummary?.totalUniqueDiagnoses || 0}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-blue-600 mr-2 font-bold">•</span>
                        <span className="text-sm">
                          <span className="font-medium">Medications Identified:</span> {analysisResult.executiveSummary?.totalMedications || 0}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-blue-600 mr-2 font-bold">•</span>
                        <span className="text-sm">
                          <span className="font-medium">Symptoms Reported:</span> {analysisResult.executiveSummary?.totalSymptomsReported || 0}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-blue-600 mr-2 font-bold">•</span>
                        <span className="text-sm">
                          <span className="font-medium">Critical Alerts:</span> {analysisResult.executiveSummary?.criticalAlerts || 0}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-blue-600 mr-2 font-bold">•</span>
                        <span className="text-sm">
                          <span className="font-medium">Key Findings:</span> {analysisResult.executiveSummary?.totalFindings || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Clinical Overview */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
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
                      {analysisResult.clinicalOverview?.primaryDiagnoses && analysisResult.clinicalOverview.primaryDiagnoses.length > 0 ? (
                        <div className="ml-6 space-y-1">
                          {analysisResult.clinicalOverview.primaryDiagnoses.map((diagnosis, index) => (
                            <div key={index} className="text-sm text-gray-700">
                              <span className="font-medium">{index + 1}.</span> {diagnosis}
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
                      {analysisResult.clinicalOverview?.keySymptoms && analysisResult.clinicalOverview.keySymptoms.length > 0 ? (
                        <div className="ml-6 space-y-1">
                          {analysisResult.clinicalOverview.keySymptoms.map((symptom, index) => (
                            <div key={index} className="text-sm text-gray-700">
                              <span className="font-medium">{index + 1}.</span> {symptom}
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
                      {analysisResult.clinicalOverview?.currentMedications && analysisResult.clinicalOverview.currentMedications.length > 0 ? (
                        <div className="ml-6 space-y-2">
                          {analysisResult.clinicalOverview.currentMedications.map((med, index) => (
                            <div key={index} className="text-sm text-gray-700">
                              <div>
                                <span className="font-medium">{index + 1}.</span> 
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
                    {analysisResult.clinicalOverview?.criticalFindings && analysisResult.clinicalOverview.criticalFindings.length > 0 && (
                      <div>
                        <div className="flex items-center mb-3">
                          <div className="text-lg mr-2">🚨</div>
                          <h6 className="font-bold text-blue-800">CRITICAL FINDINGS & RED FLAGS:</h6>
                        </div>
                        <div className="border-t border-blue-300 pt-4">
                          <div className="ml-6 space-y-1">
                            {analysisResult.clinicalOverview.criticalFindings.map((finding, index) => (
                              <div key={index} className="text-sm text-blue-700 bg-blue-50 p-2 rounded">
                                <span className="font-medium">{index + 1}.</span> {finding}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Key Medical Findings */}
                    <div>
                      <div className="flex items-center mb-3">
                        <div className="text-lg mr-2">🔬</div>
                        <h6 className="font-bold text-gray-800">KEY MEDICAL FINDINGS:</h6>
                      </div>
                      <div className="border-t border-gray-300 pt-4">
                        {analysisResult.clinicalOverview?.keyMedicalFindings && analysisResult.clinicalOverview.keyMedicalFindings.length > 0 ? (
                          <div className="ml-6 space-y-1">
                            {analysisResult.clinicalOverview.keyMedicalFindings.map((finding, index) => (
                              <div key={index} className="text-sm text-gray-700">
                                <span className="font-medium">{index + 1}.</span> {finding}
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

                {/* Document-by-Document Summary */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
                  <div className="flex items-center mb-4">
                    <div className="text-2xl mr-3">📄</div>
                    <h5 className="text-lg font-bold text-gray-900">DOCUMENT-BY-DOCUMENT SUMMARY</h5>
                  </div>
                  <div className="space-y-4">
                    {analysisResult.documentSummaries?.map((doc, index) => {
                      const detailedDoc = analysisResult.detailedAnalysis?.[index];
                      return (
                        <div key={index} className="border-l-4 border-blue-500 pl-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <div className="text-base mr-2">📋</div>
                              <h6 className="font-bold text-gray-800">{doc.documentName || (doc as any).document}:</h6>
                            </div>
                            {detailedDoc && (
                              <button
                                onClick={() => viewDocument(
                                  doc.documentName || (doc as any).document,
                                  detailedDoc
                                )}
                                className="inline-flex items-center px-3 py-1 text-sm rounded-lg font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
                                title="View Document & Analysis"
                              >
                                <EyeIcon className="w-4 h-4 mr-1" />
                                View
                              </button>
                            )}
                          </div>
                          <div className="text-sm text-gray-700 leading-relaxed ml-6">
                            {doc.summary}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Report Footer */}
                <div className="mt-6 p-4 border-t-2 border-gray-800 text-center">
                  <div className="text-sm font-bold text-gray-900">END OF MEDICAL REPORT</div>
                </div>
              </div>
            </div>
          )}

      {/* Document Viewer Modal */}
      {showDocumentViewer && selectedDocumentForViewing && (
        <DocumentViewer
          documentUrl={selectedDocumentForViewing.url}
          documentName={selectedDocumentForViewing.name}
          analysisData={selectedDocumentForViewing.analysis}
          onClose={() => {
            setShowDocumentViewer(false);
            setSelectedDocumentForViewing(null);
          }}
        />
      )}
    </div>
  );
}