'use client';

import React, { useState } from 'react';
import { 
  ArrowUpTrayIcon, 
  DocumentIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ChevronDownIcon, 
  ChevronUpIcon, 
  EyeIcon,
  Cog6ToothIcon,
  SparklesIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  filename?: string;
  documentName?: string;
  analysis?: string;
  documentId?: string;
  documentPath?: string;
  analysisTimestamp?: string;
  analysisSuccessful?: boolean;
}

interface AnalysisResult {
  job_id: string;
  status: string;
  results?: DocumentResult[];
  combinedSummary?: string;
  error?: string;
}

interface AnalyzerConfig {
  customInstructions: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  documentType: string;
  outputFormat: string;
}

// Pre-defined analyzer templates
const analyzerTemplates = [
  {
    name: 'Custom Template',
    instructions: 'Provide your own custom instructions here...',
    documentType: 'Any Document'
  },
  {
    name: 'Data Extraction',
    instructions: `Extract all structured data from the document including:
- Key-value pairs
- Tables and lists
- Dates, numbers, and amounts
- Names and entities
- Contact information

Present the data in a clean, organized format.`,
    documentType: 'Forms, Tables'
  },
  {
    name: 'Summary & Key Points',
    instructions: `Provide a comprehensive summary of the document including:
- Main topic and purpose
- Key points and highlights (bullet list)
- Important dates, deadlines, or timelines
- Critical information that requires attention
- Overall conclusion

Keep the summary concise but complete.`,
    documentType: 'Reports, Letters'
  },
  {
    name: 'Compliance & Risk Check',
    instructions: `Analyze the document for compliance and risk factors:
- Identify potential compliance issues
- Flag risky clauses or terms
- Check for missing required elements
- Assess legal or financial risks
- Provide risk rating (Low/Medium/High)
- Recommend mitigation actions`,
    documentType: 'Contracts, Policies'
  },
  {
    name: 'Quality Assessment',
    instructions: `Evaluate the document quality and completeness:
- Assess clarity and readability
- Check for completeness of information
- Identify errors, inconsistencies, or ambiguities
- Verify logical flow and structure
- Rate overall quality (1-10)
- Suggest improvements`,
    documentType: 'Reports, Essays'
  },
  {
    name: 'Comparison & Gap Analysis',
    instructions: `Compare multiple documents and identify:
- Common elements across documents
- Differences and discrepancies
- Missing information in each document
- Contradictions or conflicts
- Gaps that need to be addressed
- Recommendations for alignment`,
    documentType: 'Multiple Documents'
  },
  {
    name: 'Translation & Localization',
    instructions: `Analyze the document for translation and localization:
- Extract all text content
- Identify the source language
- Suggest target languages if needed
- Flag culturally-specific content
- Note formatting or layout considerations
- Provide word/character count`,
    documentType: 'Any Language'
  }
];

export default function CustomAnalyzer() {
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
  const [showConfig, setShowConfig] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(0);

  const [config, setConfig] = useState<AnalyzerConfig>({
    customInstructions: analyzerTemplates[0].instructions,
    modelName: 'gpt-4o',
    temperature: 0.3,
    maxTokens: 4000,
    documentType: 'Any Document',
    outputFormat: 'Markdown'
  });

  const handleTemplateChange = (index: number) => {
    setSelectedTemplate(index);
    setConfig(prev => ({
      ...prev,
      customInstructions: analyzerTemplates[index].instructions,
      documentType: analyzerTemplates[index].documentType
    }));
  };

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
          const docId = response.documentId || response.document_id;
          
          const previewUrl = URL.createObjectURL(file);
          setDocumentPreviewUrls(prev => ({ ...prev, [docId]: previewUrl }));
          
          newFiles.push({
            id: docId,
            name: file.name,
            size: file.size,
            status: 'uploaded',
            file: file
          });
          
          // Store file with both filename and docId for easier retrieval
          setFileMap(prev => {
            const newMap = new Map(prev);
            newMap.set(file.name, file);
            newMap.set(docId, file);
            return newMap;
          });
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

      setUploadedFiles(prev => [...prev, ...newFiles]);
    } catch (err) {
      setError('Failed to upload files. Please try again.');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyze = async () => {
    if (uploadedFiles.filter(f => f.status === 'uploaded').length === 0) {
      setError('Please upload at least one document');
      return;
    }

    if (!config.customInstructions.trim()) {
      setError('Please provide analysis instructions');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setProgress(10);

    try {
      const documentIds = uploadedFiles
        .filter(f => f.status === 'uploaded')
        .map(f => f.id);

      // Start the analysis with custom configuration
      const analysisResponse = await api.startCustomAnalysis({
        document_ids: documentIds,
        custom_instructions: config.customInstructions,
        model_name: config.modelName,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        document_type: config.documentType,
        output_format: config.outputFormat
      });

      const jobId = analysisResponse.jobId;
      setProgress(30);

      // Poll for results
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await api.getAnalysisStatus(jobId);
          setProgress(statusResponse.progress || 50);

          if (statusResponse.status === 'completed') {
            clearInterval(pollInterval);
            const resultResponse = await api.getAnalysisResult(jobId);
            
            const formattedResult = {
              job_id: jobId,
              status: 'completed',
              results: resultResponse.result?.results?.map((doc: any) => ({
                filename: doc.documentName,
                analysis: doc.analysis
              })) || [],
              combinedSummary: resultResponse.result?.combinedSummary
            };

            setAnalysisResult(formattedResult);
            setProgress(100);
            setAnalyzing(false);
          } else if (statusResponse.status === 'failed') {
            clearInterval(pollInterval);
            setError('Analysis failed. Please try again.');
            setAnalyzing(false);
          }
        } catch (err) {
          clearInterval(pollInterval);
          setError('Failed to get analysis status');
          setAnalyzing(false);
        }
      }, 2000);

    } catch (err) {
      setError('Failed to start analysis. Please try again.');
      setAnalyzing(false);
      console.error('Analysis error:', err);
    }
  };

  const toggleDocExpansion = (filename: string) => {
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

  const handleViewDocument = (filename: string, resultData: any) => {
    console.log('🔍 handleViewDocument called with:', filename);
    console.log('� Result data:', resultData);
    console.log('�📁 Available files in fileMap:', Array.from(fileMap.keys()));
    console.log('📂 Uploaded files:', uploadedFiles.map(f => ({ id: f.id, name: f.name })));
    
    // Try multiple lookup strategies
    let file = fileMap.get(filename);
    console.log('🔎 Direct lookup result:', file ? 'Found' : 'Not found');
    
    // Strategy 1: Extract docId from filename (format: uuid_filename.ext)
    if (!file && filename.includes('_')) {
      const docId = filename.split('_')[0];
      console.log('📋 Extracted docId:', docId);
      file = fileMap.get(docId);
      console.log('🔎 Lookup by docId result:', file ? 'Found' : 'Not found');
    }
    
    // Strategy 2: Try to find by matching uploaded files
    if (!file) {
      console.log('🔍 Searching through uploaded files...');
      const uploadedFile = uploadedFiles.find(f => {
        // Match by ID
        if (filename.startsWith(f.id)) return true;
        // Match by name
        if (f.name === filename) return true;
        // Match if filename contains the uploaded filename
        if (filename.includes(f.name)) return true;
        // Match if uploaded filename contains the filename
        if (f.name.includes(filename)) return true;
        return false;
      });
      console.log('📋 Matched uploaded file:', uploadedFile);
      
      if (uploadedFile) {
        file = uploadedFile.file || fileMap.get(uploadedFile.id);
        console.log('📄 File from uploadedFile:', file ? 'Found' : 'Not found');
      }
    }
    
    // Strategy 3: Search all fileMap entries for partial matches
    if (!file) {
      console.log('🔍 Searching all fileMap entries...');
      Array.from(fileMap.entries()).forEach(([key, value]) => {
        if (!file && (key.includes(filename) || filename.includes(key))) {
          file = value;
          console.log('✅ Found file with key:', key);
        }
      });
    }
    
    if (file) {
      console.log('✅ Opening document viewer with file:', file.name);
      
      // Structure the analysis data properly for DocumentViewer
      const structuredAnalysis = {
        medical_analysis: resultData.analysis || resultData,
        analysis_successful: resultData.analysisSuccessful !== false,
        analysis_timestamp: resultData.analysisTimestamp || new Date().toISOString(),
        analysisSuccessful: resultData.analysisSuccessful !== false,
        analysisTimestamp: resultData.analysisTimestamp || new Date().toISOString()
      };
      
      console.log('📋 Structured analysis data:', structuredAnalysis);
      setSelectedDocument({ file, name: filename, analysis: structuredAnalysis });
    } else {
      console.error('❌ Could not find file for:', filename);
      console.error('Available in fileMap:', Array.from(fileMap.keys()));
      console.error('Available in uploadedFiles:', uploadedFiles.map(f => f.name));
      setError(`Could not load document viewer for ${filename}`);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleReset = () => {
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
    setShowConfig(true);
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
    if (lowerType.includes('financial') || lowerType.includes('invoice') || lowerType.includes('receipt')) return 'financial';
    if (lowerType.includes('legal') || lowerType.includes('contract') || lowerType.includes('property')) return 'legal';
    if (lowerType.includes('educational') || lowerType.includes('transcript') || lowerType.includes('certificate')) return 'educational';
    return 'general';
  };

  const handleSamplesLoaded = async (documentIds: string[], _filenameMap?: Record<string, string>) => {
    const newFiles: UploadedFile[] = [];
    
    for (const docId of documentIds) {
      try {
        const response = await fetch(`${API_BASE_URL}/documents/${docId}/view`);
        const blob = await response.blob();
        const fileName = `document_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.pdf`;
        const file = new File([blob], fileName, { type: blob.type });
        
        const previewUrl = URL.createObjectURL(blob);
        setDocumentPreviewUrls(prev => ({ ...prev, [docId]: previewUrl }));
        
        newFiles.push({
          id: docId,
          name: fileName,
          size: blob.size,
          status: 'uploaded',
          file: file
        });
        
        // Store file with both filename and docId
        setFileMap(prev => {
          const newMap = new Map(prev);
          newMap.set(fileName, file);
          newMap.set(docId, file);
          return newMap;
        });
      } catch (error) {
        console.error(`Error loading sample ${docId}:`, error);
      }
    }
    
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center space-x-3 mb-2">
          <Cog6ToothIcon className="w-8 h-8 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Custom Document Analyzer</h1>
        </div>
        <p className="text-gray-600">
          Create your own document analyzer with custom instructions, model selection, and analysis parameters
        </p>
      </div>

      {!analysisResult && (
        <>
          {/* Configuration Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <AdjustmentsHorizontalIcon className="w-5 h-5 text-primary-600" />
                <h2 className="text-lg font-semibold text-gray-900">Analyzer Configuration</h2>
              </div>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center space-x-1"
              >
                <span>{showConfig ? 'Hide' : 'Show'} Configuration</span>
                {showConfig ? (
                  <ChevronUpIcon className="w-4 h-4" />
                ) : (
                  <ChevronDownIcon className="w-4 h-4" />
                )}
              </button>
            </div>

            {showConfig && (
              <div className="space-y-6">
                {/* Template Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <SparklesIcon className="w-4 h-4 inline mr-1" />
                    Analysis Template
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => handleTemplateChange(parseInt(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    {analyzerTemplates.map((template, index) => (
                      <option key={index} value={index}>
                        {template.name} - {template.documentType}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Select a pre-defined template or create your own custom analyzer
                  </p>
                </div>

                {/* Custom Instructions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Custom Analysis Instructions
                  </label>
                  <textarea
                    value={config.customInstructions}
                    onChange={(e) => setConfig({ ...config, customInstructions: e.target.value })}
                    rows={8}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                    placeholder="Describe what you want to extract or analyze from the documents..."
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Provide detailed instructions for what you want to analyze or extract from your documents
                  </p>
                </div>

                {/* Advanced Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Model Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      AI Model
                    </label>
                    <select
                      value={config.modelName}
                      onChange={(e) => setConfig({ ...config, modelName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="gpt-4o">GPT-4o (Recommended)</option>
                      <option value="gpt-4.1">GPT-4.1</option>
                      <option value="gpt-4o-mini">GPT-4o Mini (Faster)</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo</option>
                      <option value="gpt-4">GPT-4</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </select>
                  </div>

                  {/* Document Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Document Type
                    </label>
                    <input
                      type="text"
                      value={config.documentType}
                      onChange={(e) => setConfig({ ...config, documentType: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="e.g., Invoice, Contract, Report"
                    />
                  </div>

                  {/* Temperature */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Temperature: {config.temperature}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={config.temperature}
                      onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>Precise (0.0)</span>
                      <span>Creative (1.0)</span>
                    </div>
                  </div>

                  {/* Max Tokens */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max Output Tokens
                    </label>
                    <input
                      type="number"
                      value={config.maxTokens}
                      onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })}
                      min="500"
                      max="16000"
                      step="500"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  {/* Output Format */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Output Format
                    </label>
                    <select
                      value={config.outputFormat}
                      onChange={(e) => setConfig({ ...config, outputFormat: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="Markdown">Markdown (Formatted)</option>
                      <option value="JSON">JSON (Structured Data)</option>
                      <option value="Plain Text">Plain Text</option>
                      <option value="Bullet Points">Bullet Points</option>
                      <option value="Table">Table Format</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upload Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Upload Documents</h2>
              <SampleDocumentsButton
                category={getCategoryFromDocumentType(config.documentType)}
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
              </div>
            )}

            <div className="mt-6 flex space-x-4">
              <button
                onClick={handleAnalyze}
                disabled={uploading || analyzing || uploadedFiles.filter(f => f.status === 'uploaded').length === 0}
                className="flex-1 bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center space-x-2"
              >
                {analyzing ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Analyzing... {progress}%</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-5 h-5" />
                    <span>Analyze Documents</span>
                  </>
                )}
              </button>
              
              {uploadedFiles.length > 0 && (
                <button
                  onClick={handleReset}
                  disabled={analyzing}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Results Section */}
      {analysisResult && (
        <div className="space-y-6">
          {/* Analysis Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Analysis Complete</h2>
                <p className="text-sm text-gray-600">
                  Using {config.modelName} | Document Type: {config.documentType} | Temperature: {config.temperature}
                </p>
              </div>
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                New Analysis
              </button>
            </div>
          </div>

          {/* Combined Summary */}
          {analysisResult.combinedSummary && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <SparklesIcon className="w-5 h-5 text-primary-600 mr-2" />
                Combined Analysis Summary
              </h3>
              <div className="prose prose-sm max-w-none prose-table:table-auto prose-table:w-full prose-th:bg-gray-100 prose-th:border prose-th:border-gray-300 prose-th:p-2 prose-td:border prose-td:border-gray-300 prose-td:p-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult.combinedSummary}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Individual Document Results */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Individual Document Analysis</h3>
            <div className="space-y-4">
              {analysisResult.results?.map((result, index) => {
                const docName = result.documentName || result.filename || `Document ${index + 1}`;
                const docAnalysis = result.analysis || 'No analysis available';
                return (
                  <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleDocExpansion(docName)}
                      className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <DocumentIcon className="w-5 h-5 text-gray-400" />
                        <span className="font-medium text-gray-900">{docName}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDocument(docName, result);
                          }}
                          className="p-1 hover:bg-white rounded transition-colors cursor-pointer"
                        >
                          <EyeIcon className="w-5 h-5 text-primary-600" />
                        </div>
                        {expandedDocs.has(docName) ? (
                          <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {expandedDocs.has(docName) && (
                      <div className="p-4 bg-white border-t border-gray-200">
                        <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:text-gray-700 prose-strong:text-gray-900 prose-table:table-auto prose-table:w-full prose-table:border-collapse prose-th:bg-blue-50 prose-th:border prose-th:border-gray-300 prose-th:p-3 prose-th:text-left prose-th:font-semibold prose-td:border prose-td:border-gray-300 prose-td:p-3 prose-td:text-gray-700">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{docAnalysis}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {selectedDocument && (
        <DocumentViewer
          documentUrl={URL.createObjectURL(selectedDocument.file)}
          documentName={selectedDocument.name}
          analysisData={selectedDocument.analysis}
          onClose={() => setSelectedDocument(null)}
        />
      )}
    </div>
  );
}
