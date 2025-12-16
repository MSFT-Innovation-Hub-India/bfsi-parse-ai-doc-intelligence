'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { 
  CloudArrowUpIcon,
  DocumentTextIcon,
  PlayIcon,
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { ApiService } from '@/lib/api';
import DocumentViewer from './DocumentViewer';
import SampleDocumentsButton from './SampleDocumentsButton';

interface FraudDetectionResult {
  analysisId: string;
  timestamp: string;
  analysisType: string;
  fraudRiskLevel: string;
  totalFraudIndicators: number;
  fraudIndicators: {
    medicationsBilledButNotInRecords?: any[];
    proceduresBilledButNotDocumented?: any[];
  };
  recommendations?: string[];
}

export default function FraudDetectionAnalysis() {
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billDocumentId, setBillDocumentId] = useState<string | null>(null);
  const [medicalFiles, setMedicalFiles] = useState<File[]>([]);
  const [medicalDocumentIds, setMedicalDocumentIds] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [fraudResult, setFraudResult] = useState<FraudDetectionResult | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [billPreviewUrl, setBillPreviewUrl] = useState<string | null>(null);
  const [medicalPreviewUrls, setMedicalPreviewUrls] = useState<string[]>([]);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [selectedDocumentForViewing, setSelectedDocumentForViewing] = useState<{
    url: string;
    name: string;
    type: 'bill' | 'medical';
  } | null>(null);

  const handleBillSamplesLoaded = async (documentIds: string[], _filenameMap?: Record<string, string>) => {
    if (documentIds.length === 0) return;
    
    try {
      const documentId = documentIds[0];
      setBillDocumentId(documentId);
      
      const placeholderFile = new File([], 'Sample Bill Document', { type: 'application/pdf' });
      setBillFile(placeholderFile);
      
      const previewUrl = URL.createObjectURL(placeholderFile);
      setBillPreviewUrl(previewUrl);
      
      toast.success('Sample bill loaded successfully');
    } catch (error) {
      console.error('Error loading sample bill:', error);
      toast.error('Failed to load sample bill');
    }
  };

  const handleMedicalSamplesLoaded = async (documentIds: string[], _filenameMap?: Record<string, string>) => {
    if (documentIds.length === 0) return;
    
    try {
      const placeholderFiles = documentIds.map((_, index) => 
        new File([], `Sample Medical Record ${index + 1}`, { type: 'application/pdf' })
      );
      
      setMedicalFiles(prev => [...prev, ...placeholderFiles]);
      setMedicalDocumentIds(prev => [...prev, ...documentIds]);
      
      const previewUrls = placeholderFiles.map(file => URL.createObjectURL(file));
      setMedicalPreviewUrls(prev => [...prev, ...previewUrls]);
      
      toast.success(`${documentIds.length} sample medical record(s) loaded successfully`);
    } catch (error) {
      console.error('Error loading sample medical records:', error);
      toast.error('Failed to load sample medical records');
    }
  };

  const onBillDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setBillFile(file);
      
      const previewUrl = URL.createObjectURL(file);
      setBillPreviewUrl(previewUrl);
      
      try {
        toast.loading('Uploading bill document...', { id: 'bill-upload' });
        const uploadResult = await ApiService.uploadDocument(file);
        
        if (uploadResult.success && uploadResult.data) {
          setBillDocumentId(uploadResult.data.documentId);
          toast.success('Bill document uploaded successfully!', { id: 'bill-upload' });
        } else {
          throw new Error(uploadResult.error || 'Upload failed');
        }
      } catch (error) {
        toast.error('Failed to upload bill document', { id: 'bill-upload' });
        setBillFile(null);
      }
    }
  }, []);

  const onMedicalDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const files = acceptedFiles;
      setMedicalFiles(prev => [...prev, ...files]);
      
      const newPreviewUrls = files.map(file => URL.createObjectURL(file));
      setMedicalPreviewUrls(prev => [...prev, ...newPreviewUrls]);
      
      try {
        toast.loading('Uploading medical documents...', { id: 'medical-upload' });
        const uploadPromises = files.map(file => ApiService.uploadDocument(file));
        const uploadResults = await Promise.all(uploadPromises);
        
        const successfulUploads = uploadResults.filter(result => result.success && result.data);
        if (successfulUploads.length !== uploadResults.length) {
          throw new Error('Some uploads failed');
        }
        
        const newIds = successfulUploads.map(result => result.data!.documentId);
        setMedicalDocumentIds(prev => [...prev, ...newIds]);
        toast.success(`${files.length} medical documents uploaded successfully!`, { id: 'medical-upload' });
      } catch (error) {
        toast.error('Failed to upload medical documents', { id: 'medical-upload' });
        setMedicalFiles(prev => prev.filter(f => !files.includes(f)));
      }
    }
  }, []);

  const { getRootProps: getBillRootProps, getInputProps: getBillInputProps, isDragActive: isBillDragActive } = useDropzone({
    onDrop: onBillDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    multiple: false
  });

  const { getRootProps: getMedicalRootProps, getInputProps: getMedicalInputProps, isDragActive: isMedicalDragActive } = useDropzone({
    onDrop: onMedicalDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif'],
      'application/pdf': ['.pdf']
    },
    multiple: true
  });

  const startFraudDetection = async () => {
    if (!billDocumentId || medicalDocumentIds.length === 0) {
      toast.error('Please upload both bill and medical documents first');
      return;
    }

    console.log('📊 Fraud Detection - Starting analysis with:', {
      billDocumentId,
      medicalDocumentIds
    });

    setIsAnalyzing(true);
    setAnalysisProgress(10);
    
    try {
      const analysisResponse = await ApiService.startFraudDetectionAnalysis(billDocumentId, medicalDocumentIds);
      console.log('📊 Fraud Detection - Analysis response:', analysisResponse);
      
      if (!analysisResponse.success || !analysisResponse.data) {
        throw new Error(analysisResponse.error || 'Failed to start analysis');
      }
      
      const jobId = analysisResponse.data.jobId;
      console.log('📊 Fraud Detection - Job ID:', jobId);
      setAnalysisProgress(25);

      const interval = setInterval(async () => {
        try {
          const statusResponse = await ApiService.getAnalysisStatus(jobId);
          console.log('📊 Fraud Detection - Status response:', statusResponse);
          
          if (statusResponse.success && statusResponse.data) {
            const status = statusResponse.data.status;
            console.log('📊 Fraud Detection - Job status:', status);
            
            if (status === 'completed') {
              clearInterval(interval);
              setPollInterval(null);
              setAnalysisProgress(90);
              
              console.log('📊 Fraud Detection - Fetching result for jobId:', jobId);
              const resultResponse = await ApiService.getAnalysisResult(jobId);
              console.log('📊 Fraud Detection - Result response:', resultResponse);
              console.log('📊 Fraud Detection - Result response full:', JSON.stringify(resultResponse, null, 2));
              
              const resultData = resultResponse.success && resultResponse.data ? resultResponse.data.result : null;
              console.log('📊 Fraud Detection - Result data:', resultData);
              console.log('📊 Fraud Detection - Result data full:', JSON.stringify(resultData, null, 2));
              console.log('📊 Fraud Detection - fraudRiskLevel:', resultData?.fraudRiskLevel);
              console.log('📊 Fraud Detection - totalFraudIndicators:', resultData?.totalFraudIndicators);
              console.log('📊 Fraud Detection - fraudIndicators:', resultData?.fraudIndicators);
              
              if (resultData) {
                setFraudResult(resultData);
                setAnalysisProgress(100);
                setIsAnalyzing(false);
                toast.success('Fraud detection completed!');
              } else {
                console.error('📊 Fraud Detection - No result data found');
                toast.error('No analysis result found');
              }
            } else if (status === 'failed') {
              clearInterval(interval);
              setPollInterval(null);
              setIsAnalyzing(false);
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
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      toast.error('Failed to start analysis: ' + (error as Error).message);
    }
  };

  const clearAnalysis = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    setFraudResult(null);
    setAnalysisProgress(0);
    setIsAnalyzing(false);
  };

  const removeBillFile = () => {
    if (billPreviewUrl) {
      URL.revokeObjectURL(billPreviewUrl);
      setBillPreviewUrl(null);
    }
    setBillFile(null);
    setBillDocumentId(null);
  };

  const removeMedicalFile = (index: number) => {
    if (medicalPreviewUrls[index]) {
      URL.revokeObjectURL(medicalPreviewUrls[index]);
    }
    setMedicalPreviewUrls(prev => prev.filter((_, i) => i !== index));
    setMedicalFiles(prev => prev.filter((_, i) => i !== index));
    setMedicalDocumentIds(prev => prev.filter((_, i) => i !== index));
  };

  const getRiskColor = (level: string) => {
    switch (level?.toUpperCase()) {
      case 'HIGH': return 'text-red-700 bg-red-50 border-red-200';
      case 'MEDIUM': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'LOW': return 'text-green-700 bg-green-50 border-green-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const viewBillDocument = () => {
    if (!billPreviewUrl || !billFile) {
      toast.error('Bill document preview not available');
      return;
    }
    setSelectedDocumentForViewing({
      url: billPreviewUrl,
      name: billFile.name,
      type: 'bill'
    });
    setShowDocumentViewer(true);
  };

  const viewMedicalDocument = (index: number) => {
    if (!medicalPreviewUrls[index] || !medicalFiles[index]) {
      toast.error('Medical document preview not available');
      return;
    }
    setSelectedDocumentForViewing({
      url: medicalPreviewUrls[index],
      name: medicalFiles[index].name,
      type: 'medical'
    });
    setShowDocumentViewer(true);
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4 flex items-center justify-center">
          <ShieldExclamationIcon className="h-9 w-9 mr-3 text-blue-600" />
          Fraud Detection Analysis
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Identify medications and procedures billed but not documented in medical records - potential phantom billing and fraud indicators.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <CurrencyDollarIcon className="h-6 w-6 mr-2 text-blue-600" />
            Hospital Bill
          </h2>
          
          <div {...getBillRootProps()} className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors duration-200 ${isBillDragActive ? 'border-primary-400 bg-primary-50' : billFile ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400'}`}>
            <input {...getBillInputProps()} />
            <CloudArrowUpIcon className={`mx-auto h-12 w-12 mb-4 ${billFile ? 'text-blue-500' : 'text-gray-400'}`} />
            {billFile ? (
              <div>
                <p className="text-sm font-medium text-blue-600 mb-2">✓ Bill uploaded</p>
                <p className="text-sm text-gray-600">{billFile.name}</p>
                <button onClick={(e) => { e.stopPropagation(); removeBillFile(); }} className="mt-2 text-blue-600 hover:text-blue-700 text-sm">Remove</button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-2">{isBillDragActive ? 'Drop the bill here' : 'Click or drag bill document'}</p>
                <p className="text-xs text-gray-500">PDF, JPG, PNG up to 16MB</p>
              </div>
            )}
          </div>

          <div className="mt-4">
            <SampleDocumentsButton
              category="medical"
              onSamplesLoaded={handleBillSamplesLoaded}
              disabled={isAnalyzing}
              multiple={false}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <DocumentTextIcon className="h-6 w-6 mr-2 text-blue-600" />
            Medical Records
          </h2>
          
          <div {...getMedicalRootProps()} className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors duration-200 ${isMedicalDragActive ? 'border-primary-400 bg-primary-50' : medicalFiles.length > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400'}`}>
            <input {...getMedicalInputProps()} />
            <CloudArrowUpIcon className={`mx-auto h-12 w-12 mb-4 ${medicalFiles.length > 0 ? 'text-blue-500' : 'text-gray-400'}`} />
            <div>
              {medicalFiles.length > 0 ? (
                <>
                  <p className="text-sm font-medium text-blue-600 mb-3">✓ {medicalFiles.length} medical document{medicalFiles.length > 1 ? 's' : ''} uploaded</p>
                  <div className="max-h-48 overflow-y-auto space-y-2 mb-3">
                    {medicalFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between text-sm text-gray-700 bg-white p-2 rounded border border-gray-200">
                        <div className="flex items-center flex-1 min-w-0 mr-2">
                          <DocumentTextIcon className="w-4 h-4 text-blue-600 mr-2 flex-shrink-0" />
                          <span className="truncate">{file.name}</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); removeMedicalFile(index); }} className="text-red-600 hover:text-red-700 text-lg font-bold w-6 h-6 flex items-center justify-center flex-shrink-0">×</button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 text-center">Click above to add more documents</p>
                </>
              ) : (
                <div>
                  <p className="text-sm text-gray-600 mb-2">{isMedicalDragActive ? 'Drop medical records here' : 'Click or drag medical records'}</p>
                  <p className="text-xs text-gray-500">Multiple files supported • PDF, JPG, PNG up to 16MB each</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4">
            <SampleDocumentsButton
              category="medical"
              onSamplesLoaded={handleMedicalSamplesLoaded}
              disabled={isAnalyzing}
              multiple={true}
            />
          </div>
        </div>
      </div>

      <div className="text-center">
        <motion.button
          onClick={startFraudDetection}
          disabled={!billDocumentId || medicalDocumentIds.length === 0 || isAnalyzing}
          className={`inline-flex items-center px-8 py-4 rounded-lg font-semibold text-lg transition-all duration-200 ${!billDocumentId || medicalDocumentIds.length === 0 || isAnalyzing ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-primary-600 to-blue-600 text-white hover:from-primary-700 hover:to-blue-700 shadow-lg hover:shadow-xl'}`}
          whileHover={!isAnalyzing ? { scale: 1.05 } : {}}
          whileTap={!isAnalyzing ? { scale: 0.95 } : {}}
        >
          {isAnalyzing ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
              Analyzing... {Math.round(analysisProgress)}%
            </>
          ) : (
            <>
              <PlayIcon className="h-5 w-5 mr-3" />
              Start Fraud Detection
            </>
          )}
        </motion.button>
        
        {fraudResult && (
          <button onClick={clearAnalysis} className="ml-4 inline-flex items-center px-4 py-2 rounded-lg text-gray-600 hover:text-gray-800 transition-colors">
            Clear Results
          </button>
        )}
      </div>

      {isAnalyzing && (
        <div className="max-w-md mx-auto">
          <div className="bg-gray-200 rounded-full h-2">
            <motion.div className="bg-gradient-to-r from-primary-600 to-blue-600 h-2 rounded-full" initial={{ width: 0 }} animate={{ width: `${analysisProgress}%` }} transition={{ duration: 0.5 }} />
          </div>
          <p className="text-center text-sm text-gray-600 mt-2">
            {analysisProgress < 30 ? 'Initializing analysis...' : analysisProgress < 60 ? 'Scanning documents...' : analysisProgress < 90 ? 'Detecting fraud indicators...' : 'Finalizing results...'}
          </p>
        </div>
      )}

      {fraudResult && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <ShieldExclamationIcon className="h-7 w-7 mr-3 text-blue-600" />
              Fraud Detection Results
            </h2>
            <div className="text-sm text-gray-500">{new Date(fraudResult.timestamp).toLocaleString()}</div>
          </div>

          {/* Uploaded Documents Section */}
          <div className="bg-gray-50 rounded-lg p-6 mb-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <DocumentTextIcon className="h-5 w-5 mr-2" />
              Analyzed Documents
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Bill Document */}
              <div className="bg-white rounded-lg p-4 border border-gray-300">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center mb-2">
                      <CurrencyDollarIcon className="w-5 h-5 text-blue-600 mr-2" />
                      <h4 className="font-semibold text-gray-900">Hospital Bill</h4>
                    </div>
                    <p className="text-sm text-gray-600 truncate">{billFile?.name}</p>
                  </div>
                  <button
                    onClick={viewBillDocument}
                    className="ml-2 inline-flex items-center px-3 py-2 text-sm rounded-lg font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
                  >
                    <EyeIcon className="w-4 h-4 mr-1" />
                    View
                  </button>
                </div>
              </div>

              {/* Medical Records */}
              <div className="bg-white rounded-lg p-4 border border-gray-300">
                <div className="flex items-center mb-3">
                  <DocumentTextIcon className="w-5 h-5 text-blue-600 mr-2" />
                  <h4 className="font-semibold text-gray-900">Medical Records ({medicalFiles.length})</h4>
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {medicalFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                      <span className="truncate flex-1 text-gray-700">{file.name}</span>
                      <button
                        onClick={() => viewMedicalDocument(index)}
                        className="ml-2 inline-flex items-center px-2 py-1 text-xs rounded font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors flex-shrink-0"
                      >
                        <EyeIcon className="w-3 h-3 mr-1" />
                        View
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className={`rounded-lg p-6 border ${getRiskColor(fraudResult.fraudRiskLevel)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Fraud Risk Level</p>
                  <p className="text-2xl font-bold capitalize">{fraudResult.fraudRiskLevel || 'Unknown'}</p>
                </div>
                <ExclamationTriangleIcon className="h-8 w-8" />
              </div>
            </div>
            
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-600 text-sm font-medium">Total Fraud Indicators</p>
                  <p className="text-2xl font-bold text-blue-700">{fraudResult.totalFraudIndicators || 0}</p>
                </div>
                <ShieldExclamationIcon className="h-8 w-8 text-blue-500" />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center">
                <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
                Medications Billed but NOT in Medical Records
              </h3>
              <div className="space-y-3">
                {(fraudResult.fraudIndicators?.medicationsBilledButNotInRecords?.length || 0) > 0 ? (
                  fraudResult.fraudIndicators?.medicationsBilledButNotInRecords?.map((item: any, index: number) => (
                    <div key={index} className="text-sm text-gray-600 flex items-start bg-white p-3 rounded border border-blue-200">
                      <div className="w-2 h-2 bg-blue-600 rounded-full mr-3 mt-1.5 flex-shrink-0"></div>
                      <div>
                        <div className="font-semibold text-blue-700">{typeof item === 'string' ? item : item.medication || 'Unknown'}</div>
                        {typeof item === 'object' && item.concern && <div className="text-xs text-gray-500 mt-1">{item.concern}</div>}
                        {typeof item === 'object' && item.billed_in && <div className="text-xs text-blue-600 mt-1">Billed in: {item.billed_in}</div>}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500 italic">No fraud indicators found</div>
                )}
              </div>
            </div>

            {fraudResult.fraudIndicators?.proceduresBilledButNotDocumented && fraudResult.fraudIndicators.proceduresBilledButNotDocumented.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center">
                  <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
                  Procedures Billed but NOT Documented
                </h3>
                <div className="space-y-3">
                  {fraudResult.fraudIndicators.proceduresBilledButNotDocumented.map((item: any, index: number) => (
                    <div key={index} className="text-sm text-gray-600 flex items-start bg-white p-3 rounded border border-blue-200">
                      <div className="w-2 h-2 bg-blue-600 rounded-full mr-3 mt-1.5 flex-shrink-0"></div>
                      <div>
                        <div className="font-semibold text-blue-700">{typeof item === 'string' ? item : item.procedure || 'Unknown'}</div>
                        {typeof item === 'object' && item.concern && <div className="text-xs text-gray-500 mt-1">{item.concern}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fraudResult.recommendations && fraudResult.recommendations.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">Recommended Actions</h3>
                <ul className="space-y-2">
                  {fraudResult.recommendations.map((action: string, index: number) => (
                    <li key={index} className="text-sm text-gray-700 flex items-start">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-3 mt-2 flex-shrink-0"></div>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">What This Means</h3>
              <div className="space-y-3 text-sm text-gray-700">
                <p><strong className="text-blue-600">Fraud Detection Focus:</strong> This analysis identifies items that were billed but have no supporting documentation in medical records - a potential indicator of phantom billing or fraud.</p>
                <p><strong>Risk Level {fraudResult.fraudRiskLevel}:</strong> {fraudResult.fraudRiskLevel === 'HIGH' && 'Immediate investigation required. Significant discrepancies found.'} {fraudResult.fraudRiskLevel === 'MEDIUM' && 'Notable concerns identified. Review recommended.'} {fraudResult.fraudRiskLevel === 'LOW' && 'Minor issues detected. Standard follow-up sufficient.'}</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Document Viewer Modal */}
      {showDocumentViewer && selectedDocumentForViewing && (
        <DocumentViewer
          documentUrl={selectedDocumentForViewing.url}
          documentName={selectedDocumentForViewing.name}
          analysisData={{
            analysisTimestamp: fraudResult?.timestamp,
            analysisSuccessful: true,
            medicalAnalysis: selectedDocumentForViewing.type === 'bill'
              ? `# Hospital Bill Document\n\nThis is the billing document being analyzed for fraud detection.\n\n## Analysis Status\n${fraudResult ? '✓ Completed' : 'Pending'}\n\n## Fraud Risk Level\n${fraudResult ? fraudResult.fraudRiskLevel : 'N/A'}`
              : `# Medical Record Document\n\nThis is a medical record being compared against the bill for fraud detection.\n\n## Analysis Status\n${fraudResult ? '✓ Completed' : 'Pending'}`
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
