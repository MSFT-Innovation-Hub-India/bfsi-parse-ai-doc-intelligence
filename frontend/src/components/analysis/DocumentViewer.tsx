'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  DocumentTextIcon,
  XMarkIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

interface DocumentViewerProps {
  documentUrl: string;
  documentName: string;
  analysisData: any;
  onClose?: () => void;
}

export default function DocumentViewer({
  documentUrl,
  documentName,
  analysisData,
  onClose
}: DocumentViewerProps) {
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [rotation, setRotation] = useState(0);

  // Check if document is PDF
  const isPDF = documentName.toLowerCase().endsWith('.pdf') || documentUrl.includes('application/pdf');

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 50));
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const toggleAnalysis = () => {
    setShowAnalysis(!showAnalysis);
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  // Extract medical analysis from the analysis data
  const getMedicalAnalysis = () => {
    if (!analysisData) return null;

    // Handle different data structures
    let medicalAnalysis = 
      analysisData.medical_analysis || 
      analysisData.medicalAnalysis ||
      analysisData.analysis?.medical_analysis ||
      analysisData.analysis?.medicalAnalysis;

    // If it's an object, try to extract the medical_analysis field
    if (typeof medicalAnalysis === 'object' && medicalAnalysis !== null) {
      medicalAnalysis = medicalAnalysis.medical_analysis || medicalAnalysis.medicalAnalysis;
    }

    return medicalAnalysis;
  };

  const medicalAnalysis = getMedicalAnalysis();

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 ${isFullscreen ? 'p-0' : ''}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full h-[90vh] max-w-7xl'
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <DocumentTextIcon className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">{documentName}</h2>
              <p className="text-sm text-primary-100">Document Analysis View</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleAnalysis}
              className="p-2 hover:bg-primary-500 rounded-lg transition-colors"
              title={showAnalysis ? 'Hide Analysis' : 'Show Analysis'}
            >
              {showAnalysis ? 'Hide Analysis' : 'Show Analysis'}
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-primary-500 rounded-lg transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? (
                <ArrowsPointingInIcon className="w-5 h-5" />
              ) : (
                <ArrowsPointingOutIcon className="w-5 h-5" />
              )}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-primary-500 rounded-lg transition-colors"
                title="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Document Display */}
          <div className={`flex flex-col ${showAnalysis ? 'w-1/2' : 'w-full'} border-r border-gray-200`}>
            {/* Document Controls */}
            <div className="bg-gray-100 px-4 py-3 flex items-center justify-between border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleZoomOut}
                  disabled={zoom <= 50}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Zoom Out"
                >
                  <MagnifyingGlassMinusIcon className="w-5 h-5 text-gray-700" />
                </button>
                <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">
                  {zoom}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoom >= 200}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Zoom In"
                >
                  <MagnifyingGlassPlusIcon className="w-5 h-5 text-gray-700" />
                </button>
                <div className="w-px h-6 bg-gray-300 mx-1"></div>
                <button
                  onClick={handleRotate}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                  title="Rotate 90°"
                >
                  <ArrowPathIcon className="w-5 h-5 text-gray-700" />
                </button>
              </div>
              <span className="text-sm text-gray-600">Original Document</span>
            </div>

            {/* Document Display */}
            <div className="flex-1 overflow-auto bg-gray-50 p-4">
              <div className="flex justify-center w-full">
                {documentUrl ? (
                  isPDF ? (
                    <iframe
                      src={documentUrl}
                      className="w-full h-full min-h-[600px] shadow-lg rounded-lg border-0"
                      title={documentName}
                      style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
                    />
                  ) : (
                    <img
                      src={documentUrl}
                      alt={documentName}
                      style={{ 
                        width: `${zoom}%`,
                        transform: `rotate(${rotation}deg)`,
                        transition: 'transform 0.3s ease',
                        maxWidth: 'none',
                        height: 'auto'
                      }}
                      className="shadow-lg rounded-lg"
                      onError={(e) => {
                        console.error('Failed to load image:', documentUrl);
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )
                ) : (
                  <div className="text-center text-gray-500">
                    <DocumentTextIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-medium">Document preview not available</p>
                    <p className="text-sm mt-2">Unable to load document preview</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Analysis Panel */}
          {showAnalysis && (
            <div className="w-1/2 flex flex-col overflow-hidden">
              {/* Analysis Header */}
              <div className="bg-blue-50 px-6 py-4 border-b border-blue-200">
                <h3 className="text-lg font-semibold text-gray-900">Medical Analysis Results</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {analysisData?.analysisTimestamp || analysisData?.analysis_timestamp
                    ? `Analyzed on ${new Date(
                        analysisData.analysisTimestamp || analysisData.analysis_timestamp
                      ).toLocaleString()}`
                    : 'Analysis completed'}
                </p>
              </div>

              {/* Analysis Content */}
              <div className="flex-1 overflow-auto p-6">
                {medicalAnalysis ? (
                  <div className="space-y-4">
                    {/* Document Metadata */}
                    {(analysisData?.documentMetadata || analysisData?.document_metadata) && (
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <h4 className="font-semibold text-gray-900 mb-3">Document Information</h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {Object.entries(analysisData.documentMetadata || analysisData.document_metadata).map(([key, value]) => (
                            <div key={key}>
                              <span className="text-gray-600 capitalize">
                                {key.replace(/([A-Z])/g, ' $1').trim()}:
                              </span>
                              <p className="font-medium text-gray-900">{String(value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Medical Analysis */}
                    <div className="bg-white rounded-lg border border-gray-200">
                      <div className="bg-blue-100 px-4 py-3 border-b border-blue-200">
                        <h4 className="font-semibold text-gray-900">Detailed Medical Analysis</h4>
                      </div>
                      <div className="p-4">
                        {typeof medicalAnalysis === 'string' ? (
                          <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:text-gray-700 prose-strong:text-gray-900 prose-ul:list-disc prose-ol:list-decimal">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                h1: ({ node, ...props }) => (
                                  <h1 className="text-xl font-bold text-gray-900 mb-4 mt-6" {...props} />
                                ),
                                h2: ({ node, ...props }) => (
                                  <h2 className="text-lg font-bold text-gray-900 mb-3 mt-5" {...props} />
                                ),
                                h3: ({ node, ...props }) => (
                                  <h3 className="text-base font-semibold text-gray-900 mb-2 mt-4" {...props} />
                                ),
                                h4: ({ node, ...props }) => (
                                  <h4 className="text-sm font-semibold text-gray-900 mb-2 mt-3" {...props} />
                                ),
                                p: ({ node, ...props }) => (
                                  <p className="mb-3 text-gray-700 leading-relaxed" {...props} />
                                ),
                                ul: ({ node, ...props }) => (
                                  <ul className="list-disc ml-6 mb-3 space-y-1" {...props} />
                                ),
                                ol: ({ node, ...props }) => (
                                  <ol className="list-decimal ml-6 mb-3 space-y-1" {...props} />
                                ),
                                li: ({ node, ...props }) => <li className="text-gray-700" {...props} />,
                                strong: ({ node, ...props }) => (
                                  <strong className="font-semibold text-gray-900" {...props} />
                                ),
                                em: ({ node, ...props }) => <em className="italic text-gray-700" {...props} />,
                                hr: ({ node, ...props }) => <hr className="my-6 border-gray-300" {...props} />,
                                blockquote: ({ node, ...props }) => (
                                  <blockquote
                                    className="border-l-4 border-blue-400 pl-4 italic text-gray-700 my-4"
                                    {...props}
                                  />
                                ),
                                code: ({ node, ...props }: any) => {
                                  const isInline = !props.className?.includes('language-');
                                  return isInline ? (
                                    <code
                                      className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono text-gray-800"
                                      {...props}
                                    />
                                  ) : (
                                    <code
                                      className="block bg-gray-100 p-3 rounded text-sm font-mono text-gray-800 overflow-x-auto"
                                      {...props}
                                    />
                                  );
                                }
                              }}
                            >
                              {medicalAnalysis}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <p className="text-yellow-800 font-medium mb-2">
                              Analysis data format issue
                            </p>
                            <pre className="whitespace-pre-wrap text-sm bg-white p-3 rounded overflow-auto max-h-96">
                              {JSON.stringify(medicalAnalysis, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Key Findings */}
                    {(analysisData?.keyFindings || analysisData?.key_findings) && (
                      <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                        <h4 className="font-semibold text-gray-900 mb-3">Key Findings</h4>
                        <div className="space-y-3">
                          {Object.entries(analysisData.keyFindings || analysisData.key_findings).map(
                            ([key, value]) => (
                              <div key={key}>
                                <h5 className="text-sm font-medium text-gray-700 capitalize mb-1">
                                  {key.replace(/([A-Z])/g, ' $1').trim()}:
                                </h5>
                                {Array.isArray(value) ? (
                                  <ul className="list-disc ml-5 space-y-1">
                                    {value.map((item, idx) => (
                                      <li key={idx} className="text-sm text-gray-600">
                                        {item}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-gray-600">{String(value)}</p>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {/* Red Flags */}
                    {(analysisData?.redFlags || analysisData?.red_flags) &&
                      (analysisData.redFlags || analysisData.red_flags).length > 0 && (
                        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                          <h4 className="font-semibold text-red-900 mb-3">⚠️ Red Flags</h4>
                          <ul className="list-disc ml-5 space-y-1">
                            {(analysisData.redFlags || analysisData.red_flags).map((flag: string, idx: number) => (
                              <li key={idx} className="text-sm text-red-700">
                                {flag}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500">
                      <DocumentTextIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                      <p className="text-lg font-medium">No analysis data available</p>
                      <p className="text-sm mt-2">Analysis may still be processing or failed to complete</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-medium">Status:</span>{' '}
            {/* Check multiple possible locations for analysis success flag */}
            {analysisData?.analysisSuccessful || 
             analysisData?.analysis_successful || 
             analysisData?.analysis?.analysis_successful ||
             (medicalAnalysis && medicalAnalysis !== 'No analysis available') ? (
              <span className="text-green-600 font-medium">✓ Analysis Complete</span>
            ) : (
              <span className="text-yellow-600 font-medium">⚠ Analysis Incomplete</span>
            )}
          </div>
          <div className="text-sm text-gray-500">
            {documentName} • {analysisData ? 'Analysis Available' : 'No Analysis'}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
