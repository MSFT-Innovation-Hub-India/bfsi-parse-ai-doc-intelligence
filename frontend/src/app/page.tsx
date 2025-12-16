'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Dashboard from '@/components/Dashboard';
import CustomerAnalysis from '@/components/analysis/CustomerAnalysis';
import GeneralAnalysis from '@/components/analysis/GeneralAnalysis';
import SingleDocumentAnalysis from '@/components/analysis/SingleDocumentAnalysis';
import ComprehensiveAnalysis from '@/components/analysis/ComprehensiveAnalysis';
import FraudDetectionAnalysis from '@/components/analysis/FraudDetectionAnalysis';
import RevenueLeakageAnalysis from '@/components/analysis/RevenueLeakageAnalysis';
import XrayAnalysis from '@/components/analysis/XrayAnalysis';
import CustomAnalyzer from '@/components/analysis/CustomAnalyzer';
import TamperingDetection from '@/components/analysis/TamperingDetection';
import FakeDocumentDetection from '@/components/analysis/FakeDocumentDetection';
import CoDocumentAnalysis from '@/components/analysis/CoDocumentAnalysis';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onNavigate={setActiveTab} />;
      case 'customer':
        return <CustomerAnalysis />;
      case 'general':
        return <GeneralAnalysis />;
      case 'custom-analyzer':
        return <CustomAnalyzer />;
      
      // Medical Documents
      case 'medical-single':
        return <SingleDocumentAnalysis />;
      case 'medical-comprehensive':
        return <ComprehensiveAnalysis />;
      case 'medical-fraud':
        return <FraudDetectionAnalysis />;
      case 'medical-revenue':
        return <RevenueLeakageAnalysis />;
      case 'xray-analysis':
        return <XrayAnalysis />;
      
      // Financial Documents
      case 'finance-invoice':
        return <GeneralAnalysis documentType="Invoice" category="Financial" description="Upload invoices to extract vendor details, line items, amounts, tax information, and payment terms. The AI will validate calculations and flag discrepancies." />;
      case 'finance-receipt':
        return <GeneralAnalysis documentType="Receipt" category="Financial" description="Process receipts to extract merchant information, items purchased, amounts, dates, and payment methods. Automatically categorize expenses for accounting." />;
      case 'finance-statement':
        return <GeneralAnalysis documentType="Bank Statement" category="Financial" description="Analyze bank statements to extract transactions, identify patterns, calculate balances, and detect unusual activities or potential fraud." />;
      case 'finance-tax':
        return <GeneralAnalysis documentType="Tax Document" category="Financial" description="Process tax forms (W-2, 1099, returns) to extract income, deductions, credits, and verify calculations for accuracy and completeness." />;
      
      // Legal Documents
      case 'legal-contract':
        return <GeneralAnalysis documentType="Agreement/Contract" category="Legal" description="Analyze contracts and agreements to identify key terms, obligations, deadlines, parties involved, payment terms, and potential risk clauses." />;
      case 'legal-property':
        return <GeneralAnalysis documentType="Property Registration" category="Legal" description="Analyze property registration documents to extract property details, ownership information, registration numbers, dates, and legal descriptions." />;
      case 'legal-affidavit':
        return <GeneralAnalysis documentType="Affidavit" category="Legal" description="Analyze affidavits and sworn statements to extract declarant information, statements of fact, notarization details, and legal attestations." />;
      case 'legal-compliance':
        return <GeneralAnalysis documentType="Compliance Document" category="Legal" description="Review legal documents for compliance with regulations, identify non-compliant clauses, and suggest corrective actions." />;
      
      // Educational Documents
      case 'edu-transcript':
        return <GeneralAnalysis documentType="Transcript" category="Educational" description="Analyze academic transcripts to extract courses, grades, GPA, credits, degrees, and verify academic standing and achievements." />;
      case 'edu-certificate':
        return <GeneralAnalysis documentType="Certificate" category="Educational" description="Verify educational certificates for authenticity, extract institution details, degree information, dates, and honors or distinctions." />;
      
      // Fraud Detection
      case 'fraud-tampering':
        return <TamperingDetection />;
      case 'fraud-fake-document':
        return <FakeDocumentDetection />;
      case 'fraud-co-document':
        return <CoDocumentAnalysis />;
      
      case 'reports':
        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Reports & Analytics</h2>
            <p className="text-gray-600">
              Comprehensive reporting and analytics dashboard will be available here.
            </p>
          </div>
        );
      case 'settings':
        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">System Settings</h2>
            <p className="text-gray-600">
              System configuration and settings will be available here.
            </p>
          </div>
        );
      default:
        return <Dashboard onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
