'use client';

import React, { useState } from 'react';
import { ArrowUpTrayIcon, DocumentIcon, CheckCircleIcon, XCircleIcon, ChevronDownIcon, ChevronUpIcon, EyeIcon } from '@heroicons/react/24/outline';
import ReactMarkdown from 'react-markdown';
import DocumentViewer from './DocumentViewer';
import SampleDocumentsButton from './SampleDocumentsButton';
import { api } from '@/lib/api';
import { API_BASE_URL } from '@/config/api';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: 'pending' | 'uploaded' | 'error';
  file?: File;
}

interface DocumentResult {
  filename: string;
  analysis: string;
}

interface AnalysisResult {
  job_id: string;
  status: string;
  results?: DocumentResult[];
  combinedSummary?: string;
  error?: string;
}

interface GeneralAnalysisProps {
  documentType?: string;
  category?: string;
  description?: string;
}

export default function GeneralAnalysis({ 
  documentType = "Document", 
  category = "General",
  description = "Upload any type of document for AI-powered analysis. Extract key information, identify patterns, and get comprehensive insights."
}: GeneralAnalysisProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [selectedDocument, setSelectedDocument] = useState<{ file: File; name: string; analysis: any } | null>(null);
  const [documentPreviewUrls, setDocumentPreviewUrls] = useState<Record<string, string>>({});
  const [fileMap, setFileMap] = useState<Map<string, File>>(new Map());
  const [documentIdToFilename, setDocumentIdToFilename] = useState<Record<string, string>>({});

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const newFiles: UploadedFile[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        try {
          const response = await api.uploadDocument(formData);
          console.log('Upload response:', response);
          
          // Handle both documentId and document_id
          const docId = response.documentId || response.document_id;
          
          // Create preview URL and store it
          const previewUrl = URL.createObjectURL(file);
          setDocumentPreviewUrls(prev => ({ ...prev, [docId]: previewUrl }));
          
          newFiles.push({
            id: docId,
            name: file.name,
            size: file.size,
            status: 'uploaded',
            file: file
          });
          
          // Also store in fileMap by filename for easy lookup
          setFileMap(prev => new Map(prev).set(file.name, file));
        } catch (err) {
          console.error('Upload error for file:', file.name, err);
          newFiles.push({
            id: `error-${i}`,
            name: file.name,
            size: file.size,
            status: 'error',
            file: file
          });
        }
      }

      setUploadedFiles(prev => {
        const updated = [...prev, ...newFiles];
        console.log('=== Upload Complete ===');
        console.log('Updated uploadedFiles:', updated);
        console.log('Files with File objects:', updated.filter(f => f.file).length);
        console.log('File details:', updated.map(f => ({ 
          name: f.name, 
          hasFile: !!f.file,
          fileType: f.file?.type,
          fileSize: f.file?.size 
        })));
        return updated;
      });
    } catch (err) {
      console.error('Upload batch error:', err);
      setError('Failed to upload files. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyze = async () => {
    const uploadedDocIds = uploadedFiles
      .filter(f => f.status === 'uploaded')
      .map(f => f.id);

    if (uploadedDocIds.length === 0) {
      setError('Please upload at least one document before analyzing.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setProgress(0);

    try {
      const response = await api.startGeneralAnalysis(uploadedDocIds);
      console.log('Start analysis response:', response);
      
      // Handle both jobId and job_id
      const jobId = response.jobId || response.job_id;
      
      if (!jobId) {
        throw new Error('No job ID received from server');
      }

      const pollInterval = setInterval(async () => {
        try {
          const status = await api.getAnalysisStatus(jobId);
          console.log('Status check:', status);

          if (status.status === 'completed') {
            clearInterval(pollInterval);
            const result = await api.getAnalysisResult(jobId);
            console.log('Analysis result:', result);
            
            // Map backend response to frontend format
            const mappedResult = {
              job_id: result.jobId || result.job_id,
              status: result.status,
              results: result.result?.results?.map((r: any) => ({
                filename: r.documentName || r.filename,
                analysis: r.analysis || r.medicalAnalysis || 'No analysis available'
              })),
              combinedSummary: result.result?.combinedSummary
            };
            
            console.log('Mapped result with combined summary:', mappedResult);
            setAnalysisResult(mappedResult);
            setAnalyzing(false);
            setProgress(100);
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setError(status.error || 'Analysis failed. Please try again.');
            setAnalyzing(false);
          } else {
            setProgress(prev => Math.min(prev + 10, 90));
          }
        } catch (err) {
          console.error('Status check error:', err);
          clearInterval(pollInterval);
          setError('Failed to get analysis status. Please try again.');
          setAnalyzing(false);
        }
      }, 2000);
    } catch (err) {
      console.error('Analysis start error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start analysis. Please try again.');
      setAnalyzing(false);
    }
  };

  const toggleDocExpanded = (filename: string) => {
    setExpandedDocs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filename)) {
        newSet.delete(filename);
      } else {
        newSet.add(filename);
      }
      return newSet;
    });
  };

  const handleReset = () => {
    // Cleanup all preview URLs
    Object.values(documentPreviewUrls).forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    
    setUploadedFiles([]);
    setAnalysisResult(null);
    setError(null);
    setProgress(0);
    setExpandedDocs(new Set());
    setSelectedDocument(null);
    setDocumentPreviewUrls({});
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getCategoryFromDocumentType = (docType: string): string => {
    const lowerType = docType.toLowerCase();
    if (lowerType.includes('medical') || lowerType.includes('xray') || lowerType.includes('x-ray')) return 'medical';
    if (lowerType.includes('financial') || lowerType.includes('invoice') || lowerType.includes('receipt') || 
        lowerType.includes('bank') || lowerType.includes('statement') || lowerType.includes('tax')) return 'financial';
    if (lowerType.includes('legal') || lowerType.includes('contract') || lowerType.includes('property') || 
        lowerType.includes('affidavit') || lowerType.includes('compliance') || lowerType.includes('agreement') ||
        lowerType.includes('registration')) return 'legal';
    if (lowerType.includes('educational') || lowerType.includes('transcript') || lowerType.includes('certificate')) return 'educational';
    return 'general';
  };

  const handleSamplesLoaded = async (documentIds: string[], sampleFilenames: Record<string, string>) => {
    // Fetch file info for each loaded sample and add to uploadedFiles
    const newFiles: UploadedFile[] = [];
    const idToFilenameMap: Record<string, string> = {};
    
    for (const docId of documentIds) {
      try {
        // Get the actual filename from the mapping provided by SampleDocumentsButton
        const actualFilename = sampleFilenames[docId];
        
        if (!actualFilename) {
          console.error(`No filename found for document ID: ${docId}`);
          continue;
        }
        
        // Fetch the document blob
        const response = await fetch(`${API_BASE_URL}/documents/${docId}/view`);
        const blob = await response.blob();
        
        // Create file with the actual filename that will match analysis results
        // The server returns filenames with format: {uuid}_{originalname}
        const serverFilename = `${docId}_${actualFilename}`;
        const file = new File([blob], serverFilename, { type: blob.type });
        
        // Create preview URL and store it
        const previewUrl = URL.createObjectURL(blob);
        setDocumentPreviewUrls(prev => ({ ...prev, [docId]: previewUrl }));
        
        // Store the mapping
        idToFilenameMap[docId] = serverFilename;
        
        newFiles.push({
          id: docId,
          name: serverFilename,
          size: blob.size,
          status: 'uploaded',
          file: file
        });
        
        // Also store in fileMap
        setFileMap(prev => new Map(prev).set(serverFilename, file));
      } catch (error) {
        console.error(`Error loading sample ${docId}:`, error);
      }
    }
    
    setUploadedFiles(prev => [...prev, ...newFiles]);
    setDocumentIdToFilename(prev => ({ ...prev, ...idToFilenameMap }));
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center space-x-3 mb-2">
          <span className="px-3 py-1 text-xs font-semibold text-primary-700 bg-primary-100 rounded-full">
            {category}
          </span>
          <h1 className="text-2xl font-bold text-gray-900">{documentType} Analysis</h1>
        </div>
        <p className="text-gray-600">
          {description}
        </p>
      </div>

      {!analysisResult && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Upload Documents</h2>
            <SampleDocumentsButton
              category={getCategoryFromDocumentType(documentType)}
              onSamplesLoaded={handleSamplesLoaded}
              disabled={uploading || analyzing}
              multiple={true}
            />
          </div>
          
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-primary-500 transition-colors">
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.bmp"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              disabled={uploading || analyzing}
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <ArrowUpTrayIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-sm font-medium text-gray-900 mb-1">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-gray-500">
                PDF, JPG, PNG, TIFF, BMP (Multiple files supported)
              </p>
            </label>
          </div>

          {uploadedFiles.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Uploaded Files ({uploadedFiles.length})
              </h3>
              <div className="space-y-2">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={`${file.id}-${index}`}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <DocumentIcon className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    {file.status === 'uploaded' && (
                      <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    )}
                    {file.status === 'error' && (
                      <XCircleIcon className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <XCircleIcon className="h-5 w-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="ml-3 text-red-500 hover:text-red-700"
              >
                <XCircleIcon className="h-5 w-5" />
              </button>
            </div>
          )}

          <div className="mt-6">
            <button
              onClick={handleAnalyze}
              disabled={uploadedFiles.filter(f => f.status === 'uploaded').length === 0 || analyzing || uploading}
              className="w-full bg-primary-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {analyzing ? 'Analyzing...' : 'Analyze Documents'}
            </button>
          </div>

          {analyzing && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Analysis in progress...</span>
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
      )}

      {analysisResult && analysisResult.results && (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Analysis Results</h2>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              New Analysis
            </button>
          </div>

          {/* Combined Summary Section - only show if multiple documents */}
          {analysisResult.combinedSummary && analysisResult.results.length > 1 && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm border-2 border-blue-200 overflow-hidden mb-6">
              <div className="px-6 py-4 bg-blue-100 border-b border-blue-200">
                <h3 className="text-lg font-semibold text-blue-900 flex items-center">
                  <svg className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Combined Summary of All Documents
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  Synthesized analysis across {analysisResult.results.length} documents
                </p>
              </div>
              <div className="px-6 py-4">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      h1: ({ node, ...props }) => (
                        <h1 className="text-2xl font-bold text-gray-900 mb-4 mt-6" {...props} />
                      ),
                      h2: ({ node, ...props }) => (
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 mt-5" {...props} />
                      ),
                      h3: ({ node, ...props }) => (
                        <h3 className="text-lg font-semibold text-gray-900 mb-2 mt-4" {...props} />
                      ),
                      p: ({ node, ...props }) => (
                        <p className="text-gray-700 mb-3 leading-relaxed" {...props} />
                      ),
                      ul: ({ node, ...props }) => (
                        <ul className="list-disc list-inside space-y-1 mb-3" {...props} />
                      ),
                      li: ({ node, ...props }) => (
                        <li className="text-gray-700" {...props} />
                      ),
                    }}
                  >
                    {analysisResult.combinedSummary}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {/* Individual Document Analyses */}
          <h3 className="text-md font-semibold text-gray-700 mb-3">Individual Document Analyses</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analysisResult.results.map((docResult, index) => {
              // The backend adds UUID prefix to filename, so we need to match by the original filename
              // Backend format: "uuid_originalname.ext", we need to extract "originalname.ext"
              // Try multiple strategies to find the matching file:
              // 1. Exact match with full filename from analysis result
              // 2. Match by stripping UUID prefix (for uploaded files)
              // 3. Match by checking if uploaded filename ends with the result filename
              let uploadedFile = uploadedFiles.find(f => f.name === docResult.filename);
              
              if (!uploadedFile) {
                // Try matching with UUID stripped
                const filenameWithoutUuid = docResult.filename.includes('_') 
                  ? docResult.filename.substring(docResult.filename.indexOf('_') + 1)
                  : docResult.filename;
                uploadedFile = uploadedFiles.find(f => 
                  f.name === filenameWithoutUuid || 
                  f.name.endsWith(filenameWithoutUuid) ||
                  f.name.includes(filenameWithoutUuid)
                );
              }
              const hasFile = uploadedFile?.file instanceof File;
              
              console.log('=== Document Card Render ===');
              console.log('Analysis result filename:', docResult.filename);
              console.log('All uploadedFiles:', uploadedFiles.map(f => ({ name: f.name, hasFile: !!f.file })));
              console.log('Found uploaded file:', uploadedFile);
              console.log('Has File object:', hasFile);
              console.log('uploadedFile.file:', uploadedFile?.file);
              
              return (
                <div
                  key={`${docResult.filename}-${index}`}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center space-x-3 mb-3">
                    <DocumentIcon className="h-8 w-8 text-primary-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">{docResult.filename}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {hasFile ? 'Ready to view' : 'Preview not available'}
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      console.log('Button clicked for:', docResult.filename);
                      console.log('Has file:', hasFile);
                      
                      if (hasFile && uploadedFile?.file) {
                        console.log('Opening document viewer with file...');
                        const fileUrl = URL.createObjectURL(uploadedFile.file);
                        console.log('Created URL:', fileUrl);
                        setSelectedDocument({
                          file: uploadedFile.file,
                          name: docResult.filename,
                          analysis: { medical_analysis: docResult.analysis }
                        });
                      } else {
                        console.error('No file object found for:', docResult.filename);
                        alert('Document preview not available. Please try re-uploading.');
                      }
                    }}
                    disabled={!hasFile}
                    className="w-full mt-3 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <EyeIcon className="h-5 w-5" />
                    <span>View Document & Analysis</span>
                  </button>
                  
                  {/* Debug info */}
                  {!hasFile && (
                    <p className="text-xs text-red-500 mt-2 text-center">
                      Document preview not available
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {selectedDocument && selectedDocument.file && (
        <DocumentViewer
          documentUrl={URL.createObjectURL(selectedDocument.file)}
          documentName={selectedDocument.name}
          analysisData={selectedDocument.analysis}
          onClose={() => {
            // Don't revoke the URL here as it might still be needed
            setSelectedDocument(null);
          }}
        />
      )}
    </div>
  );
}
