'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import DocumentViewer from './DocumentViewer';
import SampleDocumentsButton from './SampleDocumentsButton';
import { api } from '@/lib/api';
import { API_BASE_URL } from '@/config/api';
import {
  CloudArrowUpIcon,
  DocumentTextIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  DocumentMagnifyingGlassIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

interface XrayDocument {
  id: string;
  name: string;
  file: File;
  preview: string;
  status: 'pending' | 'uploading' | 'analyzing' | 'completed' | 'failed';
  uploadProgress: number;
  result?: string;
}

export default function XrayAnalysis() {
  const [documents, setDocuments] = useState<XrayDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<XrayDocument | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newDocuments: XrayDocument[] = acceptedFiles.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
      uploadProgress: 0,
    }));

    setDocuments((prev) => [...prev, ...newDocuments]);
    toast.success(`Added ${acceptedFiles.length} X-ray image(s)`);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'],
    },
    multiple: true,
  });

  const removeDocument = (id: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    if (selectedDocument?.id === id) {
      setSelectedDocument(null);
    }
  };

  const analyzeXray = async (doc: XrayDocument) => {
    setIsAnalyzing(true);
    setDocuments((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, status: 'uploading' as const } : d))
    );

    try {
      // Upload the file
      const formData = new FormData();
      formData.append('file', doc.file);

      const uploadResponse = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      const uploadData = await uploadResponse.json();
      const documentId = uploadData.documentId;

      // Start X-ray analysis
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, status: 'analyzing' as const } : d))
      );

      const analysisResponse = await fetch(`${API_BASE_URL}/analyze/xray`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ document_id: documentId }),
      });

      if (!analysisResponse.ok) {
        throw new Error('Analysis failed');
      }

      const analysisData = await analysisResponse.json();
      const jobId = analysisData.jobId;

      // Poll for results
      let attempts = 0;
      const maxAttempts = 60;
      const pollInterval = setInterval(async () => {
        attempts++;

        try {
          const statusResponse = await fetch(
            `${API_BASE_URL}/analysis/${jobId}/status`
          );
          const statusData = await statusResponse.json();

          if (statusData.status === 'completed') {
            clearInterval(pollInterval);

            const resultResponse = await fetch(
              `${API_BASE_URL}/analysis/${jobId}/result`
            );
            const resultData = await resultResponse.json();

            setDocuments((prev) =>
              prev.map((d) =>
                d.id === doc.id
                  ? {
                      ...d,
                      status: 'completed' as const,
                      result: resultData.result?.radiologyReport || 'Analysis completed',
                    }
                  : d
              )
            );

            toast.success('X-ray analysis completed!');
            setIsAnalyzing(false);
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            throw new Error(statusData.error || 'Analysis failed');
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            throw new Error('Analysis timeout');
          }
        } catch (err) {
          clearInterval(pollInterval);
          throw err;
        }
      }, 2000);
    } catch (error) {
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, status: 'failed' as const } : d))
      );
      toast.error(error instanceof Error ? error.message : 'Analysis failed');
      setIsAnalyzing(false);
    }
  };

  const downloadReport = (doc: XrayDocument) => {
    if (!doc.result) return;

    const blob = new Blob([doc.result], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.name}_radiology_report.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  const handleSamplesLoaded = async (documentIds: string[], _filenameMap?: Record<string, string>) => {
    // Fetch file info for each loaded sample
    const newDocs: XrayDocument[] = [];
    
    for (const docId of documentIds) {
      try {
        // Fetch the document to get file info
        const response = await fetch(`${API_BASE_URL}/documents/${docId}/view`);
        const blob = await response.blob();
        const fileName = `xray_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: blob.type });
        
        newDocs.push({
          id: docId,
          name: fileName,
          file: file,
          preview: URL.createObjectURL(blob),
          status: 'pending',
          uploadProgress: 0,
        });
      } catch (error) {
        console.error(`Error loading sample ${docId}:`, error);
      }
    }
    
    setDocuments(prev => [...prev, ...newDocs]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
            <DocumentMagnifyingGlassIcon className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">X-ray Analysis</h1>
            <p className="text-blue-100 text-sm mt-1">
              AI-powered radiology report generation
            </p>
          </div>
        </div>
      </div>

      {/* Upload Section */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Upload X-ray Images</h2>
          <SampleDocumentsButton
            category="xray"
            onSamplesLoaded={handleSamplesLoaded}
            disabled={isAnalyzing}
            multiple={true}
          />
        </div>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
            isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <CloudArrowUpIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            {isDragActive ? 'Drop X-ray images here' : 'Drag & drop X-ray images'}
          </p>
          <p className="text-sm text-gray-500">
            or click to select files (PNG, JPG, JPEG, TIFF)
          </p>
        </div>

        {/* Documents List */}
        {documents.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Uploaded Images ({documents.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-all"
                >
                  {/* Image Preview */}
                  <div
                    className="w-full h-40 bg-gray-100 rounded-lg mb-3 overflow-hidden cursor-pointer"
                    onClick={() => setSelectedDocument(doc)}
                  >
                    <img
                      src={doc.preview}
                      alt={doc.name}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Document Info */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.name}
                    </p>

                    {/* Status */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          doc.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : doc.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : doc.status === 'analyzing'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {doc.status === 'completed'
                          ? '✓ Complete'
                          : doc.status === 'failed'
                          ? '✗ Failed'
                          : doc.status === 'analyzing'
                          ? 'Analyzing...'
                          : 'Pending'}
                      </span>

                      <button
                        onClick={() => removeDocument(doc.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {doc.status === 'pending' && (
                        <button
                          onClick={() => analyzeXray(doc)}
                          disabled={isAnalyzing}
                          className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                          Analyze
                        </button>
                      )}

                      {doc.status === 'completed' && (
                        <>
                          <button
                            onClick={() => setSelectedDocument(doc)}
                            className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                          >
                            View Report
                          </button>
                          <button
                            onClick={() => downloadReport(doc)}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                          >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {doc.status === 'failed' && (
                        <button
                          onClick={() => analyzeXray(doc)}
                          disabled={isAnalyzing}
                          className="flex-1 px-3 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 disabled:bg-gray-300 transition-colors"
                        >
                          <ArrowPathIcon className="w-4 h-4 inline mr-1" />
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Document Viewer Modal */}
      {selectedDocument && selectedDocument.result && (
        <DocumentViewer
          documentUrl={selectedDocument.preview}
          documentName={selectedDocument.name}
          analysisData={{
            medicalAnalysis: selectedDocument.result,
            analysisTimestamp: new Date().toISOString(),
            analysisSuccessful: true,
            documentMetadata: {
              type: 'X-ray Image',
              analysisType: 'Radiology Report'
            }
          }}
          onClose={() => setSelectedDocument(null)}
        />
      )}
    </div>
  );
}
