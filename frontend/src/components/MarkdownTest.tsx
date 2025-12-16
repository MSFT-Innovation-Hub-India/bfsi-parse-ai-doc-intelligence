'use client';

import React from 'react';

// Simple test without ReactMarkdown first
const testMarkdown = `### Comprehensive Medical Analysis Report

This is a **bold** test with some *italic* text.

- Item 1
- Item 2  
- Item 3

This should show markdown as plain text first.`;

export default function MarkdownTest() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-red-600">Markdown Test Page - DEBUG</h1>
      
      <div className="space-y-6">
        <div className="bg-yellow-100 border-2 border-yellow-400 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">1. Raw Markdown Text (should be plain):</h2>
          <pre className="text-sm bg-white p-3 rounded border overflow-x-auto whitespace-pre-wrap">
            {testMarkdown}
          </pre>
        </div>

        <div className="bg-blue-100 border-2 border-blue-400 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">2. Basic HTML rendering test:</h2>
          <div className="bg-white p-4 rounded border">
            <h3 className="text-lg font-bold">Test Heading</h3>
            <p className="mb-2">This is a <strong>bold</strong> test with <em>italic</em> text.</p>
            <ul className="list-disc ml-6">
              <li>Item 1</li>
              <li>Item 2</li>
              <li>Item 3</li>
            </ul>
          </div>
        </div>

        <div className="bg-green-100 border-2 border-green-400 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">3. Tailwind Classes Test:</h2>
          <div className="prose prose-sm max-w-none">
            <h3>Prose Heading</h3>
            <p>This should have prose styling if Tailwind typography is working.</p>
            <ul>
              <li>Prose list item 1</li>
              <li>Prose list item 2</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
