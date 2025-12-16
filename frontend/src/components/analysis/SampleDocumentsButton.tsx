'use client';

import React, { useState } from 'react';
import { DocumentTextIcon, XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface SampleDocument {
  id: string;
  name: string;
  size: number;
  blobPath: string;
  category: string;
}

interface SampleDocumentsButtonProps {
  category: string;
  onSamplesLoaded: (documentIds: string[], filenameMap: Record<string, string>) => void;
  disabled?: boolean;
  multiple?: boolean;
}

export default function SampleDocumentsButton({
  category,
  onSamplesLoaded,
  disabled = false,
  multiple = true
}: SampleDocumentsButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [samples, setSamples] = useState<SampleDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSamples, setSelectedSamples] = useState<Set<string>>(new Set());

  const fetchSamples = async () => {
    setLoading(true);
    try {
      const response = await api.getSampleDocuments(category);
      setSamples(response.samples || []);
      if (response.samples.length === 0) {
        toast.error(`No sample documents found for ${category}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch samples');
      console.error('Error fetching samples:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    setShowModal(true);
    setSelectedSamples(new Set());
    fetchSamples();
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSamples([]);
    setSelectedSamples(new Set());
  };

  const toggleSampleSelection = (blobPath: string) => {
    setSelectedSamples(prev => {
      const newSet = new Set(prev);
      if (newSet.has(blobPath)) {
        newSet.delete(blobPath);
      } else {
        if (!multiple) {
          newSet.clear();
        }
        newSet.add(blobPath);
      }
      return newSet;
    });
  };

  const handleLoadSamples = async () => {
    if (selectedSamples.size === 0) {
      toast.error('Please select at least one sample document');
      return;
    }

    setLoading(true);
    const loadedDocIds: string[] = [];
    const filenameMap: Record<string, string> = {};

    try {
      for (const blobPath of Array.from(selectedSamples)) {
        try {
          const response = await api.downloadSampleDocument(category, blobPath);
          loadedDocIds.push(response.documentId);
          // Store the mapping of documentId to actual filename
          filenameMap[response.documentId] = response.fileName;
        } catch (error) {
          console.error(`Error loading sample ${blobPath}:`, error);
          toast.error(`Failed to load ${blobPath.split('/').pop()}`);
        }
      }

      if (loadedDocIds.length > 0) {
        toast.success(`Loaded ${loadedDocIds.length} sample document(s)`);
        onSamplesLoaded(loadedDocIds, filenameMap);
        handleCloseModal();
      } else {
        toast.error('Failed to load any sample documents');
      }
    } catch (error) {
      toast.error('Failed to load sample documents');
      console.error('Error loading samples:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <>
      <button
        onClick={handleOpenModal}
        disabled={disabled}
        className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium hover:bg-blue-200 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <DocumentTextIcon className="h-5 w-5" />
        <span>Use Documents</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <DocumentTextIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Documents</h2>
                  <p className="text-sm text-gray-500">
                    Category: {category.charAt(0).toUpperCase() + category.slice(1)}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loading && samples.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : samples.length === 0 ? (
                <div className="text-center py-12">
                  <DocumentTextIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No documents available</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 mb-3">
                    {multiple 
                      ? 'Select one or more documents to load:'
                      : 'Select a document to load:'}
                  </p>
                  {samples.map((sample) => (
                    <div
                      key={sample.id}
                      onClick={() => toggleSampleSelection(sample.blobPath)}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedSamples.has(sample.blobPath)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{sample.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatFileSize(sample.size)}
                          </p>
                        </div>
                        <div className="ml-4">
                          {selectedSamples.has(sample.blobPath) ? (
                            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                              <svg
                                className="w-4 h-4 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </div>
                          ) : (
                            <div className="w-6 h-6 border-2 border-gray-300 rounded-full"></div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {selectedSamples.size} selected
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLoadSamples}
                  disabled={selectedSamples.size === 0 || loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                  <span>Load {selectedSamples.size > 0 ? selectedSamples.size : ''} Document{selectedSamples.size !== 1 ? 's' : ''}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
