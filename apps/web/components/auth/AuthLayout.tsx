'use client';

/**
 * Auth Layout Component
 * Two-column layout for login/signup pages - Vuexy Style
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  mode: 'login' | 'register';
}

// Hero slides for the left panel
const heroSlides = [
  {
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
    tagline: 'Automate Your Success',
    subtitle: 'Scale Your Etsy Business',
  },
  {
    image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
    tagline: 'Work Smarter, Not Harder',
    subtitle: 'Smart Automation',
  },
  {
    image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80',
    tagline: 'Reach New Heights',
    subtitle: 'Grow Your Shop Today',
  },
];

export default function AuthLayout({ children, mode }: AuthLayoutProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  // Auto-rotate slides
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen flex bg-[var(--background)]">
      {/* Left Panel - Hero/Brand Section */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-[var(--primary)]">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0">
          {heroSlides.map((slide, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === currentSlide ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <img
                src={slide.image}
                alt={slide.tagline}
                className="w-full h-full object-cover"
                loading={index === 0 ? "eager" : "lazy"}
              />
            </div>
          ))}
          {/* Solid overlay to keep contrast without gradients */}
          <div className="absolute inset-0 bg-[rgba(15,23,42,0.6)]" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col w-full p-10">
          {/* Logo & Back Button */}
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
                <span className="text-[var(--primary)] font-bold text-xl">P</span>
              </div>
              <span className="text-white font-bold text-xl tracking-tight">
                Profitly
              </span>
            </Link>
            <Link
              href="/"
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm text-white text-sm hover:bg-white/20 transition-colors border border-white/10"
            >
              Back to website
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Tagline */}
          <div className="mb-10">
            {heroSlides.map((slide, index) => (
              <div
                key={index}
                className={`transition-all duration-700 ${
                  index === currentSlide
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-4 absolute'
                }`}
              >
                {index === currentSlide && (
                  <>
                    <h2 className="text-5xl font-bold text-white mb-3 leading-tight">
                      {slide.tagline}
                    </h2>
                    <p className="text-xl text-white/70">{slide.subtitle}</p>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Slide Indicators */}
          <div className="flex gap-2">
            {heroSlides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentSlide
                    ? 'w-10 bg-white'
                    : 'w-4 bg-white/30 hover:bg-white/50'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Form Section */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-20 py-12 bg-[var(--card-bg)]">
        <div className="w-full max-w-[440px] mx-auto">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)] flex items-center justify-center">
              <span className="text-white font-bold text-xl">P</span>
            </div>
            <span className="text-[var(--text-primary)] font-bold text-xl">Profitly</span>
          </div>

          {/* Header with mode toggle */}
          <div className="mb-8">
            <h1 className="text-[28px] font-bold text-[var(--text-primary)] mb-2">
              {mode === 'login' ? 'Welcome back! 👋' : 'Adventure starts here 🚀'}
            </h1>
            <p className="text-[var(--text-muted)]">
              {mode === 'login' ? (
                <>
                  New on our platform?{' '}
                  <Link
                    href="/register"
                    className="text-[var(--primary)] hover:underline font-medium"
                  >
                    Create an account
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <Link
                    href="/login"
                    className="text-[var(--primary)] hover:underline font-medium"
                  >
                    Sign in instead
                  </Link>
                </>
              )}
            </p>
          </div>

          {/* Form Content */}
          {children}
        </div>
      </div>
    </div>
  );
}
