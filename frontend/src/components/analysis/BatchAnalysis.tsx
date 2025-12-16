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
  DocumentArrowDownIcon,
  ClockIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { MedicalDocument } from '@/types/medical';
import { ApiService } from '@/lib/api';
import DocumentViewer from './DocumentViewer';
import SampleDocumentsButton from './SampleDocumentsButton';

interface BatchAnalysisResult {
  batchId: string;
  timestamp: string;
  totalDocuments: number;
  successfulAnalyses: number;
  failedAnalyses: number;
  results: Array<{
    documentId: string;
    documentName: string;
    analysisTimestamp: string;
    analysisSuccessful: boolean;
    medicalAnalysis: any;
  }>;
}

export default function BatchAnalysis() {
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<Record<string, string>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [batchResult, setBatchResult] = useState<BatchAnalysisResult | null>(null);
  const [documentPreviewUrls, setDocumentPreviewUrls] = useState<Record<string, string>>({});
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [selectedDocumentForViewing, setSelectedDocumentForViewing] = useState<{
    url: string;
    name: string;
    analysis: any;
    analysisSuccessful?: boolean;
  } | null>(null);

  const handleSamplesLoaded = async (documentIds: string[], _filenameMap?: Record<string, string>) => {
    if (documentIds.length === 0) return;
    
    try {
      const newDocuments: MedicalDocument[] = documentIds.map((docId, index) => ({
        id: `sample-${Date.now()}-${index}`,
        name: `Sample Medical Record ${index + 1}`,
        path: `sample-${index + 1}.pdf`,
        type: 'medical_record',
        uploadedAt: new Date().toISOString(),
        size: 0,
        status: 'completed'
      }));

      // Create placeholder preview URLs
      const newPreviewUrls: Record<string, string> = {};
      const newUploadedDocs: Record<string, string> = {};
      
      newDocuments.forEach((doc, index) => {
        const placeholderFile = new File([], doc.name, { type: 'application/pdf' });
        newPreviewUrls[doc.id] = URL.createObjectURL(placeholderFile);
        newUploadedDocs[doc.id] = documentIds[index];
      });

      setDocumentPreviewUrls(prev => ({ ...prev, ...newPreviewUrls }));
      setUploadedDocuments(prev => ({ ...prev, ...newUploadedDocs }));
      setDocuments(prev => [...prev, ...newDocuments]);
      
      toast.success(`${documentIds.length} sample document(s) loaded successfully`);
    } catch (error) {
      console.error('Error loading sample documents:', error);
      toast.error('Failed to load sample documents');
    }
  };

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
          // Store the mapping of temp ID to real document ID
          setUploadedDocuments(prev => ({
            ...prev,
            [tempDoc.id]: uploadResult.data!.documentId
          }));
          
          // Update document with real ID and mark as completed
          setDocuments(prev => prev.map(doc => 
            doc.id === tempDoc.id ? { 
              ...doc, 
              id: uploadResult.data!.documentId,
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
    setUploadedDocuments(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
    toast.success('Document removed');
  };

  const viewDocument = (result: any, index: number) => {
    // Find the corresponding document to get the preview URL
    const doc = documents.find(d => d.name === result.documentName);
    if (!doc) {
      toast.error('Document preview not available');
      return;
    }

    const previewUrl = documentPreviewUrls[doc.id];
    if (!previewUrl) {
      toast.error('Document preview not available');
      return;
    }

    setSelectedDocumentForViewing({
      url: previewUrl,
      name: result.documentName,
      analysis: result.medicalAnalysis || result.analysis,
      analysisSuccessful: result.analysisSuccessful !== undefined ? result.analysisSuccessful : true
    });
    setShowDocumentViewer(true);
  };

  const startBatchAnalysis = async () => {
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
      
      // Start batch analysis via API
      const analysisResponse = await ApiService.startBatchAnalysis(documentIds);

      if (!analysisResponse.success || !analysisResponse.data) {
        throw new Error(analysisResponse.error || 'Failed to start batch analysis');
      }

      const { jobId } = analysisResponse.data;
      
      // Update document statuses
      setDocuments(prev => prev.map(doc => 
        doc.status === 'completed' ? { ...doc, status: 'processing' as const } : doc
      ));

      // Poll for results
      await pollForResults(jobId);
      
    } catch (error) {
      console.error('Batch analysis error:', error);
      toast.error('Batch analysis failed. Please try again.');
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
          
          setBatchResult(resultResponse.data.result);
          setDocuments(prev => prev.map(doc => 
            doc.status === 'processing' ? { ...doc, status: 'completed' as const } : doc
          ));
          toast.success('Batch analysis completed successfully!');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-success-600';
      case 'processing': return 'text-primary-600';
      case 'failed': return 'text-danger-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return CheckCircleIcon;
      case 'processing': return ClockIcon;
      case 'failed': return ExclamationCircleIcon;
      default: return DocumentTextIcon;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Batch Document Analysis</h2>
        <p className="text-gray-600">
          Process multiple medical documents in batch for efficient analysis and report generation.
        </p>
      </div>

      {/* File Upload Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Documents for Batch Processing</h3>
        
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

        <div className="mt-4">
          <SampleDocumentsButton
            category="medical"
            onSamplesLoaded={handleSamplesLoaded}
            disabled={isAnalyzing}
            multiple={true}
          />
        </div>
      </div>

      {/* Document List */}
      {documents.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Batch Queue ({documents.length} documents)
            </h3>
            <button
              onClick={startBatchAnalysis}
              disabled={isAnalyzing || documents.filter(d => d.status === 'completed').length === 0}
              className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlayIcon className="w-4 h-4" />
              <span>{isAnalyzing ? 'Processing Batch...' : 'Start Batch Analysis'}</span>
            </button>
          </div>

          {/* Progress Bar */}
          {isAnalyzing && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Batch Processing Progress</span>
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
                      className="text-gray-400 hover:text-danger-600 transition-colors"
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

      {/* Batch Results */}
      {batchResult && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Batch Analysis Results</h3>
            <button className="btn-secondary flex items-center space-x-2">
              <DocumentArrowDownIcon className="w-4 h-4" />
              <span>Download Report</span>
            </button>
          </div>
          
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-primary-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary-600">
                {batchResult.totalDocuments}
              </div>
              <div className="text-sm text-gray-600">Total Documents</div>
            </div>
            <div className="bg-success-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-success-600">
                {batchResult.successfulAnalyses}
              </div>
              <div className="text-sm text-gray-600">Successful</div>
            </div>
            <div className="bg-danger-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-danger-600">
                {batchResult.failedAnalyses}
              </div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
          </div>

          {/* Individual Results */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">Individual Analysis Results</h4>
            <div className="grid gap-4">
              {batchResult.results.map((result, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-medium text-gray-900">{result.documentName}</h5>
                    <div className="flex items-center space-x-2">
                      <span className={`status-badge ${
                        result.analysisSuccessful 
                          ? 'bg-success-100 text-success-800' 
                          : 'bg-danger-100 text-danger-800'
                      }`}>
                        {result.analysisSuccessful ? 'Success' : 'Failed'}
                      </span>
                      {result.analysisSuccessful && (
                        <button
                          onClick={() => viewDocument(result, index)}
                          className="inline-flex items-center px-3 py-1 text-sm rounded-lg font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
                          title="View Document & Analysis"
                        >
                          <EyeIcon className="w-4 h-4 mr-1" />
                          View
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    Processed: {new Date(result.analysisTimestamp).toLocaleString()}
                  </p>
                  {result.analysisSuccessful && (
                    <div className="text-sm text-gray-700 bg-gray-50 rounded p-3">
                      <strong>Analysis Summary:</strong>
                      <p className="mt-1 line-clamp-3">
                        {typeof result.medicalAnalysis === 'string' 
                          ? result.medicalAnalysis.substring(0, 200) + '...'
                          : JSON.stringify(result.medicalAnalysis).substring(0, 200) + '...'
                        }
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {showDocumentViewer && selectedDocumentForViewing && (
        <DocumentViewer
          documentUrl={selectedDocumentForViewing.url}
          documentName={selectedDocumentForViewing.name}
          analysisData={{
            medicalAnalysis: selectedDocumentForViewing.analysis,
            analysisTimestamp: new Date().toISOString(),
            analysisSuccessful: selectedDocumentForViewing.analysisSuccessful !== undefined 
              ? selectedDocumentForViewing.analysisSuccessful 
              : true
          }}
          onClose={() => {
            setShowDocumentViewer(false);
            setSelectedDocumentForViewing(null);
          }}
        />
      )}
    </div>
  );
}
