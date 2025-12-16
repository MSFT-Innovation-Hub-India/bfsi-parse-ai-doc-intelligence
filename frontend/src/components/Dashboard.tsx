'use client';

import React from 'react';
import { 
  DocumentTextIcon,
  DocumentMagnifyingGlassIcon,
  HeartIcon,
  ShieldExclamationIcon,
  CurrencyDollarIcon,
  UserCircleIcon,
  DocumentIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  ScaleIcon,
  AcademicCapIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div className="space-y-6">
      {/* Hero Section with Blue Gradient */}
      <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]"></div>
        <div className="relative p-8">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-14 h-14 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/20">
                  <SparklesIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-white">Welcome to ParseAI</h1>
                  <p className="text-blue-100 text-base mt-1">Enterprise Document Intelligence Platform</p>
                </div>
              </div>
              <p className="text-white/90 text-lg max-w-3xl leading-relaxed">
                Transform your document processing with AI-powered analysis across Medical, Financial, Legal, and Educational documents
              </p>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => onNavigate('general')}
                  className="px-6 py-3 bg-white text-blue-700 rounded-lg font-semibold hover:bg-blue-50 transition-all duration-200 shadow-lg hover:shadow-xl text-base"
                >
                  Start Analysis
                </button>
                <button
                  onClick={() => onNavigate('custom-analyzer')}
                  className="px-6 py-3 bg-white/10 backdrop-blur-sm text-white rounded-lg font-semibold hover:bg-white/20 transition-all duration-200 border border-white/20 text-base"
                >
                  Custom Analyzer
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Medical Documents</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">5</p>
              <p className="text-xs text-gray-500 mt-2">Analysis Types Available</p>
            </div>
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
              <HeartIcon className="w-8 h-8 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Financial Documents</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">4</p>
              <p className="text-xs text-gray-500 mt-2">Analysis Types Available</p>
            </div>
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
              <BanknotesIcon className="w-8 h-8 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Legal Documents</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">4</p>
              <p className="text-xs text-gray-500 mt-2">Analysis Types Available</p>
            </div>
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
              <ScaleIcon className="w-8 h-8 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Educational Documents</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">2</p>
              <p className="text-xs text-gray-500 mt-2">Analysis Types Available</p>
            </div>
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
              <AcademicCapIcon className="w-8 h-8 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Featured Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <button
          onClick={() => onNavigate('customer')}
          className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-7 text-left hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-2xl group"
        >
          <UserCircleIcon className="w-12 h-12 text-white mb-4" />
          <h3 className="text-2xl font-bold text-white mb-3">Customer Analysis</h3>
          <p className="text-blue-100 text-base leading-relaxed">
            Fetch and analyze customer documents directly from Azure storage with advanced AI insights
          </p>
          <div className="mt-5 flex items-center text-white font-semibold text-base group-hover:translate-x-1 transition-transform">
            Get Started <ArrowTrendingUpIcon className="w-5 h-5 ml-2" />
          </div>
        </button>

        <button
          onClick={() => onNavigate('general')}
          className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-7 text-left hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg hover:shadow-2xl group"
        >
          <DocumentIcon className="w-12 h-12 text-white mb-4" />
          <h3 className="text-2xl font-bold text-white mb-3">General Analysis</h3>
          <p className="text-blue-100 text-base leading-relaxed">
            Universal document analyzer supporting any document type with intelligent content extraction
          </p>
          <div className="mt-5 flex items-center text-white font-semibold text-base group-hover:translate-x-1 transition-transform">
            Analyze Now <ArrowTrendingUpIcon className="w-5 h-5 ml-2" />
          </div>
        </button>

        <button
          onClick={() => onNavigate('custom-analyzer')}
          className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-7 text-left hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-2xl group"
        >
          <Cog6ToothIcon className="w-12 h-12 text-white mb-4" />
          <h3 className="text-2xl font-bold text-white mb-3">Custom Analyzer</h3>
          <p className="text-blue-100 text-base leading-relaxed">
            Build custom analysis workflows with your own instructions and parameters
          </p>
          <div className="mt-5 flex items-center text-white font-semibold text-base group-hover:translate-x-1 transition-transform">
            Customize <ArrowTrendingUpIcon className="w-5 h-5 ml-2" />
          </div>
        </button>
      </div>

      {/* Medical Documents Section */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-7">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <HeartIcon className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Medical Documents</h2>
              <p className="text-sm text-gray-500 mt-0.5">Healthcare and medical record analysis</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full">5 Types</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          
          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('medical-single')}
          >
            <DocumentMagnifyingGlassIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Single Document</h3>
            <p className="text-xs text-gray-600">
              Analyze individual medical records
            </p>
          </button>

          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('medical-comprehensive')}
          >
            <DocumentTextIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Comprehensive Analysis</h3>
            <p className="text-xs text-gray-600">
              Multiple documents insights
            </p>
          </button>

          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('medical-fraud')}
          >
            <ShieldExclamationIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Fraud Detection</h3>
            <p className="text-xs text-gray-600">
              Identify fraudulent claims
            </p>
          </button>

          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('medical-revenue')}
          >
            <CurrencyDollarIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Revenue Leakage</h3>
            <p className="text-xs text-gray-600">
              Recover unbilled services
            </p>
          </button>

          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('xray-analysis')}
          >
            <DocumentMagnifyingGlassIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">X-ray Analysis</h3>
            <p className="text-xs text-gray-600">
              AI-powered radiology reports
            </p>
          </button>
        </div>
      </div>

      {/* Financial Documents Section */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-7">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <BanknotesIcon className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Financial Documents</h2>
              <p className="text-sm text-gray-500 mt-0.5">Invoices, receipts, and financial statements</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full">4 Types</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('finance-invoice')}
          >
            <DocumentTextIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Invoice Analysis</h3>
            <p className="text-xs text-gray-600">
              Extract invoice data and validate
            </p>
          </button>

          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('finance-receipt')}
          >
            <DocumentMagnifyingGlassIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Receipt Processing</h3>
            <p className="text-xs text-gray-600">
              Categorize and process receipts
            </p>
          </button>

          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('finance-statement')}
          >
            <DocumentTextIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Bank Statement</h3>
            <p className="text-xs text-gray-600">
              Analyze transactions and patterns
            </p>
          </button>

          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('finance-tax')}
          >
            <DocumentIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Tax Documents</h3>
            <p className="text-xs text-gray-600">
              Process tax forms
            </p>
          </button>
        </div>
      </div>

      {/* Legal Documents Section */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-7">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <ScaleIcon className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Legal Documents</h2>
              <p className="text-sm text-gray-500 mt-0.5">Contracts, agreements, and legal records</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full">4 Types</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('legal-contract')}
          >
            <DocumentTextIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Agreement/Contract</h3>
            <p className="text-xs text-gray-600">
              Review contracts and agreements
            </p>
          </button>

          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('legal-property')}
          >
            <DocumentIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Property Registration</h3>
            <p className="text-xs text-gray-600">
              Analyze property registration documents
            </p>
          </button>

          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('legal-affidavit')}
          >
            <DocumentMagnifyingGlassIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Affidavit Analysis</h3>
            <p className="text-xs text-gray-600">
              Analyze affidavits and sworn statements
            </p>
          </button>

          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('legal-compliance')}
          >
            <ShieldExclamationIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Compliance Check</h3>
            <p className="text-xs text-gray-600">
              Verify legal compliance
            </p>
          </button>
        </div>
      </div>

      {/* Educational Documents Section */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-7">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <AcademicCapIcon className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Educational Documents</h2>
              <p className="text-sm text-gray-500 mt-0.5">Transcripts and certificates</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full">2 Types</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('edu-transcript')}
          >
            <DocumentTextIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Transcript Analysis</h3>
            <p className="text-xs text-gray-600">
              Analyze academic transcripts
            </p>
          </button>

          <button
            className="p-5 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-400 hover:bg-blue-100 transition-all duration-200 text-left group"
            onClick={() => onNavigate('edu-certificate')}
          >
            <DocumentIcon className="w-7 h-7 text-blue-600 group-hover:text-blue-700 mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Certificate Verification</h3>
            <p className="text-xs text-gray-600">
              Verify educational certificates
            </p>
          </button>
        </div>
      </div>

      {/* Platform Features */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-7">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Platform Features</h2>
            <p className="text-sm text-gray-500 mt-1">Enterprise-grade capabilities powered by AI</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div className="border-2 border-gray-200 rounded-xl p-6 hover:border-blue-400 hover:shadow-lg transition-all">
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <ClockIcon className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2 text-lg">Real-time Processing</h3>
            <p className="text-sm text-gray-600 leading-relaxed">Get instant results with lightning-fast document analysis</p>
          </div>
          <div className="border-2 border-gray-200 rounded-xl p-6 hover:border-blue-400 hover:shadow-lg transition-all">
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <Cog6ToothIcon className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2 text-lg">Custom Workflows</h3>
            <p className="text-sm text-gray-600 leading-relaxed">Build tailored analysis pipelines for your specific needs</p>
          </div>
          <div className="border-2 border-gray-200 rounded-xl p-6 hover:border-blue-400 hover:shadow-lg transition-all">
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <DocumentTextIcon className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2 text-lg">Multi-Format Support</h3>
            <p className="text-sm text-gray-600 leading-relaxed">Process PDF, images, and various document formats seamlessly</p>
          </div>
        </div>
      </div>

      {/* System Status & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-bold text-gray-900">System Status</h3>
            <span className="flex items-center text-xs font-semibold text-green-600">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
              All Systems Online
            </span>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <SparklesIcon className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm font-medium text-gray-700">AI Engine</span>
              </div>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">Active</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <DocumentIcon className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm font-medium text-gray-700">Processing</span>
              </div>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">Ready</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <ShieldExclamationIcon className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm font-medium text-gray-700">Security</span>
              </div>
              <span className="text-xs font-semibold text-green-600 bg-green-50 px-3 py-1.5 rounded-full">Protected</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-bold text-gray-900">Recent Activity</h3>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-semibold">View All</button>
          </div>
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <DocumentTextIcon className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">No Recent Activity</h3>
            <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">Start analyzing documents to see your activity and history here</p>
            <button
              onClick={() => onNavigate('general')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
            >
              Upload Document
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}