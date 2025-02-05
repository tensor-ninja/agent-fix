import React, { useEffect, useState } from "react";

const steps = [
  "downloading repository",
  "downloading issues",
  "preparing chunks",
  "indexing files",
  "creating embeddings",
  "storing embeddings",
];

interface LoadingIndicatorProps {
  currentStep: number;
  isComplete: boolean;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ currentStep: initialStep, isComplete }) => {
  const [displayedStep, setDisplayedStep] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayedStep(prev => {
        if (prev < initialStep) {
          return prev + 1;
        }
        return prev;
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [displayedStep, initialStep]);

  return (
    <div className="flex flex-col space-y-4 my-6">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center space-x-3">
          {index < displayedStep ? (
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          ) : index === displayedStep ? (
            <div className="w-6 h-6 relative">
              <div className="absolute inset-0 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full border-2 border-gray-300"></div>
          )}
          <span className={`text-sm ${index <= displayedStep ? "text-foreground" : "text-gray-400"}`}>
            {step}
          </span>
        </div>
      ))}
      
      {isComplete && (
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <span>Files ready for Agents!</span>
        </div>
      )}
    </div>
  );
};

export default LoadingIndicator; 