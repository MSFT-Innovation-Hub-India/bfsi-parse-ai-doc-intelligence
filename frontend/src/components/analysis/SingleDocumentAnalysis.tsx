'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  CloudArrowUpIcon,
  PlayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import DocumentViewer from './DocumentViewer';
import SampleDocumentsButton from './SampleDocumentsButton';
import { API_BASE_URL } from '@/config/api';

interface SingleDocumentAnalysisProps {
  onAnalysisComplete?: (result: any) => void;
}

export default function SingleDocumentAnalysis({ onAnalysisComplete }: SingleDocumentAnalysisProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      setAnalysisResult(null);
      
      // Create preview URL for the document
      const previewUrl = URL.createObjectURL(file);
      setDocumentPreviewUrl(previewUrl);
      
      toast.success('Document selected for analysis');
    }
  }, []);

  const handleSamplesLoaded = async (documentIds: string[], _filenameMap?: Record<string, string>) => {
    if (documentIds.length === 0) return;
    
    const docId = documentIds[0];
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${docId}/view`);
      const blob = await response.blob();
      const fileName = `medical_${Date.now()}.pdf`;
      const file = new File([blob], fileName, { type: blob.type });
      
      setSelectedFile(file);
      setAnalysisResult(null);
      
      const previewUrl = URL.createObjectURL(blob);
      setDocumentPreviewUrl(previewUrl);
      
      toast.success('Sample document loaded');
    } catch (error) {
      console.error('Error loading sample:', error);
      toast.error('Failed to load sample document');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'],
      'application/pdf': ['.pdf']
    },
    multiple: false,
    maxFiles: 1
  });

  const startAnalysis = async () => {
    if (!selectedFile) {
      toast.error('Please select a document first');
      return;
    }

    setIsAnalyzing(true);

    try {
      // Upload file to API
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      toast.success('Uploading document...');
      const uploadResponse = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const uploadResult = await uploadResponse.json();
      const documentId = uploadResult.documentId;
      
      toast.success('Starting analysis...');
      
      // Start analysis
      const analysisResponse = await fetch(`${API_BASE_URL}/analyze/single`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          document_id: documentId
        })
      });

      if (!analysisResponse.ok) {
        throw new Error('Failed to start analysis');
      }

      const analysisResult = await analysisResponse.json();
      const jobId = analysisResult.jobId;
      
      // Poll for results
      await pollForResults(jobId);
      
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const pollForResults = async (jobId: string) => {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;
    
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/analysis/${jobId}/status`);
        const status = await response.json();
        
        console.log('Analysis status:', status);
        
        if (status.status === 'completed') {
          // Get the result
          const resultResponse = await fetch(`${API_BASE_URL}/analysis/${jobId}/result`);
          const result = await resultResponse.json();
          
          setAnalysisResult(result.result);
          onAnalysisComplete?.(result.result);
          toast.success('Analysis completed successfully!');
          return;
        }
        
        if (status.status === 'failed') {
          throw new Error(status.error || 'Analysis failed');
        }
        
        // Continue polling if still processing
        if (attempts < maxAttempts && (status.status === 'processing' || status.status === 'pending')) {
          attempts++;
          setTimeout(poll, 3000); // Poll every 3 seconds
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

  const removeFile = () => {
    setSelectedFile(null);
    setAnalysisResult(null);
    setShowDocumentViewer(false);
    
    // Clean up preview URL
    if (documentPreviewUrl) {
      URL.revokeObjectURL(documentPreviewUrl);
      setDocumentPreviewUrl(null);
    }
    
    toast.success('File removed');
  };

  const openDocumentViewer = () => {
    if (documentPreviewUrl && analysisResult) {
      setShowDocumentViewer(true);
    } else if (!analysisResult) {
      toast.error('Please complete the analysis first');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Handwritten Document Analysis</h2>
        <p className="text-gray-600">
          Upload a single document for comprehensive analysis including diagnoses, medications, 
          vital signs, and clinical insights.
        </p>
      </div>

      {/* File Upload Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Upload Medical Document</h3>
          <SampleDocumentsButton
            category="medical"
            onSamplesLoaded={handleSamplesLoaded}
            disabled={isAnalyzing}
            multiple={false}
          />
        </div>
        
        {!selectedFile ? (
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
              {isDragActive ? 'Drop the file here...' : 'Drag & drop a medical document here'}
            </p>
            <p className="text-gray-500">
              or <span className="text-primary-600 font-medium">browse files</span>
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Supports: JPG, PNG, BMP, TIFF images
            </p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <CheckCircleIcon className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="font-medium text-gray-900">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={startAnalysis}
                  disabled={isAnalyzing}
                  className="inline-flex items-center px-4 py-2 rounded-lg font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <PlayIcon className="w-4 h-4 mr-2" />
                  <span>{isAnalyzing ? 'Analyzing...' : 'Start Analysis'}</span>
                </button>
                <button
                  onClick={removeFile}
                  disabled={isAnalyzing}
                  className="inline-flex items-center px-4 py-2 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Analysis Results */}
      {analysisResult && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Analysis Results</h3>
          
          <div className="space-y-4">
            {/* Basic Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Document Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">File Name:</span>
                  <p className="font-medium">{analysisResult.image_name || analysisResult.imageName || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-600">Analysis Time:</span>
                  <p className="font-medium">
                    {(analysisResult.analysis_timestamp || analysisResult.analysisTimestamp) ? 
                      new Date(analysisResult.analysis_timestamp || analysisResult.analysisTimestamp).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Medical Analysis */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h4 className="font-medium text-gray-900 mb-3">Medical Analysis</h4>
              
              <div className="text-gray-700 leading-relaxed">
                {/* Try to get the medical analysis content */}
                {(() => {
                  // Handle both old structure (object) and new structure (string)
                  let medicalAnalysis = analysisResult.medical_analysis || analysisResult.medicalAnalysis;
                  
                  // If it's an object, try to extract the medical_analysis field
                  if (typeof medicalAnalysis === 'object' && medicalAnalysis !== null) {
                    medicalAnalysis = medicalAnalysis.medical_analysis || medicalAnalysis.medicalAnalysis || JSON.stringify(medicalAnalysis, null, 2);
                  }
                  
                  if (typeof medicalAnalysis === 'string' && medicalAnalysis.trim()) {
                    return (
                      <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h4:text-sm prose-p:text-gray-700 prose-strong:text-gray-900 prose-ul:list-disc prose-ol:list-decimal prose-li:ml-4">
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
                    );
                  } else {
                    return (
                      <div className="bg-blue-100 p-4 rounded border">
                        <p className="font-semibold text-blue-800 mb-2">Medical analysis data format issue:</p>
                        <pre className="whitespace-pre-wrap text-sm bg-gray-100 p-3 rounded overflow-auto max-h-64">
                          {JSON.stringify(medicalAnalysis, null, 2)}
                        </pre>
                      </div>
                    );
                  }
                })()}
              </div>
            </div>

            {/* Status & Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircleIcon className="w-5 h-5 text-blue-600" />
                <span className="text-blue-600 font-medium">
                  Analysis completed successfully
                </span>
              </div>
              
              {/* View Document Button */}
              <button
                onClick={openDocumentViewer}
                className="inline-flex items-center px-4 py-2 rounded-lg font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
              >
                <EyeIcon className="w-5 h-5 mr-2" />
                View Document & Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {showDocumentViewer && documentPreviewUrl && analysisResult && (
        <DocumentViewer
          documentUrl={documentPreviewUrl}
          documentName={selectedFile?.name || 'Document'}
          analysisData={analysisResult}
          onClose={() => setShowDocumentViewer(false)}
        />
      )}

      {/* Loading State */}
      {isAnalyzing && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            <span className="text-gray-700">Analyzing document... This may take a few minutes.</span>
          </div>
        </div>
      )}
    </div>
  );
}
