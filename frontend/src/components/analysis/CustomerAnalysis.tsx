'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserCircleIcon,
  DocumentTextIcon,
  ShieldExclamationIcon,
  CurrencyDollarIcon,
  ArrowLeftIcon,
  DocumentMagnifyingGlassIcon,
  PlayIcon,
  CheckCircleIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { ApiService } from '@/lib/api';
import { API_BASE_URL } from '@/config/api';
import { toast } from 'react-hot-toast';
import AnalysisResultViewer from './AnalysisResultViewer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CustomerInfo {
  id: string;
  name: string;
  age: number;
  gender: string;
  email: string;
  phone: string;
  address: string;
  insurance: string;
  policyNumber: string;
  registrationDate: string;
  lastVisit: string;
}

interface CustomerDocument {
  id: string;
  name: string;
  size: number;
  lastModified: string | null;
  blobPath: string;
  documentId?: string | null;
  selected?: boolean;
  isDownloaded?: boolean;
}

interface AnalysisModule {
  id: string;
  name: string;
  description: string;
  icon: any;
  type: 'fraud-detection' | 'revenue-leakage' | 'comprehensive' | 'single';
}

const analysisModules: AnalysisModule[] = [
  {
    id: 'clinical',
    name: 'Handwritten Document Analysis',
    description: 'Analyze individual documents for detailed insights',
    icon: DocumentMagnifyingGlassIcon,
    type: 'single'
  },
  {
    id: 'comprehensive',
    name: 'Comprehensive Analysis',
    description: 'Complete analysis of all documents together',
    icon: DocumentTextIcon,
    type: 'comprehensive'
  },
  {
    id: 'fraud-detection',
    name: 'Fraud Detection',
    description: 'Identify medications billed but not in medical records',
    icon: ShieldExclamationIcon,
    type: 'fraud-detection'
  },
  {
    id: 'revenue-leakage',
    name: 'Revenue Leakage',
    description: 'Find unbilled medications and services',
    icon: CurrencyDollarIcon,
    type: 'revenue-leakage'
  }
];

const CustomerAnalysis = () => {
  const [customers, setCustomers] = useState<CustomerInfo[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerInfo | null>(null);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [documentsReady, setDocumentsReady] = useState(false);
  const [selectedModuleForSelection, setSelectedModuleForSelection] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // Dropdown-based selection states
  const [selectedAnalysisType, setSelectedAnalysisType] = useState<string>('');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  
  // Analysis results
  const [clinicalResult, setClinicalResult] = useState<any>(null);
  const [comprehensiveResult, setComprehensiveResult] = useState<any>(null);
  const [fraudResult, setFraudResult] = useState<any>(null);
  const [revenueResult, setRevenueResult] = useState<any>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [viewingAnalysis, setViewingAnalysis] = useState<{ result: any; type: 'clinical' | 'comprehensive' | 'fraud-detection' | 'revenue-leakage' } | null>(null);

  // Fetch all customers on mount
  useEffect(() => {
    fetchCustomers();
  }, []);

  // Cleanup poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pollInterval]);

  const fetchCustomers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/customers`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch customers');
      }

      setCustomers(data.customers);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch customers');
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  const selectCustomer = async (customer: CustomerInfo) => {
    setSelectedCustomer(customer);
    setDocuments([]);
    setDocumentsReady(false);
    setIsLoadingDocuments(true);

    try {
      const response = await fetch(`${API_BASE_URL}/customers/${customer.id}/documents`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch documents');
      }

      // Lazy loading: Just list documents without downloading them
      // Documents will be downloaded only when selected for analysis
      const documentList: CustomerDocument[] = data.documents.map((doc: any) => ({
        ...doc,
        documentId: null, // Will be set when actually downloaded
        selected: false,
        isDownloaded: false
      }));

      setDocuments(documentList);
      setDocumentsReady(true);
      setSelectedModuleForSelection(null);
      toast.success(`Found ${documentList.length} documents for ${customer.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load documents');
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  const toggleDocumentSelection = (docId: string) => {
    setDocuments(docs =>
      docs.map(doc =>
        doc.id === docId ? { ...doc, selected: !doc.selected } : doc
      )
    );
  };

  const clearSelections = () => {
    setDocuments(docs => docs.map(doc => ({ ...doc, selected: false })));
    setSelectedModuleForSelection(null);
  };

  const startAnalysisWithSelected = async () => {
    if (!selectedModuleForSelection) {
      toast.error('Please select an analysis module first');
      return;
    }

    const selectedDocs = documents.filter(d => d.selected);
    
    if (selectedDocs.length === 0) {
      toast.error('Please select at least one document');
      return;
    }

    const module = analysisModules.find(m => m.id === selectedModuleForSelection);

    // Download selected documents that haven't been downloaded yet
    toast.loading('Preparing documents for analysis...');
    const downloadPromises = selectedDocs.map(async (doc) => {
      if (doc.documentId && doc.isDownloaded) {
        return doc; // Already downloaded
      }

      try {
        if (!selectedCustomer) return doc;
        
        const downloadResponse = await fetch(
          `${API_BASE_URL}/customers/${selectedCustomer.id}/documents/${doc.blobPath.split('/').slice(1).join('/')}/download`
        );
        const downloadData = await downloadResponse.json();

        if (downloadResponse.ok) {
          return {
            ...doc,
            documentId: downloadData.documentId,
            isDownloaded: true
          };
        }
        return doc;
      } catch (err) {
        console.error(`Failed to download ${doc.name}`, err);
        return doc;
      }
    });

    const downloadedDocs = await Promise.all(downloadPromises);
    
    // Update documents state with downloaded info
    setDocuments(prevDocs =>
      prevDocs.map(doc => {
        const downloaded = downloadedDocs.find(d => d.id === doc.id);
        return downloaded || doc;
      })
    );

    // Check if all downloads were successful
    const documentIds = downloadedDocs.map(doc => doc.documentId).filter(Boolean);
    
    if (documentIds.length === 0) {
      toast.error('Failed to download selected documents');
      return;
    }

    if (documentIds.length < selectedDocs.length) {
      toast.warning(`Only ${documentIds.length} of ${selectedDocs.length} documents downloaded successfully`);
    } else {
      toast.success(`Downloaded ${documentIds.length} documents successfully`);
    }

    // Validation based on module type
    if (module?.type === 'single' && selectedDocs.length !== 1) {
      toast.error('Handwritten Document Analysis requires exactly 1 document');
      return;
    }

    if ((module?.type === 'fraud-detection' || module?.type === 'revenue-leakage') && selectedDocs.length < 2) {
      toast.error('Fraud Detection and Revenue Leakage require at least 2 documents (1 bill + medical records)');
      return;
    }

    setIsAnalyzing(selectedModuleForSelection);
    setAnalysisProgress(25);

    try {
      let result;
      const documentIds = selectedDocs.map(d => d.documentId!).filter(Boolean);
      
      // Store selected document IDs for later use in the viewer
      setSelectedDocumentIds(selectedDocs.map(d => d.id).filter(Boolean));

      if (module?.type === 'single') {
        result = await ApiService.startSingleDocumentAnalysis(documentIds[0]);
      } else if (module?.type === 'comprehensive') {
        result = await ApiService.startComprehensiveAnalysis(documentIds);
      } else if (module?.type === 'fraud-detection' || module?.type === 'revenue-leakage') {
        const billId = documentIds[0];
        const medicalRecordIds = documentIds.slice(1);

        if (module.type === 'fraud-detection') {
          result = await ApiService.startFraudDetectionAnalysis(billId, medicalRecordIds);
        } else {
          result = await ApiService.startRevenueLeakageAnalysis(billId, medicalRecordIds);
        }
      }

      if (!result?.success || !result.data?.jobId) {
        throw new Error(result?.error || 'Failed to start analysis');
      }

      const jobId = result.data.jobId;
      
      // Start polling for results
      const interval = setInterval(async () => {
        try {
          const statusResponse = await ApiService.getAnalysisStatus(jobId);
          
          if (statusResponse.success && statusResponse.data) {
            const status = statusResponse.data.status;
            
            if (status === 'completed') {
              clearInterval(interval);
              setPollInterval(null);
              setAnalysisProgress(90);
              
              const resultResponse = await ApiService.getAnalysisResult(jobId);
              const resultData = resultResponse.success && resultResponse.data ? resultResponse.data.result : null;
              
              if (resultData) {
                // Set the appropriate result based on module type
                if (module?.type === 'single') {
                  setClinicalResult(resultData);
                } else if (module?.type === 'comprehensive') {
                  setComprehensiveResult(resultData);
                } else if (module?.type === 'fraud-detection') {
                  setFraudResult(resultData);
                } else if (module?.type === 'revenue-leakage') {
                  setRevenueResult(resultData);
                }
                
                setAnalysisProgress(100);
                setIsAnalyzing(null);
                toast.success(`${module?.name || 'Analysis'} completed!`);
                clearSelections();
              }
            } else if (status === 'failed') {
              clearInterval(interval);
              setPollInterval(null);
              setIsAnalyzing(null);
              toast.error('Analysis failed');
            } else {
              const newProgress = Math.min(25 + Math.random() * 40, 80);
              setAnalysisProgress(newProgress);
            }
          }
        } catch (statusError) {
          console.error('Status check error:', statusError);
        }
      }, 3000);

      setPollInterval(interval);
      
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Analysis failed');
      setIsAnalyzing(null);
      setAnalysisProgress(0);
    }
  };

  const backToCustomers = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    setSelectedCustomer(null);
    setDocuments([]);
    setDocumentsReady(false);
    setIsAnalyzing(null);
    setSelectedModuleForSelection(null);
    setClinicalResult(null);
    setComprehensiveResult(null);
    setFraudResult(null);
    setRevenueResult(null);
  };

  if (isLoadingCustomers) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading customers...</p>
        </div>
      </div>
    );
  }

  // Customer Selection View
  if (!selectedCustomer) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4 flex items-center justify-center">
            <UserCircleIcon className="h-9 w-9 mr-3 text-blue-600" />
            Customer Analysis
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Select a customer to view their documents and perform analysis
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {customers.map((customer) => (
            <motion.div
              key={customer.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 cursor-pointer hover:border-blue-400 hover:shadow-xl transition-all"
              onClick={() => selectCustomer(customer)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                    <UserCircleIcon className="h-7 w-7 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{customer.name}</h3>
                    <p className="text-sm text-gray-500">{customer.id}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Age:</span>
                  <span className="font-medium text-gray-900">{customer.age} years</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Gender:</span>
                  <span className="font-medium text-gray-900">{customer.gender}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Last Visit:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(customer.lastVisit).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <button className="w-full py-2 px-4 bg-gradient-to-r from-primary-600 to-blue-600 text-white rounded-lg font-semibold hover:from-primary-700 hover:to-blue-700 transition-all">
                  View Documents & Analyze
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // Customer Details & Analysis View
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Back Button & Header */}
      <div>
        <button
          onClick={backToCustomers}
          className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back to Customers
        </button>
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex items-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mr-4">
                <UserCircleIcon className="h-10 w-10 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{selectedCustomer.name}</h2>
                <p className="text-gray-500">{selectedCustomer.id}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Last Visit</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Date(selectedCustomer.lastVisit).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div>
              <p className="text-sm text-gray-500">Age & Gender</p>
              <p className="font-medium text-gray-900">{selectedCustomer.age} yrs • {selectedCustomer.gender}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Phone</p>
              <p className="font-medium text-gray-900">{selectedCustomer.phone}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Documents Loading */}
      {isLoadingDocuments && (
        <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading and preparing documents...</p>
          </div>
        </div>
      )}

      {/* Analysis Section */}
      {documentsReady && documents.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-lg p-6 border border-gray-200"
        >
          <h3 className="text-xl font-bold text-gray-900 mb-6">Run Analysis</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Select Analysis Module */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Analysis Type
              </label>
              <select
                value={selectedModuleForSelection || ''}
                onChange={(e) => setSelectedModuleForSelection(e.target.value || null)}
                disabled={isAnalyzing !== null}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">-- Choose Analysis Type --</option>
                {analysisModules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.name}
                  </option>
                ))}
              </select>
              {selectedModuleForSelection && (
                <p className="mt-2 text-sm text-gray-600">
                  {analysisModules.find(m => m.id === selectedModuleForSelection)?.description}
                </p>
              )}
            </div>

            {/* Select Documents */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Documents
                {selectedModuleForSelection && (
                  <span className="text-xs text-blue-600 ml-2">
                    {selectedModuleForSelection === 'clinical' && '(Select 1)'}
                    {selectedModuleForSelection === 'comprehensive' && '(Select 1+)'}
                    {(selectedModuleForSelection === 'fraud-detection' || selectedModuleForSelection === 'revenue-leakage') && 
                      '(Select 2+: Bill first, then medical records)'}
                  </span>
                )}
              </label>
              <select
                multiple
                value={documents.filter(d => d.selected).map(d => d.id)}
                onChange={(e) => {
                  const selectedIds = Array.from(e.target.selectedOptions).map(opt => opt.value);
                  setDocuments(prev => prev.map(doc => ({
                    ...doc,
                    selected: selectedIds.includes(doc.id)
                  })));
                }}
                disabled={!selectedModuleForSelection || isAnalyzing !== null}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed min-h-[120px]"
              >
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.isDownloaded ? '✓ ' : '○ '}{doc.name} ({(doc.size / 1024).toFixed(2)} KB)
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-500">
                Hold Ctrl/Cmd to select multiple. ✓ = Ready, ○ = Will download on start
              </p>
            </div>
          </div>

          {/* Start Analysis Button */}
          {selectedModuleForSelection && documents.some(d => d.selected) && (
            <div className="flex justify-center">
              <button
                onClick={startAnalysisWithSelected}
                disabled={isAnalyzing !== null}
                className="px-8 py-3 bg-gradient-to-r from-primary-600 to-blue-600 text-white rounded-lg font-semibold hover:from-primary-700 hover:to-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex items-center text-lg"
              >
                <PlayIcon className="h-6 w-6 mr-2" />
                Start {analysisModules.find(m => m.id === selectedModuleForSelection)?.name}
              </button>
            </div>
          )}

          {/* Progress Bar */}
          {isAnalyzing && (
            <div className="mt-6">
              <div className="bg-gray-200 rounded-full h-3">
                <motion.div 
                  className="bg-gradient-to-r from-primary-600 to-blue-600 h-3 rounded-full" 
                  initial={{ width: 0 }} 
                  animate={{ width: `${analysisProgress}%` }} 
                  transition={{ duration: 0.5 }} 
                />
              </div>
              <p className="text-center text-sm text-gray-600 mt-2">
                {analysisProgress < 30 ? 'Initializing analysis...' : 
                 analysisProgress < 60 ? 'Processing documents...' : 
                 analysisProgress < 90 ? 'Generating insights...' : 
                 'Finalizing results...'}
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* Analysis Results Summary */}
      {(clinicalResult || comprehensiveResult || fraudResult || revenueResult) && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-lg p-6 border border-gray-200"
        >
          <div className="text-center">
            <div className="mb-4">
              <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Analysis Complete!</h3>
            <p className="text-gray-600 mb-6">
              {clinicalResult && 'Handwritten Document Analysis'}
              {comprehensiveResult && 'Comprehensive Analysis'}
              {fraudResult && 'Fraud Detection Analysis'}
              {revenueResult && 'Revenue Leakage Analysis'}
              {' '}has finished successfully.
            </p>
            
            <div className="flex justify-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (clinicalResult) setViewingAnalysis({ result: clinicalResult, type: 'clinical' });
                  else if (comprehensiveResult) setViewingAnalysis({ result: comprehensiveResult, type: 'comprehensive' });
                  else if (fraudResult) setViewingAnalysis({ result: fraudResult, type: 'fraud-detection' });
                  else if (revenueResult) setViewingAnalysis({ result: revenueResult, type: 'revenue-leakage' });
                }}
                className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all flex items-center"
              >
                <EyeIcon className="w-5 h-5 mr-2" />
                View Completed Analysis
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setClinicalResult(null);
                  setComprehensiveResult(null);
                  setFraudResult(null);
                  setRevenueResult(null);
                  setSelectedAnalysisType('');
                  setSelectedDocumentIds([]);
                }}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all"
              >
                Start New Analysis
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Analysis Result Viewer Modal */}
      <AnimatePresence>
        {viewingAnalysis && (
          <AnalysisResultViewer
            result={viewingAnalysis.result}
            analysisType={viewingAnalysis.type}
            onClose={() => setViewingAnalysis(null)}
            documents={documents.filter(doc => selectedDocumentIds.includes(doc.id || doc.documentId || ''))}
          />
        )}
      </AnimatePresence>

      {/* Old inline results sections - REMOVED */}
      {/* Clinical Analysis Result */}
      {false && clinicalResult && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-lg p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center">
              <DocumentMagnifyingGlassIcon className="h-6 w-6 mr-2 text-blue-600" />
              Clinical Document Analysis Result
            </h3>
            <button
              onClick={() => setClinicalResult(null)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear Result
            </button>
          </div>

          <div className="space-y-4">
            {/* Document Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Document Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">File Name:</span>
                  <p className="font-medium">{clinicalResult.image_name || clinicalResult.imageName || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-600">Analysis Time:</span>
                  <p className="font-medium">
                    {(clinicalResult.analysis_timestamp || clinicalResult.analysisTimestamp) ? 
                      new Date(clinicalResult.analysis_timestamp || clinicalResult.analysisTimestamp).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Medical Analysis */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h4 className="font-medium text-gray-900 mb-3">Medical Analysis</h4>
              
              <div className="text-gray-700 leading-relaxed">
                {(() => {
                  let medicalAnalysis = clinicalResult.medical_analysis || clinicalResult.medicalAnalysis;
                  
                  if (typeof medicalAnalysis === 'object' && medicalAnalysis !== null) {
                    medicalAnalysis = medicalAnalysis.medical_analysis || medicalAnalysis.medicalAnalysis || JSON.stringify(medicalAnalysis, null, 2);
                  }
                  
                  if (typeof medicalAnalysis === 'string' && medicalAnalysis.trim()) {
                    return (
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({...props}) => <h1 className="text-xl font-bold text-gray-900 mb-4 mt-6" {...props} />,
                            h2: ({...props}) => <h2 className="text-lg font-bold text-gray-900 mb-3 mt-5" {...props} />,
                            h3: ({...props}) => <h3 className="text-base font-semibold text-gray-900 mb-2 mt-4" {...props} />,
                            h4: ({...props}) => <h4 className="text-sm font-semibold text-gray-900 mb-2 mt-3" {...props} />,
                            p: ({...props}) => <p className="mb-3 text-gray-700 leading-relaxed" {...props} />,
                            ul: ({...props}) => <ul className="list-disc ml-6 mb-3 space-y-1" {...props} />,
                            ol: ({...props}) => <ol className="list-decimal ml-6 mb-3 space-y-1" {...props} />,
                            li: ({...props}) => <li className="text-gray-700" {...props} />,
                            strong: ({...props}) => <strong className="font-semibold text-gray-900" {...props} />,
                            em: ({...props}) => <em className="italic text-gray-700" {...props} />,
                            hr: ({...props}) => <hr className="my-6 border-gray-300" {...props} />,
                            blockquote: ({...props}) => <blockquote className="border-l-4 border-blue-400 pl-4 italic text-gray-700 my-4" {...props} />,
                            code: ({...props}: any) => {
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
                      <pre className="whitespace-pre-wrap text-sm bg-gray-100 p-3 rounded overflow-auto max-h-96">
                        {JSON.stringify(medicalAnalysis, null, 2)}
                      </pre>
                    );
                  }
                })()}
              </div>
            </div>

            <div className="flex items-center">
              <CheckCircleIcon className="w-5 h-5 text-blue-600 mr-2" />
              <span className="text-blue-600 font-medium">Analysis completed successfully</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Comprehensive Analysis Result */}
      {false && comprehensiveResult && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-lg p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center">
              <DocumentTextIcon className="h-6 w-6 mr-2 text-blue-600" />
              Comprehensive Analysis Result
            </h3>
            <button
              onClick={() => setComprehensiveResult(null)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear Result
            </button>
          </div>

          <div className="space-y-4">
            {/* Comprehensive Analysis */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h4 className="font-medium text-gray-900 mb-3">Comprehensive Medical Analysis</h4>
              
              <div className="text-gray-700 leading-relaxed">
                {(() => {
                  let analysis = comprehensiveResult.analysis || comprehensiveResult.comprehensive_analysis;
                  
                  if (typeof analysis === 'object' && analysis !== null) {
                    analysis = analysis.analysis || analysis.comprehensive_analysis || JSON.stringify(analysis, null, 2);
                  }
                  
                  if (typeof analysis === 'string' && analysis.trim()) {
                    return (
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({...props}) => <h1 className="text-xl font-bold text-gray-900 mb-4 mt-6" {...props} />,
                            h2: ({...props}) => <h2 className="text-lg font-bold text-gray-900 mb-3 mt-5" {...props} />,
                            h3: ({...props}) => <h3 className="text-base font-semibold text-gray-900 mb-2 mt-4" {...props} />,
                            h4: ({...props}) => <h4 className="text-sm font-semibold text-gray-900 mb-2 mt-3" {...props} />,
                            p: ({...props}) => <p className="mb-3 text-gray-700 leading-relaxed" {...props} />,
                            ul: ({...props}) => <ul className="list-disc ml-6 mb-3 space-y-1" {...props} />,
                            ol: ({...props}) => <ol className="list-decimal ml-6 mb-3 space-y-1" {...props} />,
                            li: ({...props}) => <li className="text-gray-700" {...props} />,
                            strong: ({...props}) => <strong className="font-semibold text-gray-900" {...props} />,
                            em: ({...props}) => <em className="italic text-gray-700" {...props} />,
                            hr: ({...props}) => <hr className="my-6 border-gray-300" {...props} />,
                            blockquote: ({...props}) => <blockquote className="border-l-4 border-blue-400 pl-4 italic text-gray-700 my-4" {...props} />,
                            code: ({...props}: any) => {
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
                    );
                  } else {
                    return (
                      <pre className="whitespace-pre-wrap text-sm bg-gray-100 p-3 rounded overflow-auto max-h-96">
                        {JSON.stringify(analysis, null, 2)}
                      </pre>
                    );
                  }
                })()}
              </div>
            </div>

            <div className="flex items-center">
              <CheckCircleIcon className="w-5 h-5 text-blue-600 mr-2" />
              <span className="text-blue-600 font-medium">Analysis completed successfully</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Fraud Detection Result */}
      {false && fraudResult && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-lg p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center">
              <ShieldExclamationIcon className="h-6 w-6 mr-2 text-blue-600" />
              Fraud Detection Analysis Result
            </h3>
            <button
              onClick={() => setFraudResult(null)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear Result
            </button>
          </div>

          <div className="space-y-6">
            {/* Summary */}
            {fraudResult.fraud_detection_result?.summary && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2">Summary</h4>
                <p className="text-blue-800">{fraudResult.fraud_detection_result.summary}</p>
              </div>
            )}

            {/* Mismatches */}
            {fraudResult.fraud_detection_result?.mismatches && fraudResult.fraud_detection_result.mismatches.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">
                  Potential Fraud Cases ({fraudResult.fraud_detection_result.mismatches.length})
                </h4>
                <div className="space-y-3">
                  {fraudResult.fraud_detection_result.mismatches.map((mismatch: any, idx: number) => (
                    <div key={idx} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-red-900">{mismatch.medication_name || mismatch.item}</p>
                          {mismatch.quantity && <p className="text-sm text-red-700">Quantity: {mismatch.quantity}</p>}
                          {mismatch.amount && <p className="text-sm text-red-700">Amount: ₹{mismatch.amount}</p>}
                        </div>
                        <span className="px-3 py-1 bg-red-600 text-white text-xs rounded-full font-medium">
                          Fraud Risk
                        </span>
                      </div>
                      <p className="text-sm text-red-800 mt-2">{mismatch.reason || mismatch.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detailed Analysis */}
            {fraudResult.fraud_detection_result?.detailed_analysis && (
              <div className="prose max-w-none">
                <h4 className="font-semibold text-gray-900 mb-3">Detailed Analysis</h4>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {fraudResult.fraud_detection_result.detailed_analysis}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Revenue Leakage Result */}
      {false && revenueResult && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-lg p-6 border border-gray-200"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center">
              <CurrencyDollarIcon className="h-6 w-6 mr-2 text-blue-600" />
              Revenue Leakage Analysis Result
            </h3>
            <button
              onClick={() => setRevenueResult(null)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear Result
            </button>
          </div>

          <div className="space-y-6">
            {/* Summary */}
            {revenueResult.revenue_leakage_result?.summary && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2">Summary</h4>
                <p className="text-blue-800">{revenueResult.revenue_leakage_result.summary}</p>
              </div>
            )}

            {/* Unbilled Items */}
            {revenueResult.revenue_leakage_result?.unbilled_items && revenueResult.revenue_leakage_result.unbilled_items.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">
                  Unbilled Items ({revenueResult.revenue_leakage_result.unbilled_items.length})
                </h4>
                <div className="space-y-3">
                  {revenueResult.revenue_leakage_result.unbilled_items.map((item: any, idx: number) => (
                    <div key={idx} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-yellow-900">{item.medication_name || item.item}</p>
                          {item.quantity && <p className="text-sm text-yellow-700">Quantity: {item.quantity}</p>}
                          {item.estimated_value && (
                            <p className="text-sm text-yellow-700">Estimated Value: ₹{item.estimated_value}</p>
                          )}
                        </div>
                        <span className="px-3 py-1 bg-yellow-600 text-white text-xs rounded-full font-medium">
                          Unbilled
                        </span>
                      </div>
                      <p className="text-sm text-yellow-800 mt-2">{item.reason || item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detailed Analysis */}
            {revenueResult.revenue_leakage_result?.detailed_analysis && (
              <div className="prose max-w-none">
                <h4 className="font-semibold text-gray-900 mb-3">Detailed Analysis</h4>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {revenueResult.revenue_leakage_result.detailed_analysis}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default CustomerAnalysis;
