'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, X, AlertCircle } from 'lucide-react';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  showStrength?: boolean;
  error?: string;
}

interface ValidationRule {
  label: string;
  validator: (password: string) => boolean;
}

const PASSWORD_RULES: ValidationRule[] = [
  {
    label: 'At least 8 characters',
    validator: (p) => p.length >= 8,
  },
  {
    label: 'One uppercase letter (A-Z)',
    validator: (p) => /[A-Z]/.test(p),
  },
  {
    label: 'One lowercase letter (a-z)',
    validator: (p) => /[a-z]/.test(p),
  },
  {
    label: 'At least 2 numbers',
    validator: (p) => (p.match(/\d/g) || []).length >= 2,
  },
  {
    label: 'One special character (!@#$ etc.)',
    validator: (p) => /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/~`]/.test(p),
  },
];

export default function PasswordInput({
  value,
  onChange,
  label = 'Password',
  placeholder = '••••••••••••',
  required = false,
  showStrength = true,
  error,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [strength, setStrength] = useState(0);
  const [strengthLabel, setStrengthLabel] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!value) {
      setStrength(0);
      setStrengthLabel('');
      return;
    }

    // Calculate strength score
    let score = 0;

    // Length score (max 30 points)
    score += Math.min(30, value.length * 2);

    // Character type scores
    if (/[A-Z]/.test(value)) score += 10; // Uppercase
    if (/[a-z]/.test(value)) score += 10; // Lowercase

    // Numbers (max 20 points)
    const numbers = (value.match(/\d/g) || []).length;
    score += Math.min(20, numbers * 5);

    // Special chars (max 20 points)
    const special = (value.match(/[^A-Za-z0-9]/g) || []).length;
    score += Math.min(20, special * 5);

    // Variety bonus (all 4 character types)
    const charTypes = [
      /[A-Z]/.test(value),
      /[a-z]/.test(value),
      /\d/.test(value),
      /[^A-Za-z0-9]/.test(value),
    ].filter(Boolean).length;

    if (charTypes >= 4) score += 10;

    // Penalize sequential/repeated patterns
    if (hasSequentialChars(value)) score -= 10;
    if (hasRepeatedChars(value)) score -= 10;

    const finalScore = Math.max(0, Math.min(100, score));
    setStrength(finalScore);

    // Set label
    if (finalScore < 40) setStrengthLabel('Weak');
    else if (finalScore < 60) setStrengthLabel('Fair');
    else if (finalScore < 80) setStrengthLabel('Good');
    else setStrengthLabel('Strong');
  }, [value]);

  const hasSequentialChars = (password: string): boolean => {
    const lower = password.toLowerCase();
    // Check for 3+ sequential letters (abc, xyz)
    for (let i = 0; i < lower.length - 2; i++) {
      const substr = lower.substring(i, i + 3);
      if (/^[a-z]{3}$/.test(substr)) {
        if (
          substr.charCodeAt(1) === substr.charCodeAt(0) + 1 &&
          substr.charCodeAt(2) === substr.charCodeAt(1) + 1
        ) {
          return true;
        }
      }
    }
    // Check for 3+ sequential numbers (123, 456)
    for (let i = 0; i < password.length - 2; i++) {
      const substr = password.substring(i, i + 3);
      if (/^\d{3}$/.test(substr)) {
        if (
          parseInt(substr[1]) === parseInt(substr[0]) + 1 &&
          parseInt(substr[2]) === parseInt(substr[1]) + 1
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const hasRepeatedChars = (password: string): boolean => {
    // Check for 3+ repeated characters (aaa, 111)
    for (let i = 0; i < password.length - 2; i++) {
      if (
        password[i] === password[i + 1] &&
        password[i] === password[i + 2]
      ) {
        return true;
      }
    }
    return false;
  };

  const getStrengthColor = () => {
    if (strength < 40) return 'bg-red-500';
    if (strength < 60) return 'bg-orange-500';
    if (strength < 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStrengthTextColor = () => {
    if (strength < 40) return 'text-red-400';
    if (strength < 60) return 'text-orange-400';
    if (strength < 80) return 'text-yellow-400';
    return 'text-green-400';
  };

  const allRulesMet = PASSWORD_RULES.every((rule) => rule.validator(value));

  return (
    <div className="space-y-2">
      <label className="block text-slate-300 text-sm font-medium">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>

      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`w-full bg-slate-700 border rounded-lg px-4 py-3 pr-12 text-white focus:outline-none focus:ring-2 transition-colors ${
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-slate-600 focus:ring-teal-500'
          }`}
          placeholder={placeholder}
          required={required}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff className="w-5 h-5" />
          ) : (
            <Eye className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Show strength indicator and rules when field has value or is focused */}
      {showStrength && (value || focused) && (
        <>
          {/* Strength Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">
                Password Strength:
              </span>
              <span className={`font-semibold ${getStrengthTextColor()}`}>
                {strengthLabel || 'Enter password'}
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${getStrengthColor()}`}
                style={{ width: `${strength}%` }}
              />
            </div>
          </div>

          {/* Validation Rules */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-slate-300 mb-2">
              Password Requirements:
            </div>
            {PASSWORD_RULES.map((rule, index) => {
              const isValid = rule.validator(value);
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 text-xs transition-colors"
                >
                  {isValid ? (
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                  ) : (
                    <X className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  )}
                  <span
                    className={
                      isValid
                        ? 'text-green-400 font-medium'
                        : 'text-slate-400'
                    }
                  >
                    {rule.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Success Message */}
          {allRulesMet && strength >= 80 && (
            <div className="flex items-center gap-2 text-sm text-green-400 bg-green-900/20 border border-green-700 rounded-lg px-3 py-2">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">
                Great! Your password is strong and secure
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
