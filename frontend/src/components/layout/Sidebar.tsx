'use client';

import React, { useState } from 'react';

import { 
  HomeIcon,
  DocumentTextIcon,
  DocumentMagnifyingGlassIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  HeartIcon,
  ShieldExclamationIcon,
  CurrencyDollarIcon,
  UserCircleIcon,
  DocumentIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  BanknotesIcon,
  ScaleIcon,
  AcademicCapIcon,
  IdentificationIcon,
  DocumentChartBarIcon
} from '@heroicons/react/24/outline';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

interface NavigationSection {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavigationItem[];
}

interface NavigationItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  id: string;
  description?: string;
}

const navigationSections: NavigationSection[] = [
  {
    title: 'General',
    icon: HomeIcon,
    items: [
      { name: 'Dashboard', icon: HomeIcon, id: 'dashboard' },
      { name: 'Customer Analysis', icon: UserCircleIcon, id: 'customer' },
      { name: 'General Document Analysis', icon: DocumentIcon, id: 'general' },
      { name: 'Custom Analyzer', icon: Cog6ToothIcon, id: 'custom-analyzer', description: 'Create your own analyzer with custom instructions' },
    ]
  },
  {
    title: 'Medical Documents',
    icon: HeartIcon,
    items: [
      { name: 'Single Document Analysis', icon: DocumentMagnifyingGlassIcon, id: 'medical-single', description: 'Analyze individual medical documents' },
      { name: 'Comprehensive Analysis', icon: DocumentTextIcon, id: 'medical-comprehensive', description: 'Analyze multiple medical documents together' },
      { name: 'Fraud Detection', icon: ShieldExclamationIcon, id: 'medical-fraud', description: 'Detect fraudulent medical claims' },
      { name: 'Revenue Leakage', icon: CurrencyDollarIcon, id: 'medical-revenue', description: 'Identify unbilled services' },
      { name: 'X-ray Analysis', icon: DocumentMagnifyingGlassIcon, id: 'xray-analysis', description: 'AI-powered radiology reports' },
    ]
  },
  {
    title: 'Financial Documents',
    icon: BanknotesIcon,
    items: [
      { name: 'Invoice Analysis', icon: DocumentTextIcon, id: 'finance-invoice', description: 'Extract and validate invoice data' },
      { name: 'Receipt Processing', icon: DocumentMagnifyingGlassIcon, id: 'finance-receipt', description: 'Process and categorize receipts' },
      { name: 'Bank Statement Analysis', icon: DocumentChartBarIcon, id: 'finance-statement', description: 'Analyze bank statements and transactions' },
      { name: 'Tax Document Analysis', icon: DocumentIcon, id: 'finance-tax', description: 'Process tax forms and documents' },
    ]
  },
  {
    title: 'Legal Documents',
    icon: ScaleIcon,
    items: [
      { name: 'Agreement/Contract Analysis', icon: DocumentTextIcon, id: 'legal-contract', description: 'Analyze contracts and agreements' },
      { name: 'Property Registration Analysis', icon: DocumentIcon, id: 'legal-property', description: 'Analyze property registration documents' },
      { name: 'Affidavit Analysis', icon: DocumentMagnifyingGlassIcon, id: 'legal-affidavit', description: 'Analyze affidavits and sworn statements' },
      { name: 'Compliance Check', icon: ShieldExclamationIcon, id: 'legal-compliance', description: 'Check legal compliance' },
    ]
  },
  {
    title: 'Educational Documents',
    icon: AcademicCapIcon,
    items: [
      { name: 'Transcript Analysis', icon: DocumentTextIcon, id: 'edu-transcript', description: 'Analyze academic transcripts' },
      { name: 'Certificate Verification', icon: IdentificationIcon, id: 'edu-certificate', description: 'Verify educational certificates' },
    ]
  },
  {
    title: 'Fraud Detection',
    icon: ShieldExclamationIcon,
    items: [
      { name: 'Document Tampering Detection', icon: ShieldExclamationIcon, id: 'fraud-tampering', description: 'Detect document forgery and manipulation using forensic analysis' },
      { name: 'Fake Document Detection', icon: ShieldExclamationIcon, id: 'fraud-fake-document', description: 'Detect fraudulent documents, email typos, invalid PANs, and fake domains' },
      { name: 'Co-Document Analysis', icon: DocumentChartBarIcon, id: 'fraud-co-document', description: 'Compare two related documents to detect inconsistencies and fraud' },
      { name: 'Medical Fraud Detection', icon: ShieldExclamationIcon, id: 'medical-fraud', description: 'Detect fraudulent medical claims' },
      { name: 'Revenue Leakage Analysis', icon: CurrencyDollarIcon, id: 'medical-revenue', description: 'Identify unbilled services' },
    ]
  },
];

const Sidebar = ({ activeTab, onTabChange }: SidebarProps) => {
  const [expandedSections, setExpandedSections] = useState<string[]>(['General', 'Medical Documents', 'Fraud Detection']);

  const toggleSection = (sectionTitle: string) => {
    setExpandedSections(prev => 
      prev.includes(sectionTitle) 
        ? prev.filter(s => s !== sectionTitle)
        : [...prev, sectionTitle]
    );
  };

  return (
    <div className="w-72 bg-white shadow-lg border-r border-gray-200 flex flex-col h-full">
      {/* Logo and Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
            <DocumentIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">ParseAI</h1>
            <p className="text-sm text-gray-500">Universal Document Analyzer</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navigationSections.map((section) => {
          const isExpanded = expandedSections.includes(section.title);
          
          return (
            <div key={section.title} className="mb-2">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.title)}
                className="w-full flex items-center space-x-2 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <section.icon className="w-4 h-4 text-gray-500" />
                <span className="flex-1 text-left">{section.title}</span>
                {isExpanded ? (
                  <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {/* Section Items */}
              {isExpanded && (
                <div className="mt-1 ml-4 space-y-1">
                  {section.items.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 ${
                          isActive
                            ? 'bg-primary-50 text-primary-700 border border-primary-200'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} />
                        <span className="text-sm font-medium flex-1">{item.name}</span>
                        {isActive && (
                          <div className="w-2 h-2 bg-primary-600 rounded-full flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Additional Actions */}
        <div className="pt-4 mt-4 border-t border-gray-200">
          <button
            onClick={() => onTabChange('reports')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 ${
              activeTab === 'reports'
                ? 'bg-primary-50 text-primary-700 border border-primary-200'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <ChartBarIcon className={`w-4 h-4 ${activeTab === 'reports' ? 'text-primary-600' : 'text-gray-400'}`} />
            <span className="text-sm font-medium">Reports</span>
          </button>
          
          <button
            onClick={() => onTabChange('settings')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 ${
              activeTab === 'settings'
                ? 'bg-primary-50 text-primary-700 border border-primary-200'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Cog6ToothIcon className={`w-4 h-4 ${activeTab === 'settings' ? 'text-primary-600' : 'text-gray-400'}`} />
            <span className="text-sm font-medium">Settings</span>
          </button>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 text-center">
          <p>Universal Document Processing</p>
          <p>Version 2.0.0</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
