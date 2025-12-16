'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { 
  CloudArrowUpIcon,
  PlayIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  ShieldExclamationIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { ApiService } from '@/lib/api';
import SampleDocumentsButton from './SampleDocumentsButton';

export default function FraudDetection() {
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billDocumentId, setBillDocumentId] = useState<string | null>(null);
  const [medicalFiles, setMedicalFiles] = useState<File[]>([]);
  const [medicalDocumentIds, setMedicalDocumentIds] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [fraudAnalysisResult, setFraudAnalysisResult] = useState<any>(null);

  const handleBillSamplesLoaded = async (documentIds: string[], _filenameMap?: Record<string, string>) => {
    if (documentIds.length === 0) return;
    
    try {
      const documentId = documentIds[0];
      setBillDocumentId(documentId);
      
      // Create a placeholder file object for display
      const placeholderFile = new File([], 'Sample Bill Document', { type: 'application/pdf' });
      setBillFile(placeholderFile);
      
      toast.success('Sample bill loaded successfully');
    } catch (error) {
      console.error('Error loading sample bill:', error);
      toast.error('Failed to load sample bill');
    }
  };

  const handleMedicalSamplesLoaded = async (documentIds: string[], _filenameMap?: Record<string, string>) => {
    if (documentIds.length === 0) return;
    
    try {
      // Create placeholder file objects for display
      const placeholderFiles = documentIds.map((_, index) => 
        new File([], `Sample Medical Record ${index + 1}`, { type: 'application/pdf' })
      );
      
      setMedicalFiles(prev => [...prev, ...placeholderFiles]);
      setMedicalDocumentIds(prev => [...prev, ...documentIds]);
      
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
      
      try {
        const uploadResult = await ApiService.uploadDocument(file);
        if (uploadResult.success && uploadResult.data) {
          setBillDocumentId(uploadResult.data.documentId);
          toast.success('Bill document uploaded successfully');
        } else {
          throw new Error(uploadResult.error || 'Upload failed');
        }
      } catch (error) {
        console.error('Bill upload error:', error);
        toast.error('Failed to upload bill document');
      }
    }
  }, []);

  const onMedicalDrop = useCallback(async (acceptedFiles: File[]) => {
    setMedicalFiles(prev => [...prev, ...acceptedFiles]);
    
    // Upload files immediately
    for (const file of acceptedFiles) {
      try {
        const uploadResult = await ApiService.uploadDocument(file);
        if (uploadResult.success && uploadResult.data) {
          setMedicalDocumentIds(prev => [...prev, uploadResult.data!.documentId]);
          toast.success(`Uploaded: ${file.name}`);
        } else {
          throw new Error(uploadResult.error || 'Upload failed');
        }
      } catch (error) {
        console.error('Medical file upload error:', error);
        toast.error(`Failed to upload: ${file.name}`);
      }
    }
  }, []);

  const { getRootProps: getBillRootProps, getInputProps: getBillInputProps, isDragActive: isBillDragActive } = useDropzone({
    onDrop: onBillDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'],
      'application/pdf': ['.pdf']
    },
    multiple: false,
    maxFiles: 1
  });

  const { getRootProps: getMedicalRootProps, getInputProps: getMedicalInputProps, isDragActive: isMedicalDragActive } = useDropzone({
    onDrop: onMedicalDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'],
      'application/pdf': ['.pdf']
    },
    multiple: true
  });

  const removeMedicalFile = (index: number) => {
    setMedicalFiles(prev => prev.filter((_, i) => i !== index));
    setMedicalDocumentIds(prev => prev.filter((_, i) => i !== index));
    toast.success('Medical document removed');
  };

  const startFraudAnalysis = async () => {
    if (!billDocumentId) {
      toast.error('Please upload a bill document');
      return;
    }
    if (medicalDocumentIds.length === 0) {
      toast.error('Please upload at least one medical document');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    try {
      // Start fraud analysis via API
      const analysisResponse = await ApiService.startFraudAnalysis(billDocumentId, medicalDocumentIds);
      
      if (!analysisResponse.success || !analysisResponse.data) {
        throw new Error(analysisResponse.error || 'Failed to start fraud analysis');
      }

      const { jobId } = analysisResponse.data;
      
      // Poll for results
      await pollForFraudResults(jobId);
      
    } catch (error) {
      console.error('Fraud analysis error:', error);
      toast.error('Fraud analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const pollForFraudResults = async (jobId: string) => {
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
          
          setFraudAnalysisResult(resultResponse.data.result);
          toast.success('Fraud analysis completed successfully!');
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

  const simulateFraudAnalysis = async (bill: File, medicalDocs: File[]) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    return {
      analysisId: `fraud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      billDocument: {
        name: bill.name,
        type: 'medical_bill',
        totalItems: 15
      },
      medicalDocuments: medicalDocs.map(doc => ({
        name: doc.name,
        type: 'medical_record',
        itemsFound: Math.floor(Math.random() * 10) + 5
      })),
      fraudRiskScore: Math.floor(Math.random() * 40) + 20, // 20-60 risk score
      billVsMedicalMismatches: {
        medicationsBilledButNotInMedicalRecords: [
          'Expensive Brand Drug XYZ - $250',
          'Premium Supplement ABC - $89'
        ],
        medicationsInMedicalRecordsButNotBilled: [
          'Metformin 500mg',
          'Lisinopril 10mg'
        ],
        proceduresBilledButNotDocumented: [
          'Advanced Cardiac Screening - $450',
          'Specialty Consultation - $200'
        ],
        servicesDocumentedButNotBilled: [
          'Blood pressure monitoring',
          'Diabetes counseling'
        ]
      },
      revenueImpactAnalysis: {
        potentialRevenueLeakage: {
          estimatedAmount: '$340',
          unbilledServices: ['Blood pressure monitoring', 'Diabetes counseling'],
          percentage: '12%'
        },
        potentialFraudIndicators: {
          riskLevel: 'Medium',
          phantomBilling: [
            'Expensive Brand Drug XYZ - No medical record evidence',
            'Advanced Cardiac Screening - Not documented in medical records'
          ],
          overbilling: [
            'Premium Supplement ABC - Generic alternative prescribed'
          ]
        }
      },
      recommendations: {
        immediate: [
          'Investigate undocumented expensive medications',
          'Review billing for phantom procedures',
          'Audit provider billing practices'
        ],
        revenueRecovery: [
          'Bill for documented but unbilled services',
          'Implement proper medication documentation',
          'Establish billing compliance protocols'
        ],
        fraudPrevention: [
          'Implement automated bill-to-record verification',
          'Regular audit of high-value items',
          'Staff training on documentation requirements'
        ]
      }
    };
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return 'text-danger-600 bg-danger-50 border-danger-200';
    if (score >= 40) return 'text-warning-600 bg-warning-50 border-warning-200';
    return 'text-success-600 bg-success-50 border-success-200';
  };

  const getRiskLevel = (score: number) => {
    if (score >= 70) return 'High Risk';
    if (score >= 40) return 'Medium Risk';
    return 'Low Risk';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Discrepancy Detection Module</h2>
        <p className="text-gray-600">
          Compare medical bills against patient records to identify discrepancies, potential fraud, 
          and revenue leakage opportunities.
        </p>
      </div>

      {/* Upload Areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bill Upload */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <CurrencyDollarIcon className="w-5 h-5 mr-2 text-blue-600" />
            Medical Bill
          </h3>
          
          <div
            {...getBillRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              isBillDragActive
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <input {...getBillInputProps()} />
            <CloudArrowUpIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">
              {isBillDragActive ? 'Drop the bill here...' : 'Upload Medical Bill'}
            </p>
            <p className="text-gray-500">
              PDF or Image format
            </p>
          </div>

          {billFile && (
            <motion.div
              className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center space-x-2">
                <DocumentTextIcon className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">{billFile.name}</span>
              </div>
            </motion.div>
          )}

          <div className="mt-4">
            <SampleDocumentsButton
              category="financial"
              onSamplesLoaded={handleBillSamplesLoaded}
              disabled={isAnalyzing}
              multiple={false}
            />
          </div>
        </div>

        {/* Medical Records Upload */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <DocumentTextIcon className="w-5 h-5 mr-2 text-blue-600" />
            Medical Records ({medicalFiles.length})
          </h3>
          
          <div
            {...getMedicalRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              isMedicalDragActive
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <input {...getMedicalInputProps()} />
            <CloudArrowUpIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">
              {isMedicalDragActive ? 'Drop medical records here...' : 'Upload Medical Records'}
            </p>
            <p className="text-gray-500">
              Multiple images supported
            </p>
          </div>

          {medicalFiles.length > 0 && (
            <div className="mt-4 space-y-2 max-h-32 overflow-y-auto">
              {medicalFiles.map((file, index) => (
                <motion.div
                  key={index}
                  className="flex items-center justify-between p-2 bg-blue-50 rounded border border-blue-200"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div className="flex items-center space-x-2">
                    <DocumentTextIcon className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-gray-900">{file.name}</span>
                  </div>
                  <button
                    onClick={() => removeMedicalFile(index)}
                    className="text-gray-400 hover:text-danger-600 transition-colors"
                  >
                    ×
                  </button>
                </motion.div>
              ))}
            </div>
          )}

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

      {/* Start Analysis Button */}
      <div className="text-center">
        <button
          onClick={startFraudAnalysis}
          disabled={isAnalyzing || !billDocumentId || medicalDocumentIds.length === 0}
          className="btn-primary px-8 py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-3 mx-auto"
        >
          <ShieldExclamationIcon className="w-6 h-6" />
          <span>{isAnalyzing ? 'Analyzing for Fraud...' : 'Start Fraud Analysis'}</span>
        </button>
      </div>

      {/* Analysis Progress */}
      {isAnalyzing && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-danger-600"></div>
            <h3 className="text-lg font-semibold text-gray-900">Analyzing for Fraud & Revenue Leakage...</h3>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Analysis Progress</span>
            <span className="text-sm text-gray-500">{Math.round(analysisProgress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div 
              className="bg-danger-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${analysisProgress}%` }}
            />
          </div>
          <p className="text-gray-600">
            Comparing bill items against medical records to identify discrepancies and potential fraud indicators.
          </p>
        </div>
      )}

      {/* Fraud Analysis Results */}
      {fraudAnalysisResult && (
        <div className="space-y-6">
          {/* Risk Score Summary */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Fraud Risk Assessment</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={`p-4 rounded-lg border ${getRiskColor(fraudAnalysisResult.fraudRiskScore || 0)}`}>
                <div className="text-center">
                  <div className="text-3xl font-bold mb-2">{fraudAnalysisResult.fraudRiskScore || 0}%</div>
                  <div className="font-medium">{getRiskLevel(fraudAnalysisResult.fraudRiskScore || 0)}</div>
                </div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 mb-2">
                    {fraudAnalysisResult.revenueImpactAnalysis?.potentialRevenueLeakage?.estimatedAmount || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-600">Potential Revenue Leakage</div>
                </div>
              </div>
              <div className="bg-primary-50 p-4 rounded-lg border border-primary-200">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary-600 mb-2">
                    {fraudAnalysisResult.billVsMedicalMismatches?.proceduresBilledButNotDocumented?.length || 0}
                  </div>
                  <div className="text-sm text-gray-600">Phantom Billing Items</div>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Findings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Revenue Leakage */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                <CurrencyDollarIcon className="w-5 h-5 mr-2 text-blue-600" />
                Revenue Leakage
              </h4>
              
              <div className="space-y-4">
                <div>
                  <h5 className="font-medium text-gray-800 mb-2">Unbilled Services</h5>
                  <ul className="space-y-1">
                    {(fraudAnalysisResult.billVsMedicalMismatches?.servicesDocumentedButNotBilled || []).map((service: string, index: number) => (
                      <li key={index} className="text-sm text-gray-600 flex items-center">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mr-2"></div>
                        {service}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h5 className="font-medium text-gray-800 mb-2">Unbilled Medications</h5>
                  <ul className="space-y-1">
                    {(fraudAnalysisResult.billVsMedicalMismatches?.medicationsInMedicalRecordsButNotBilled || []).map((med: string, index: number) => (
                      <li key={index} className="text-sm text-gray-600 flex items-center">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mr-2"></div>
                        {med}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Fraud Indicators */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                <ExclamationTriangleIcon className="w-5 h-5 mr-2 text-danger-600" />
                Fraud Indicators
              </h4>
              
              <div className="space-y-4">
                <div>
                  <h5 className="font-medium text-gray-800 mb-2">Phantom Billing</h5>
                  <ul className="space-y-1">
                    {(fraudAnalysisResult.revenueImpactAnalysis?.potentialFraudIndicators?.phantomBilling || []).map((item: string, index: number) => (
                      <li key={index} className="text-sm text-gray-600 flex items-center">
                        <div className="w-2 h-2 bg-danger-600 rounded-full mr-2"></div>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h5 className="font-medium text-gray-800 mb-2">Billed But Not Documented</h5>
                  <ul className="space-y-1">
                    {(fraudAnalysisResult.billVsMedicalMismatches?.medicationsBilledButNotInMedicalRecords || []).map((med: string, index: number) => (
                      <li key={index} className="text-sm text-gray-600 flex items-center">
                        <div className="w-2 h-2 bg-danger-600 rounded-full mr-2"></div>
                        {med}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Recommendations</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h5 className="font-medium text-danger-800 mb-3">Immediate Actions</h5>
                <ul className="space-y-2">
                  {(fraudAnalysisResult.recommendations?.immediate || []).map((rec: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start">
                      <div className="w-2 h-2 bg-danger-600 rounded-full mr-2 mt-1.5 flex-shrink-0"></div>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h5 className="font-medium text-blue-800 mb-3">Revenue Recovery</h5>
                <ul className="space-y-2">
                  {(fraudAnalysisResult.recommendations?.revenueRecovery || []).map((rec: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start">
                      <div className="w-2 h-2 bg-blue-600 rounded-full mr-2 mt-1.5 flex-shrink-0"></div>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h5 className="font-medium text-blue-800 mb-3">Prevention</h5>
                <ul className="space-y-2">
                  {(fraudAnalysisResult.recommendations?.fraudPrevention || []).map((rec: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start">
                      <div className="w-2 h-2 bg-blue-600 rounded-full mr-2 mt-1.5 flex-shrink-0"></div>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
