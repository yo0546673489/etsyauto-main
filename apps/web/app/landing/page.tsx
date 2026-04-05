'use client';

/**
 * Modern SaaS Landing Page
 * Premium cloud-inspired design with smooth animations
 */

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { 
  BarChart3,
  Zap, 
  Shield, 
  Package, 
  TrendingUp,
  Clock,
  Users,
  CheckCircle2,
  ArrowRight,
  Star,
  ChevronDown
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const floatingAnimation = {
  y: [0, -20, 0],
  transition: {
    duration: 6,
    repeat: Infinity,
    ease: "easeInOut"
  }
};

export default function LandingPage() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0]);
  const heroY = useTransform(scrollY, [0, 300], [0, -50]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 relative overflow-hidden">
      {/* Animated Background Clouds */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute top-20 left-10 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"
          animate={{ x: [0, 100, 0], y: [0, -50, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-40 right-20 w-[500px] h-[500px] bg-purple-200/20 rounded-full blur-3xl"
          animate={{ x: [0, -80, 0], y: [0, 60, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-20 left-1/3 w-[400px] h-[400px] bg-indigo-200/20 rounded-full blur-3xl"
          animate={{ x: [0, 60, 0], y: [0, -40, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Navigation */}
      <motion.nav 
        className="relative z-50 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Profix" className="h-9 w-auto" />
        </div>
        <div className="flex items-center gap-6">
          <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</a>
          <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
          <button
            onClick={() => router.push('/login')}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            Sign In
          </button>
          <button
            onClick={() => router.push('/register')}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full hover:shadow-lg hover:scale-105 transition-all"
          >
            Get Started
          </button>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <motion.section 
        className="relative z-10 pt-20 pb-32 px-8"
        style={{ opacity: heroOpacity, y: heroY }}
      >
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100/60 backdrop-blur-sm rounded-full text-blue-700 text-sm font-medium mb-6">
              <Zap className="w-4 h-4" />
              Smart Profix
            </div>
          </motion.div>

          <motion.h1
            className="text-6xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            Empower Your Business
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
              With Smarter Insights
            </span>
          </motion.h1>

          <motion.p
            className="text-xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Transform your Etsy shop with smart automation. Manage listings, generate compelling content,
            and track orders—all in one beautiful platform designed for modern sellers.
          </motion.p>

          <motion.div
            className="flex items-center justify-center gap-4 mb-16"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <button
              onClick={() => router.push('/register')}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:shadow-2xl hover:scale-105 transition-all flex items-center gap-2"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => router.push('/docs')}
              className="px-8 py-4 bg-white/60 backdrop-blur-sm border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-white hover:shadow-lg transition-all flex items-center gap-2"
            >
              <BarChart3 className="w-5 h-5" />
              View Demo
            </button>
          </motion.div>

          {/* Floating Dashboard Mockup */}
          <motion.div
            className="relative max-w-5xl mx-auto"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6 }}
          >
            <motion.div
              animate={floatingAnimation}
              className="relative rounded-2xl shadow-2xl border border-gray-200/50 overflow-hidden backdrop-blur-xl bg-white/80"
            >
              {/* Dashboard Preview */}
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="text-sm text-gray-400">Dashboard</div>
                </div>
                
                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Products', value: '1,234', change: '+12%', color: 'blue' },
                    { label: 'Orders', value: '567', change: '+18%', color: 'purple' },
                    { label: 'Revenue', value: '$45.2K', change: '+24%', color: 'green' },
                    { label: 'Customers', value: '890', change: '+15%', color: 'indigo' }
                  ].map((stat, i) => (
                    <motion.div
                      key={i}
                      className="p-4 bg-gradient-to-br from-white to-gray-50 rounded-xl border border-gray-100"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.8 + i * 0.1 }}
                    >
                      <div className="text-sm text-gray-500 mb-1">{stat.label}</div>
                      <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                      <div className="text-xs text-green-600 font-medium">{stat.change}</div>
                    </motion.div>
                  ))}
                </div>

                {/* Chart Preview */}
                <div className="h-48 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl flex items-center justify-center border border-blue-100">
                  <svg className="w-full h-full p-6" viewBox="0 0 400 150">
                    {/* Animated line chart path */}
                    <motion.path
                      d="M 10 130 Q 60 100, 100 80 T 190 60 T 280 50 T 390 30"
                      stroke="url(#gradient)"
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 2, delay: 1 }}
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </motion.div>

            {/* Floating elements around dashboard */}
            <motion.div
              className="absolute -top-4 -right-4 p-4 bg-white rounded-xl shadow-xl border border-gray-100"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <TrendingUp className="w-6 h-6 text-green-600" />
            </motion.div>
            <motion.div
              className="absolute -bottom-4 -left-4 p-4 bg-white rounded-xl shadow-xl border border-gray-100"
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            >
              <Zap className="w-6 h-6 text-yellow-600" />
            </motion.div>
          </motion.div>
        </div>
      </motion.section>

      {/* Feature Section */}
      <section id="features" className="relative z-10 py-24 px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeInUp}
          >
            <h2 className="text-5xl font-bold text-gray-900 mb-4">
              Everything You Need to Build a
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"> SaaS Product</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Powerful features designed to help you sell smarter, faster, and more efficiently on Etsy.
            </p>
          </motion.div>

          <motion.div
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
          >
            {[
              {
                icon: Users,
                title: 'Team Collaboration',
                description: 'Invite team members with role-based access control. Manage multiple shops from one dashboard.',
                gradient: 'from-blue-500 to-cyan-500'
              },
              {
                icon: BarChart3,
                title: 'Advanced Analytics',
                description: 'Track sales, customer behavior, and inventory with real-time dashboards and insights.',
                gradient: 'from-purple-500 to-pink-500'
              },
              {
                icon: Package,
                title: 'Bulk Management',
                description: 'Manage thousands of listings at once with intelligent bulk operations and CSV imports.',
                gradient: 'from-green-500 to-emerald-500'
              },
              {
                icon: Clock,
                title: 'Smart Scheduling',
                description: 'Schedule listings to publish at optimal times based on your audience and market trends.',
                gradient: 'from-orange-500 to-red-500'
              },
              {
                icon: Shield,
                title: 'Policy Compliance',
                description: 'Built-in Etsy policy checker ensures your listings comply with marketplace rules.',
                gradient: 'from-indigo-500 to-blue-500'
              },
              {
                icon: Users,
                title: 'Team Collaboration',
                description: 'Invite team members with granular permissions and role-based access control.',
                gradient: 'from-violet-500 to-purple-500'
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                variants={fadeInUp}
                whileHover={{ y: -8, scale: 1.02 }}
                className="group p-6 bg-white/60 backdrop-blur-md rounded-2xl border border-gray-200/50 hover:border-gray-300/50 hover:shadow-2xl transition-all cursor-pointer"
              >
                <div className={`w-14 h-14 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Use Case Section */}
      <section className="relative z-10 py-24 px-8 bg-white/40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <h2 className="text-4xl font-bold text-gray-900 mb-6">
                Plan for Multiple Shops,<br />One Powerful Platform
              </h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Whether you manage one Etsy shop or dozens, our platform scales with your business. 
                Connect multiple shops, assign teams, and maintain complete control over your operations.
              </p>
              <ul className="space-y-4">
                {[
                  'Multi-shop dashboard with unified analytics',
                  'Per-shop team permissions and access control',
                  'Automated syncing across all your stores',
                  'Cross-shop inventory and order management'
                ].map((item, i) => (
                  <motion.li
                    key={i}
                    className="flex items-center gap-3"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <span className="text-gray-700">{item}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              className="relative"
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <div className="p-6 bg-white/60 backdrop-blur-md rounded-2xl border border-gray-200/50 shadow-xl">
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg" />
                      <div className="flex-1">
                        <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                        <div className="h-2 bg-gray-100 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Integration Section */}
      <section className="relative z-10 py-24 px-8">
        <div className="max-w-7xl mx-auto text-center">
          <motion.h2
            className="text-4xl font-bold text-gray-900 mb-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            Connect With the Tools You Love
          </motion.h2>
          <motion.p
            className="text-xl text-gray-600 mb-12"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            Seamlessly integrate with your existing workflow
          </motion.p>

          <motion.div
            className="grid grid-cols-3 md:grid-cols-6 gap-8 items-center"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {['Etsy', 'Stripe', 'Shopify', 'Google', 'Slack', 'Notion'].map((tool, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                whileHover={{ scale: 1.1, y: -5 }}
                className="p-6 bg-white/60 backdrop-blur-sm rounded-xl border border-gray-200/50 hover:shadow-lg transition-all"
              >
                <div className="h-12 flex items-center justify-center text-gray-700 font-semibold">
                  {tool}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative z-10 py-24 px-8 bg-gradient-to-br from-blue-50/50 to-purple-50/50">
        <div className="max-w-7xl mx-auto">
          <motion.h2
            className="text-4xl font-bold text-gray-900 mb-12 text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            Trusted by Etsy Sellers Worldwide
          </motion.h2>

          <motion.div
            className="grid md:grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {[
              {
                quote: "This platform transformed how I manage my Etsy shop. The automation alone saves me hours every week.",
                author: "Sarah Johnson",
                role: "Jewelry Shop Owner",
                rating: 5,
                avatar: "SJ"
              },
              {
                quote: "The multi-shop management is incredible. I can now handle all three of my stores from one dashboard.",
                author: "Michael Chen",
                role: "Print-on-Demand Seller",
                rating: 5,
                avatar: "MC"
              },
              {
                quote: "Best investment for my Etsy business. The analytics helped me identify my best-selling products.",
                author: "Emma Rodriguez",
                role: "Handmade Crafts",
                rating: 5,
                avatar: "ER"
              }
            ].map((testimonial, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 6 + i, repeat: Infinity, ease: "easeInOut" }}
                className="p-6 bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200/50 shadow-lg"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 leading-relaxed">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{testimonial.author}</div>
                    <div className="text-sm text-gray-500">{testimonial.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="relative z-10 py-24 px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            <h2 className="text-5xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h2>
            <p className="text-xl text-gray-600">Choose the perfect plan for your business</p>
          </motion.div>

          <motion.div
            className="grid md:grid-cols-4 gap-6"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {[
              {
                name: 'Starter',
                price: 'Free',
                period: 'forever',
                features: ['1 Etsy Shop', '50 Products', 'Basic Analytics', 'Email Support'],
                highlighted: false
              },
              {
                name: 'Pro',
                price: '$29',
                period: '/month',
                features: ['3 Etsy Shops', '500 Products', 'Team Collaboration', 'Advanced Analytics', 'Priority Support'],
                highlighted: false
              },
              {
                name: 'Business',
                price: '$79',
                period: '/month',
                features: ['10 Etsy Shops', 'Unlimited Products', 'Team Collaboration', 'White-label Options', '24/7 Support'],
                highlighted: true
              },
              {
                name: 'Enterprise',
                price: 'Custom',
                period: '',
                features: ['Unlimited Shops', 'Custom Integration', 'Dedicated Account Manager', 'SLA Guarantee'],
                highlighted: false
              }
            ].map((plan, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                whileHover={{ y: -12, scale: 1.03 }}
                className={`relative p-8 rounded-2xl border ${
                  plan.highlighted
                    ? 'bg-gradient-to-br from-blue-600 to-purple-600 border-transparent text-white shadow-2xl'
                    : 'bg-white/60 backdrop-blur-md border-gray-200/50 hover:shadow-xl'
                } transition-all`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-yellow-400 text-gray-900 text-sm font-bold rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className={`text-2xl font-bold mb-2 ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                  {plan.name}
                </h3>
                <div className="mb-6">
                  <span className={`text-4xl font-bold ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                    {plan.price}
                  </span>
                  <span className={plan.highlighted ? 'text-blue-100' : 'text-gray-500'}>
                    {plan.period}
                  </span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, fi) => (
                    <li key={fi} className="flex items-center gap-2">
                      <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${plan.highlighted ? 'text-blue-200' : 'text-green-600'}`} />
                      <span className={plan.highlighted ? 'text-blue-50' : 'text-gray-600'}>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => router.push('/register')}
                  className={`w-full py-3 rounded-xl font-semibold transition-all ${
                    plan.highlighted
                      ? 'bg-white text-blue-600 hover:bg-blue-50'
                      : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:shadow-lg hover:scale-105'
                  }`}
                >
                  Get Started
                </button>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="relative z-10 py-24 px-8">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            className="text-4xl font-bold text-gray-900 mb-12 text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
          >
            Frequently Asked Questions
          </motion.h2>

          <div className="space-y-4">
            {[
              {
                q: 'Can I manage multiple Etsy shops?',
                a: 'Yes! You can connect and manage multiple Etsy shops from a single dashboard, with per-shop analytics and team access controls.'
              },
              {
                q: 'Is my data secure?',
                a: 'Absolutely. We use enterprise-grade encryption for all OAuth tokens and sensitive data. Your shop credentials are never exposed.'
              },
              {
                q: 'What happens to my free trial?',
                a: 'Your free trial gives you full access to all Pro features for 14 days. No credit card required. Cancel anytime.'
              }
            ].map((faq, i) => (
              <motion.div
                key={i}
                className="bg-white/60 backdrop-blur-md rounded-xl border border-gray-200/50 overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors"
                >
                  <span className="font-semibold text-gray-900">{faq.q}</span>
                  <motion.div
                    animate={{ rotate: openFaq === i ? 180 : 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  </motion.div>
                </button>
                <motion.div
                  initial={false}
                  animate={{ height: openFaq === i ? 'auto' : 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-5 text-gray-600 leading-relaxed">
                    {faq.a}
                  </div>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-32 px-8">
        <motion.div
          className="max-w-4xl mx-auto text-center p-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-3xl shadow-2xl"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeInUp}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Scale Your Etsy Business?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of sellers who have transformed their Etsy shops with intelligent automation.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => router.push('/register')}
              className="px-8 py-4 bg-white text-blue-600 rounded-xl font-semibold hover:shadow-2xl hover:scale-105 transition-all"
            >
              Start Free Trial
            </button>
            <button
              onClick={() => router.push('/login')}
              className="px-8 py-4 bg-white/10 backdrop-blur-sm border border-white/30 text-white rounded-xl font-semibold hover:bg-white/20 transition-all"
            >
              Sign In
            </button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 px-8 border-t border-gray-200/50 bg-white/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/logo.png" alt="Profix" className="h-8 w-auto" />
              </div>
              <p className="text-gray-600 text-sm">
                Smart automation for modern Etsy sellers.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="#features" className="hover:text-gray-900 transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a></li>
                <li><a href="/docs" className="hover:text-gray-900 transition-colors">Documentation</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="/terms" className="hover:text-gray-900 transition-colors">Terms</a></li>
                <li><a href="/privacy" className="hover:text-gray-900 transition-colors">Privacy</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Support</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="mailto:support@example.com" className="hover:text-gray-900 transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-200/50 text-center text-sm text-gray-500">
            © 2026 Profix. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
