import React from 'react';
import { ThinkingStep } from '../types';

interface ThinkingStepsProps {
  steps?: ThinkingStep[];
  isStreaming?: boolean;
  hasContent?: boolean;
}

export const ThinkingSteps: React.FC<ThinkingStepsProps> = ({
  steps = [],
  isStreaming = false,
  hasContent = false,
}) => {
  if (!steps || steps.length === 0) return null;

  const renderIcon = (type: ThinkingStep['icon']) => {
    switch (type) {
      case 'github':
        return (
          <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
            <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </div>
        );

      case 'lightning':
        return (
          <div className="w-3.5 h-3.5 shrink-0 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-2xs">
            <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
        );

      case 'search':
        return (
          <div className="w-3.5 h-3.5 shrink-0 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center">
            <svg className="w-2.5 h-2.5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
        );

      case 'code':
        return (
          <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
            <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </div>
        );

      case 'brain':
        return (
          <div className="w-3.5 h-3.5 shrink-0 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <svg className="w-2.5 h-2.5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
              <path d="M12 2a4 4 0 0 0-4 4v1a4 4 0 0 0-4 4v1a4 4 0 0 0 4 4v1a4 4 0 0 0 4 4 4 4 0 0 0 4-4v-1a4 4 0 0 0 4-4v-1a4 4 0 0 0-4-4V6a4 4 0 0 0-4-4z" />
            </svg>
          </div>
        );

      default:
        return (
          <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
            <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </div>
        );
    }
  };

  return (
    <div className={`my-1 select-none animate-in fade-in duration-200 ${hasContent ? 'mb-2' : ''}`}>
      <div className="thinking-steps-card inline-flex flex-col gap-1 px-2.5 py-1.5 rounded-xl bg-neutral-100/90 dark:bg-neutral-850/70 border border-neutral-200/80 dark:border-neutral-800/80 text-[11.5px] leading-snug text-neutral-600 dark:text-neutral-400 max-w-full font-sans shadow-2xs">
        {steps.map((step, idx) => {
          const isRunning = step.status === 'running';
          return (
            <div
              key={step.id || idx}
              className="flex items-center gap-1.5 min-w-0"
            >
              {renderIcon(step.icon || 'github')}
              <span
                className={`truncate ${
                  isRunning
                    ? 'text-neutral-900 dark:text-neutral-200 font-medium'
                    : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                {step.title}
              </span>
              {isRunning && isStreaming && (
                <span className="flex items-center gap-1 shrink-0 ml-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
