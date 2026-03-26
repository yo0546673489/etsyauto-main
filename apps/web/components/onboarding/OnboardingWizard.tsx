'use client';

import { useState, useMemo } from 'react';
import { CheckCircleIcon, XCircleIcon, ArrowRightIcon, ArrowLeftIcon } from '@heroicons/react/24/solid';
import { useAuth } from '@/lib/auth-context';

interface Step {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'current' | 'upcoming' | 'error';
  component: React.ReactNode;
}

interface OnboardingWizardProps {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [stepData, setStepData] = useState<Record<string, any>>({});

  // Build steps array based on user role
  const allSteps = useMemo(() => {
    const baseSteps: Step[] = [];
    
    // Only show Connect Shop for owner, admin (skip for supplier, viewer)
    if (user?.role && ['owner', 'admin'].includes(user.role.toLowerCase())) {
      baseSteps.push({
        id: 'connect-shop',
        title: 'Connect Etsy Shop',
        description: 'Link your Etsy shop to start automating',
        status: 'upcoming',
        component: <ConnectShopStep onNext={handleNext} />
      });
    }
    
    return baseSteps.concat([
      {
        id: 'ingest-products',
        title: 'Import Products',
        description: 'Upload your product catalog via CSV',
        status: 'upcoming',
        component: <IngestProductsStep onNext={handleNext} onBack={handleBack} />
      },
      {
        id: 'complete',
        title: 'All Set!',
        description: 'Your automation is ready',
        status: 'upcoming',
        component: <CompleteStep onFinish={onComplete} />
      }
    ]);
  }, [user?.role]);

  // Update step statuses based on currentStep
  const steps: Step[] = useMemo(() => 
    allSteps.map((step, index) => ({
      ...step,
      status: index === currentStep ? 'current' : index < currentStep ? 'completed' : 'upcoming'
    })),
    [allSteps, currentStep]
  );

  function handleNext(data?: any) {
    if (data) {
      setStepData({ ...stepData, [steps[currentStep].id]: data });
    }
    setCurrentStep(Math.min(currentStep + 1, steps.length - 1));
  }

  function handleBack() {
    setCurrentStep(Math.max(currentStep - 1, 0));
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-5xl mx-auto px-4">
        {/* Progress Steps */}
        <nav aria-label="Progress" className="mb-12">
          <ol className="flex items-center">
            {steps.map((step, index) => (
              <li key={step.id} className={`relative ${index !== steps.length - 1 ? 'pr-8 sm:pr-20 flex-1' : ''}`}>
                <div className="flex items-center">
                  <div className="relative flex items-center justify-center">
                    {step.status === 'completed' ? (
                      <CheckCircleIcon className="h-10 w-10 text-green-600" />
                    ) : step.status === 'current' ? (
                      <div className="h-10 w-10 rounded-full border-4 border-blue-600 bg-white flex items-center justify-center">
                        <span className="text-blue-600 font-semibold">{index + 1}</span>
                      </div>
                    ) : step.status === 'error' ? (
                      <XCircleIcon className="h-10 w-10 text-red-600" />
                    ) : (
                      <div className="h-10 w-10 rounded-full border-2 border-gray-300 bg-white flex items-center justify-center">
                        <span className="text-gray-500">{index + 1}</span>
                      </div>
                    )}
                  </div>
                  {index !== steps.length - 1 && (
                    <div className={`absolute top-5 w-full h-0.5 ${
                      step.status === 'completed' ? 'bg-green-600' : 'bg-gray-300'
                    }`} style={{ left: 'calc(50% + 20px)' }} />
                  )}
                </div>
                <div className="mt-2 text-center">
                  <p className={`text-sm font-medium ${
                    step.status === 'current' ? 'text-blue-600' : 
                    step.status === 'completed' ? 'text-green-600' : 
                    'text-gray-500'
                  }`}>
                    {step.title}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </nav>

        {/* Current Step Content */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">{steps[currentStep].title}</h2>
            <p className="mt-2 text-gray-600">{steps[currentStep].description}</p>
          </div>
          
          {steps[currentStep].component}
        </div>
      </div>
    </div>
  );
}

// Step Components
function ConnectShopStep({ onNext }: { onNext: (data?: any) => void }) {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    try {
      // Redirect to OAuth
      window.location.href = '/api/oauth/start';
    } catch (error) {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="text-center py-12">
        <div className="mx-auto w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-6">
          <svg className="w-12 h-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold mb-4">Connect Your Etsy Shop</h3>
        <p className="text-gray-600 mb-8 max-w-md mx-auto">
          We'll need permission to manage your Etsy listings. This is a secure OAuth connection.
        </p>
        <button
          onClick={handleConnect}
          disabled={loading}
          className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Connect to Etsy'}
        </button>
      </div>
    </div>
  );
}

function IngestProductsStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/ingestion/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (response.ok) {
        onNext();
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="text-center py-8">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Product CSV
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
          <h4 className="font-semibold text-blue-900 mb-2">CSV Format:</h4>
          <code className="text-sm text-blue-800">
            sku,title,description,price,quantity
          </code>
        </div>

        <div className="flex justify-between mt-8">
          <button
            onClick={onBack}
            className="flex items-center px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex items-center bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload & Continue'}
            <ArrowRightIcon className="w-4 h-4 ml-2" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateScheduleStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <div className="text-center py-8">
      <h3 className="text-xl font-semibold mb-4">Setup Publishing Schedule</h3>
      <p className="text-gray-600 mb-8">Configure when and how often to publish listings</p>

      <div className="max-w-md mx-auto text-left space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Schedule Name</label>
          <input type="text" className="w-full border border-gray-300 rounded-lg px-4 py-2" placeholder="Daily Publishing" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Publish Time</label>
          <input type="time" className="w-full border border-gray-300 rounded-lg px-4 py-2" defaultValue="09:00" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Daily Quota</label>
          <input type="number" className="w-full border border-gray-300 rounded-lg px-4 py-2" defaultValue="150" />
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="flex items-center px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Back
        </button>
        <button onClick={onNext} className="flex items-center bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
          Create & Continue
          <ArrowRightIcon className="w-4 h-4 ml-2" />
        </button>
      </div>
    </div>
  );
}

function PublishStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [publishing, setPublishing] = useState(false);

  const handlePublish = () => {
    setPublishing(true);
    setTimeout(() => {
      setPublishing(false);
      onNext();
    }, 2000);
  };

  return (
    <div className="text-center py-8">
      <h3 className="text-xl font-semibold mb-4">Publish Your First Listing</h3>
      <p className="text-gray-600 mb-8">Ready to go live on Etsy?</p>

      <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
        <p className="text-green-800">
          ✓ Shop connected<br />
          ✓ Products imported<br />
          ✓ Schedule configured
        </p>
      </div>

      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="flex items-center px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Back
        </button>
        <button
          onClick={handlePublish}
          disabled={publishing}
          className="flex items-center bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {publishing ? 'Publishing...' : 'Publish to Etsy'}
          <ArrowRightIcon className="w-4 h-4 ml-2" />
        </button>
      </div>
    </div>
  );
}

function CompleteStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="text-center py-12">
      <div className="mx-auto w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <CheckCircleIcon className="w-16 h-16 text-green-600" />
      </div>
      <h3 className="text-2xl font-bold mb-4">You're All Set!</h3>
      <p className="text-gray-600 mb-8 max-w-md mx-auto">
        Your Etsy automation is now configured and running. You can monitor progress from your dashboard.
      </p>
      <button
        onClick={onFinish}
        className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition"
      >
        Go to Dashboard
      </button>
    </div>
  );
}

