import React from 'react';
import { Shield, Lock, Eye, Mail, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
    return (
        <div className="absolute inset-0 overflow-y-auto bg-gray-50 text-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto bg-white shadow-sm rounded-2xl overflow-hidden border border-gray-100">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-10 sm:p-10 text-white relative">
                    <Link to="/login" className="absolute top-6 left-6 text-white/80 hover:text-white flex items-center gap-1.5 text-sm font-medium transition">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Login
                    </Link>
                    <div className="mt-6 flex items-center gap-3">
                        <Shield className="h-10 w-10 text-blue-200" />
                        <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
                    </div>
                    <p className="mt-2 text-blue-100 text-sm max-w-xl">
                        Last Updated: June 10, 2026. This policy explains how GetAiPilot collects, uses, and safeguards your information when using our WhatsApp automation and campaign tools.
                    </p>
                </div>

                {/* Content */}
                <div className="p-6 sm:p-10 space-y-8">
                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-indigo-600 font-semibold text-lg">
                            <Eye className="h-5 w-5" />
                            <h2>1. Information We Collect</h2>
                        </div>
                        <p className="text-sm leading-relaxed text-gray-600">
                            To provide our WhatsApp API-based services (campaigns, live chat, automation, and template management), we collect and process the following categories of data:
                        </p>
                        <ul className="list-disc pl-5 text-sm text-gray-600 space-y-2">
                            <li><strong>Account Data:</strong> When you register on GetAiPilot, we collect your name, email address, password, organization details, and billing information.</li>
                            <li><strong>WhatsApp Business Credentials:</strong> To connect your official WhatsApp Cloud API account, we securely encrypt and store your WhatsApp Business Account ID (WABA ID), Phone Number ID, and API Access Tokens.</li>
                            <li><strong>Contact and Message Logs:</strong> We store contact phone numbers and names uploaded by you to run campaigns, along with log files of incoming/outgoing messages to display live chat history and analytics.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-indigo-600 font-semibold text-lg">
                            <Lock className="h-5 w-5" />
                            <h2>2. How We Use Your Information</h2>
                        </div>
                        <p className="text-sm leading-relaxed text-gray-600">
                            We use the collected information solely to operate, maintain, and provide the features of the GetAiPilot platform, specifically:
                        </p>
                        <ul className="list-disc pl-5 text-sm text-gray-600 space-y-2">
                            <li>To authenticate your identity and secure your organization accounts.</li>
                            <li>To forward messages, media templates, and business notifications to Meta's WhatsApp Cloud API endpoints on your behalf.</li>
                            <li>To provide real-time dashboard analytics, wallet transactions tracking, and usage metrics.</li>
                            <li>To respond to your support queries and optimize server performance.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-indigo-600 font-semibold text-lg">
                            <Shield className="h-5 w-5" />
                            <h2>3. Data Protection and Encryption</h2>
                        </div>
                        <p className="text-sm leading-relaxed text-gray-600">
                            Security is our highest priority. All official WhatsApp Cloud API access tokens and sensitive credentials are encrypted using industry-standard <strong>AES-256-CBC encryption</strong> at rest before being saved to our Supabase database. All communications between your browser, our servers, and Meta API endpoints are encrypted in transit using <strong>SSL/TLS (HTTPS)</strong>.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-indigo-600 font-semibold text-lg">
                            <Mail className="h-5 w-5" />
                            <h2>4. Data Sharing and Third-Party Policy</h2>
                        </div>
                        <p className="text-sm leading-relaxed text-gray-600">
                            GetAiPilot <strong>does not sell, trade, rent, or monetize</strong> your personal data or your customers' contact lists to any third parties. Data is only shared with:
                        </p>
                        <ul className="list-disc pl-5 text-sm text-gray-600 space-y-2">
                            <li><strong>Meta Platforms, Inc. (WhatsApp Cloud API):</strong> To route and deliver the messages you initiate in our platform.</li>
                            <li><strong>Supabase:</strong> Our secure database provider for storing configuration settings and contact records.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-indigo-600 font-semibold text-lg">
                            <Shield className="h-5 w-5" />
                            <h2>5. Your Rights and Data Deletion</h2>
                        </div>
                        <p className="text-sm leading-relaxed text-gray-600">
                            You retain full ownership of your data. You can disconnect your Meta WhatsApp account at any time by clicking the "Disconnect" button in the dashboard, which instantly removes your API access tokens from our servers. If you wish to request a permanent deletion of your organization account and all related subscriber data, you can contact us at our support email.
                        </p>
                    </section>

                    <div className="border-t border-gray-100 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-4">
                        <p>© 2026 GetAiPilot. All rights reserved.</p>
                        <p>Questions? Contact us at: <a href="mailto:getaipilott@gmail.com" className="text-blue-600 hover:underline">getaipilott@gmail.com</a></p>
                    </div>
                </div>
            </div>
        </div>
    );
}
